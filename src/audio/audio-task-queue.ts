import { createAbortError, describeAudioError } from './audio-errors.ts'
import { WebAudioBackend } from './web-audio-backend.ts'
import type {
  AudioBackend,
  AudioQueueController,
  AudioTask,
  AudioTaskListener,
  AudioTaskSnapshot,
  AudioTaskStatus,
  FetchAudio,
  Unsubscribe,
} from './types.ts'

export const MAX_CONCURRENT_AUDIO_TASKS = 2

const allowedTransitions: Readonly<Record<AudioTaskStatus, readonly AudioTaskStatus[]>> = {
  queued: ['downloading', 'cancelled'],
  downloading: ['decoding', 'cancelled', 'error'],
  decoding: ['ready', 'cancelled', 'error'],
  ready: ['playing', 'cancelled'],
  playing: ['ready', 'completed', 'cancelled', 'error'],
  completed: [],
  cancelled: [],
  error: [],
}

interface AudioTaskRecord extends AudioTask {
  buffer: AudioBuffer | null
  settled: boolean
  resolve: (buffer: AudioBuffer) => void
  reject: (reason: unknown) => void
}

export interface AudioTaskQueueOptions {
  fetchAudio?: FetchAudio
  backend?: AudioBackend
}

export class AudioTaskQueue implements AudioQueueController {
  private readonly fetchAudio: FetchAudio
  private readonly backend: AudioBackend
  private readonly tasks = new Map<number, AudioTaskRecord>()
  private readonly tasksByOrder = new Map<number, AudioTaskRecord>()
  private readonly workQueue: AudioTaskRecord[] = []
  private readonly listeners = new Set<AudioTaskListener>()
  private nextTaskId = 1
  private nextTaskOrder = 1
  private workCursor = 0
  private activeWorkers = 0
  private playbackCursor = 1
  private activePlaybackId: number | null = null
  private playbackRequested = false
  private disposed = false
  private disposePromise: Promise<void> | null = null

  constructor(options: AudioTaskQueueOptions = {}) {
    this.fetchAudio = options.fetchAudio ?? ((input, init) => fetch(input, init))
    this.backend = options.backend ?? new WebAudioBackend()
  }

  enqueue(trackUrl: string): Promise<AudioBuffer> {
    if (this.disposed) {
      return Promise.reject(createAbortError('The audio queue has been disposed.'))
    }

    let resolveTask!: (buffer: AudioBuffer) => void
    let rejectTask!: (reason: unknown) => void
    const promise = new Promise<AudioBuffer>((resolve, reject) => {
      resolveTask = resolve
      rejectTask = reject
    })

    const task: AudioTaskRecord = {
      id: this.nextTaskId,
      order: this.nextTaskOrder,
      trackUrl,
      status: 'queued',
      abortController: new AbortController(),
      buffer: null,
      settled: false,
      resolve: resolveTask,
      reject: rejectTask,
    }
    this.nextTaskId += 1
    this.nextTaskOrder += 1
    this.tasks.set(task.id, task)
    this.tasksByOrder.set(task.order, task)
    this.workQueue.push(task)
    this.notify()
    this.pumpWorkers()
    return promise
  }

  cancelTask(taskId: number): boolean {
    const task = this.tasks.get(taskId)
    if (!task || this.isTerminal(task.status)) {
      return false
    }

    task.abortController.abort()
    if (this.activePlaybackId === task.id) {
      this.activePlaybackId = null
      try {
        this.backend.stop()
      } catch {
        // The task still becomes cancelled; dispose will retry resource cleanup.
      }
      this.playbackCursor = task.order + 1
    }
    this.transition(task, 'cancelled')
    task.buffer = null
    this.settleRejected(task, createAbortError())
    this.notify()
    this.pumpWorkers()
    this.pumpPlayback()
    return true
  }

  async startPlayback(): Promise<void> {
    if (this.disposed) {
      throw createAbortError('The audio queue has been disposed.')
    }

    this.playbackRequested = true
    try {
      await this.backend.resume()
    } catch (error) {
      this.playbackRequested = false
      throw error
    }

    if (!this.disposed) {
      this.pumpPlayback()
    }
  }

  stopPlayback(): void {
    if (this.disposed) {
      return
    }

    this.playbackRequested = false
    const taskId = this.activePlaybackId
    this.activePlaybackId = null
    if (taskId === null) {
      return
    }

    const task = this.tasks.get(taskId)
    try {
      this.backend.stop()
    } catch (error) {
      if (task?.status === 'playing') {
        this.transition(task, 'error', describeAudioError(error))
        task.buffer = null
        this.playbackCursor = task.order + 1
        this.notify()
        return
      }
    }

    if (task?.status === 'playing') {
      this.transition(task, 'ready')
      this.notify()
    }
  }

  getTasks(): readonly AudioTaskSnapshot[] {
    return Array.from(this.tasks.values(), (task) => this.toSnapshot(task))
  }

  getAnalyser(): AnalyserNode | null {
    return this.backend.getAnalyser()
  }

  subscribe(listener: AudioTaskListener): Unsubscribe {
    if (this.disposed) {
      return () => undefined
    }
    this.listeners.add(listener)
    listener(this.getTasks())
    return () => {
      this.listeners.delete(listener)
    }
  }

  verifyInvariants(): boolean {
    if (this.activeWorkers < 0 || this.activeWorkers > MAX_CONCURRENT_AUDIO_TASKS) {
      return false
    }

    let playingCount = 0
    const ids = new Set<number>()
    const orders = new Set<number>()
    for (const [id, task] of this.tasks) {
      if (id !== task.id || ids.has(task.id) || orders.has(task.order)) {
        return false
      }
      ids.add(task.id)
      orders.add(task.order)

      if ((task.status === 'ready' || task.status === 'playing') && task.buffer === null) {
        return false
      }
      if (this.isTerminal(task.status) && (!task.settled || task.buffer !== null)) {
        return false
      }
      const canStillSettle = task.status === 'queued' || task.status === 'downloading' || task.status === 'decoding'
      if (canStillSettle === task.settled) {
        return false
      }
      if (task.status === 'playing') {
        playingCount += 1
        if (this.activePlaybackId !== task.id) {
          return false
        }
      }
    }

    return this.activePlaybackId === null ? playingCount === 0 : playingCount === 1
  }

  dispose(): Promise<void> {
    if (this.disposePromise) {
      return this.disposePromise
    }

    this.disposed = true
    this.playbackRequested = false
    this.activePlaybackId = null
    try {
      this.backend.stop()
    } catch {
      // Continue disposing the rest of the resources even if stop fails.
    }

    for (const task of this.tasks.values()) {
      if (!this.isTerminal(task.status)) {
        task.abortController.abort()
        this.transition(task, 'cancelled')
        this.settleRejected(task, createAbortError('The audio queue has been disposed.'))
      }
      task.buffer = null
    }
    this.listeners.clear()
    this.workQueue.length = 0
    try {
      this.disposePromise = Promise.resolve(this.backend.dispose())
    } catch (error) {
      this.disposePromise = Promise.reject(error)
    }
    return this.disposePromise
  }

  private pumpWorkers(): void {
    if (this.disposed) {
      return
    }

    while (this.activeWorkers < MAX_CONCURRENT_AUDIO_TASKS && this.workCursor < this.workQueue.length) {
      const task = this.workQueue[this.workCursor]
      this.workCursor += 1
      if (!task || task.status !== 'queued') {
        continue
      }
      this.activeWorkers += 1
      void this.processTask(task)
    }
  }

  private async processTask(task: AudioTaskRecord): Promise<void> {
    try {
      this.transition(task, 'downloading')
      this.notify()
      const response = await this.fetchAudio(task.trackUrl, { signal: task.abortController.signal })
      if (this.shouldIgnore(task)) {
        return
      }
      if (!response.ok) {
        throw new Error(`Audio request failed with HTTP status ${response.status}.`)
      }

      const encodedAudio = await response.arrayBuffer()
      if (this.shouldIgnore(task)) {
        return
      }

      this.transition(task, 'decoding')
      this.notify()
      const decodedAudio = await this.backend.decode(encodedAudio)
      if (this.shouldIgnore(task)) {
        return
      }

      task.buffer = decodedAudio
      this.transition(task, 'ready')
      this.settleResolved(task, decodedAudio)
      this.notify()
      this.pumpPlayback()
    } catch (error) {
      if (this.shouldIgnore(task)) {
        return
      }
      this.transition(task, 'error', describeAudioError(error))
      this.settleRejected(task, error)
      this.notify()
      this.pumpPlayback()
    } finally {
      this.activeWorkers -= 1
      this.pumpWorkers()
    }
  }

  private pumpPlayback(): void {
    if (this.disposed || !this.playbackRequested || this.activePlaybackId !== null) {
      return
    }

    while (true) {
      const task = this.tasksByOrder.get(this.playbackCursor)
      if (!task) {
        return
      }

      if (task.status === 'cancelled' || task.status === 'error' || task.status === 'completed') {
        this.playbackCursor += 1
        continue
      }
      if (task.status !== 'ready' || !task.buffer) {
        return
      }

      this.activePlaybackId = task.id
      this.transition(task, 'playing')
      this.notify()
      try {
        this.backend.play(task.buffer, () => this.handlePlaybackEnded(task.id))
      } catch (error) {
        this.handlePlaybackError(task.id, error)
      }
      return
    }
  }

  private handlePlaybackEnded(taskId: number): void {
    const task = this.tasks.get(taskId)
    if (this.disposed || !task || this.activePlaybackId !== taskId || task.status !== 'playing') {
      return
    }

    this.activePlaybackId = null
    this.transition(task, 'completed')
    task.buffer = null
    this.playbackCursor = task.order + 1
    this.notify()
    this.pumpPlayback()
  }

  private handlePlaybackError(taskId: number, error: unknown): void {
    const task = this.tasks.get(taskId)
    if (this.disposed || !task || this.activePlaybackId !== taskId || task.status !== 'playing') {
      return
    }

    this.activePlaybackId = null
    task.abortController.abort()
    this.transition(task, 'error', describeAudioError(error))
    task.buffer = null
    this.playbackCursor = task.order + 1
    this.notify()
    this.pumpPlayback()
  }

  private shouldIgnore(task: AudioTaskRecord): boolean {
    return this.disposed || task.abortController.signal.aborted || task.status === 'cancelled'
  }

  private isTerminal(status: AudioTaskStatus): boolean {
    return status === 'cancelled' || status === 'completed' || status === 'error'
  }

  private transition(task: AudioTaskRecord, status: AudioTaskStatus, error?: string): void {
    if (!allowedTransitions[task.status].includes(status)) {
      throw new Error(`Invalid audio task transition: ${task.status} -> ${status}.`)
    }
    task.status = status
    if (error) {
      task.error = error
    } else {
      delete task.error
    }
  }

  private settleResolved(task: AudioTaskRecord, buffer: AudioBuffer): void {
    if (task.settled) {
      return
    }
    task.settled = true
    task.resolve(buffer)
  }

  private settleRejected(task: AudioTaskRecord, error: unknown): void {
    if (task.settled) {
      return
    }
    task.settled = true
    task.reject(error)
  }

  private toSnapshot(task: AudioTaskRecord): AudioTaskSnapshot {
    const snapshot: {
      id: number
      order: number
      trackUrl: string
      status: AudioTask['status']
      error?: string
    } = {
      id: task.id,
      order: task.order,
      trackUrl: task.trackUrl,
      status: task.status,
    }
    if (task.error) {
      snapshot.error = task.error
    }
    return snapshot
  }

  private notify(): void {
    if (this.listeners.size === 0) {
      return
    }

    const snapshots = this.getTasks()
    for (const listener of this.listeners) {
      try {
        listener(snapshots)
      } catch {
        // A view listener must not interrupt queue processing.
      }
    }
  }
}
