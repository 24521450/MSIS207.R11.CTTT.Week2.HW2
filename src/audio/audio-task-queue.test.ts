import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioTaskQueue, MAX_CONCURRENT_AUDIO_TASKS } from './audio-task-queue.ts'
import type { AudioBackend, FetchAudio } from './types.ts'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function response(marker: number, options: { ok?: boolean; status?: number } = {}): Response {
  const bytes = new Uint8Array([marker])
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    arrayBuffer: async () => bytes.slice().buffer,
  } as Response
}

function fakeBuffer(label: number): AudioBuffer {
  return { label } as unknown as AudioBuffer
}

class FakeAudioBackend implements AudioBackend {
  readonly decodes: Array<{ marker: number; operation: Deferred<AudioBuffer> }> = []
  readonly played: number[] = []
  readonly endedHandlers: Array<() => void> = []
  readonly resume = vi.fn(async () => undefined)
  readonly stop = vi.fn(() => {
    this.activeEndedIndex = null
  })
  readonly dispose = vi.fn(async () => undefined)
  failStartFor: number | null = null
  private activeEndedIndex: number | null = null

  decode(data: ArrayBuffer): Promise<AudioBuffer> {
    const marker = new Uint8Array(data)[0] ?? 0
    const operation = deferred<AudioBuffer>()
    this.decodes.push({ marker, operation })
    return operation.promise
  }

  play(buffer: AudioBuffer, onEnded: () => void): void {
    const label = (buffer as unknown as { label: number }).label
    if (this.failStartFor === label) {
      throw new Error(`Playback failed for sample ${label}.`)
    }
    this.played.push(label)
    this.endedHandlers.push(onEnded)
    this.activeEndedIndex = this.endedHandlers.length - 1
  }

  getAnalyser(): AnalyserNode | null {
    return null
  }

  finishCurrent(): void {
    const index = this.activeEndedIndex
    this.activeEndedIndex = null
    if (index !== null) {
      this.endedHandlers[index]?.()
    }
  }

  fireLateEnd(index: number): void {
    this.endedHandlers[index]?.()
  }
}

interface PendingFetch {
  url: string
  signal: AbortSignal | undefined
  operation: Deferred<Response>
}

function createHarness() {
  const requests: PendingFetch[] = []
  const fetchAudio: FetchAudio = (input, init) => {
    const operation = deferred<Response>()
    requests.push({ url: String(input), signal: init?.signal ?? undefined, operation })
    return operation.promise
  }
  const backend = new FakeAudioBackend()
  const queue = new AudioTaskQueue({ fetchAudio, backend })
  return { queue, backend, requests }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AudioTaskQueue', () => {
  it('limits pipelines to two and plays ready buffers in enqueue order when completion order is reversed', async () => {
    const { queue, backend, requests } = createHarness()
    const first = queue.enqueue('first.wav')
    const second = queue.enqueue('second.wav')
    const third = queue.enqueue('third.wav')
    const fourth = queue.enqueue('fourth.wav')

    expect(MAX_CONCURRENT_AUDIO_TASKS).toBe(2)
    expect(requests.map((request) => request.url)).toEqual(['first.wav', 'second.wav'])
    await queue.startPlayback()

    requests[1]?.operation.resolve(response(2))
    await flushMicrotasks()
    expect(backend.decodes.map((decode) => decode.marker)).toEqual([2])
    expect(requests).toHaveLength(2)

    backend.decodes[0]?.operation.resolve(fakeBuffer(2))
    await second
    await flushMicrotasks()
    expect(backend.played).toEqual([])
    expect(requests.map((request) => request.url)).toEqual(['first.wav', 'second.wav', 'third.wav'])

    requests[2]?.operation.resolve(response(3))
    await flushMicrotasks()
    backend.decodes[1]?.operation.resolve(fakeBuffer(3))
    await third
    await flushMicrotasks()
    expect(backend.played).toEqual([])

    requests[0]?.operation.resolve(response(1))
    await flushMicrotasks()
    backend.decodes[2]?.operation.resolve(fakeBuffer(1))
    await first
    await flushMicrotasks()
    expect(backend.played).toEqual([1])

    backend.finishCurrent()
    expect(backend.played).toEqual([1, 2])
    backend.finishCurrent()
    expect(backend.played).toEqual([1, 2, 3])
    backend.finishCurrent()
    expect(queue.getTasks().map((task) => task.status)).toEqual(['completed', 'completed', 'completed', 'downloading'])

    requests[3]?.operation.resolve(response(4))
    await flushMicrotasks()
    backend.decodes[3]?.operation.resolve(fakeBuffer(4))
    await fourth
    expect(backend.played).toEqual([1, 2, 3, 4])
    backend.finishCurrent()

    expect(queue.getTasks().map((task) => task.status)).toEqual(['completed', 'completed', 'completed', 'completed'])
    expect(queue.verifyInvariants()).toBe(true)
    await queue.dispose()
  })

  it('cancels a queued task and starts the next non-cancelled FIFO item when a slot opens', async () => {
    const { queue, backend, requests } = createHarness()
    const first = queue.enqueue('first.wav')
    const second = queue.enqueue('second.wav')
    const third = queue.enqueue('third.wav')
    const fourth = queue.enqueue('fourth.wav')
    const thirdRejection = expect(third).rejects.toMatchObject({ name: 'AbortError' })

    expect(queue.cancelTask(3)).toBe(true)
    expect(queue.getTasks()[2]?.status).toBe('cancelled')
    expect(requests.map((request) => request.url)).toEqual(['first.wav', 'second.wav'])

    requests[0]?.operation.resolve(response(1))
    await flushMicrotasks()
    backend.decodes[0]?.operation.resolve(fakeBuffer(1))
    await first
    await flushMicrotasks()
    expect(requests.map((request) => request.url)).toEqual(['first.wav', 'second.wav', 'fourth.wav'])

    requests[1]?.operation.resolve(response(2))
    requests[2]?.operation.resolve(response(4))
    await flushMicrotasks()
    backend.decodes[1]?.operation.resolve(fakeBuffer(2))
    backend.decodes[2]?.operation.resolve(fakeBuffer(4))
    await Promise.all([second, fourth])
    await thirdRejection
    expect(queue.getTasks()[2]?.status).toBe('cancelled')
    expect(queue.verifyInvariants()).toBe(true)
    await queue.dispose()
  })

  it('aborts a downloading request, rejects once, and starts the next request', async () => {
    const requests: PendingFetch[] = []
    const fetchAudio: FetchAudio = (input, init) => {
      const operation = deferred<Response>()
      requests.push({ url: String(input), signal: init?.signal ?? undefined, operation })
      init?.signal?.addEventListener('abort', () => operation.reject(init.signal?.reason), { once: true })
      return operation.promise
    }
    const backend = new FakeAudioBackend()
    const queue = new AudioTaskQueue({ fetchAudio, backend })
    const pending = queue.enqueue('abort-me.wav')
    const next = queue.enqueue('next.wav')
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    const rejected = vi.fn()
    void pending.catch(rejected)

    expect(queue.cancelTask(1)).toBe(true)
    await rejection
    await flushMicrotasks()
    expect(requests.map((request) => request.url)).toEqual(['abort-me.wav', 'next.wav'])
    requests[1]?.operation.resolve(response(2))
    await flushMicrotasks()
    backend.decodes[0]?.operation.resolve(fakeBuffer(2))
    await next

    expect(requests[0]?.signal?.aborted).toBe(true)
    expect(requests[0]?.signal).not.toBe(requests[1]?.signal)
    expect(rejected).toHaveBeenCalledTimes(1)
    expect(queue.getTasks().map((task) => task.status)).toEqual(['cancelled', 'ready'])
    expect(queue.verifyInvariants()).toBe(true)
    await queue.dispose()
  })

  it('ignores a late decode after cancellation and lets the next queued task run', async () => {
    const { queue, backend, requests } = createHarness()
    const first = queue.enqueue('decode-cancel.wav')
    const second = queue.enqueue('next-after-decode.wav')
    const third = queue.enqueue('third.wav')
    const firstRejection = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await queue.startPlayback()
    requests[0]?.operation.resolve(response(1))
    await flushMicrotasks()
    expect(queue.getTasks()[0]?.status).toBe('decoding')
    expect(requests.map((request) => request.url)).toEqual(['decode-cancel.wav', 'next-after-decode.wav'])

    expect(queue.cancelTask(1)).toBe(true)
    await firstRejection
    backend.decodes[0]?.operation.resolve(fakeBuffer(1))
    await flushMicrotasks()
    expect(queue.getTasks()[0]?.status).toBe('cancelled')
    expect(requests.map((request) => request.url)).toEqual([
      'decode-cancel.wav',
      'next-after-decode.wav',
      'third.wav',
    ])

    requests[1]?.operation.resolve(response(2))
    requests[2]?.operation.resolve(response(3))
    await flushMicrotasks()
    backend.decodes[1]?.operation.resolve(fakeBuffer(2))
    await second
    backend.decodes[2]?.operation.resolve(fakeBuffer(3))
    await third

    expect(queue.getTasks().map((task) => task.status)).toEqual(['cancelled', 'playing', 'ready'])
    expect(backend.played).toEqual([2])
    backend.finishCurrent()
    expect(backend.played).toEqual([2, 3])
    backend.finishCurrent()
    expect(queue.verifyInvariants()).toBe(true)
    await queue.dispose()
  })
  it('cancels a ready task without changing its already-resolved promise', async () => {
    const { queue, backend, requests } = createHarness()
    const first = queue.enqueue('cancel-ready.wav')
    const second = queue.enqueue('keep-ready.wav')
    requests[0]?.operation.resolve(response(1))
    requests[1]?.operation.resolve(response(2))
    await flushMicrotasks()
    backend.decodes[0]?.operation.resolve(fakeBuffer(1))
    backend.decodes[1]?.operation.resolve(fakeBuffer(2))
    await expect(first).resolves.toEqual(fakeBuffer(1))
    await second

    expect(queue.cancelTask(1)).toBe(true)
    await queue.startPlayback()
    expect(queue.getTasks().map((task) => task.status)).toEqual(['cancelled', 'playing'])
    expect(backend.played).toEqual([2])
    backend.finishCurrent()
    expect(queue.getTasks().map((task) => task.status)).toEqual(['cancelled', 'completed'])
    expect(queue.verifyInvariants()).toBe(true)
    await queue.dispose()
  })

  it('cancels a playing task and ignores its late end callback', async () => {
    const { queue, backend, requests } = createHarness()
    const first = queue.enqueue('playing-cancel.wav')
    const second = queue.enqueue('next-playing.wav')
    requests[0]?.operation.resolve(response(1))
    requests[1]?.operation.resolve(response(2))
    await flushMicrotasks()
    backend.decodes[0]?.operation.resolve(fakeBuffer(1))
    backend.decodes[1]?.operation.resolve(fakeBuffer(2))
    await Promise.all([first, second])
    await queue.startPlayback()

    expect(queue.cancelTask(1)).toBe(true)
    expect(queue.getTasks().map((task) => task.status)).toEqual(['cancelled', 'playing'])
    backend.fireLateEnd(0)
    expect(queue.getTasks()[1]?.status).toBe('playing')
    backend.finishCurrent()
    expect(queue.getTasks()[1]?.status).toBe('completed')
    expect(backend.stop).toHaveBeenCalledTimes(1)
    expect(queue.verifyInvariants()).toBe(true)
    await queue.dispose()
  })

  it('skips failed fetches and decodes so later tasks continue', async () => {
    const { queue, backend, requests } = createHarness()
    const failedFetch = queue.enqueue('http-error.wav')
    const failedDecode = queue.enqueue('decode-error.wav')
    const succeeding = queue.enqueue('success.wav')
    const fetchError = expect(failedFetch).rejects.toThrow('HTTP status 503')
    const decodeError = expect(failedDecode).rejects.toThrow('unsupported format')
    await queue.startPlayback()

    requests[0]?.operation.resolve(response(1, { ok: false, status: 503 }))
    await flushMicrotasks()
    requests[1]?.operation.resolve(response(2))
    await flushMicrotasks()
    backend.decodes[0]?.operation.reject(new Error('unsupported format'))
    await flushMicrotasks()
    requests[2]?.operation.resolve(response(3))
    await flushMicrotasks()
    backend.decodes[1]?.operation.resolve(fakeBuffer(3))
    await succeeding
    await Promise.all([fetchError, decodeError])

    expect(queue.getTasks().map((task) => task.status)).toEqual(['error', 'error', 'playing'])
    expect(queue.getTasks()[0]?.error).toContain('503')
    expect(queue.getTasks()[1]?.error).toContain('unsupported format')
    expect(backend.played).toEqual([3])
    backend.finishCurrent()
    expect(queue.verifyInvariants()).toBe(true)
    await queue.dispose()
  })

  it('continues playback when creating a source throws', async () => {
    const { queue, backend, requests } = createHarness()
    backend.failStartFor = 1
    const first = queue.enqueue('bad-source.wav')
    const second = queue.enqueue('good-source.wav')
    const firstValue = expect(first).resolves.toEqual(fakeBuffer(1))
    await queue.startPlayback()

    requests[0]?.operation.resolve(response(1))
    requests[1]?.operation.resolve(response(2))
    await flushMicrotasks()
    backend.decodes[0]?.operation.resolve(fakeBuffer(1))
    await flushMicrotasks()
    backend.decodes[1]?.operation.resolve(fakeBuffer(2))
    await Promise.all([firstValue, second])

    expect(queue.getTasks().map((task) => task.status)).toEqual(['error', 'playing'])
    expect(queue.getTasks()[0]?.error).toContain('Playback failed')
    expect(backend.played).toEqual([2])
    backend.finishCurrent()
    expect(queue.verifyInvariants()).toBe(true)
    await queue.dispose()
  })

  it('stops the active source back to ready and replays it after another user gesture', async () => {
    const { queue, backend, requests } = createHarness()
    const pending = queue.enqueue('repeat.wav')
    requests[0]?.operation.resolve(response(1))
    await flushMicrotasks()
    backend.decodes[0]?.operation.resolve(fakeBuffer(1))
    await pending

    await queue.startPlayback()
    expect(queue.getTasks()[0]?.status).toBe('playing')
    queue.stopPlayback()
    expect(queue.getTasks()[0]?.status).toBe('ready')
    expect(backend.stop).toHaveBeenCalledTimes(1)

    await queue.startPlayback()
    expect(backend.played).toEqual([1, 1])
    backend.finishCurrent()
    expect(queue.getTasks()[0]?.status).toBe('completed')
    expect(queue.verifyInvariants()).toBe(true)
    await queue.dispose()
  })

  it('settles pending work once and ignores late decode and playback callbacks after disposal', async () => {
    const { queue, backend, requests } = createHarness()
    const pending = queue.enqueue('late-decode.wav')
    const settled = vi.fn()
    void pending.then(settled, settled)
    requests[0]?.operation.resolve(response(1))
    await flushMicrotasks()

    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.all([queue.dispose(), queue.dispose()])
    await rejection
    backend.decodes[0]?.operation.resolve(fakeBuffer(1))
    backend.fireLateEnd(0)
    await flushMicrotasks()

    expect(backend.dispose).toHaveBeenCalledTimes(1)
    expect(settled).toHaveBeenCalledTimes(1)
    expect(queue.getTasks()[0]?.status).toBe('cancelled')
    expect(backend.played).toEqual([])
    expect(queue.verifyInvariants()).toBe(true)
    await expect(queue.enqueue('after-dispose.wav')).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('requires another explicit Play gesture after the queue drains', async () => {
    const { queue, backend, requests } = createHarness()
    const first = queue.enqueue('first-session.wav')
    requests[0]?.operation.resolve(response(1))
    await flushMicrotasks()
    backend.decodes[0]?.operation.resolve(fakeBuffer(1))
    await first
    await queue.startPlayback()
    backend.finishCurrent()
    expect(queue.getTasks()[0]?.status).toBe('completed')

    const second = queue.enqueue('second-session.wav')
    requests[1]?.operation.resolve(response(2))
    await flushMicrotasks()
    backend.decodes[1]?.operation.resolve(fakeBuffer(2))
    await second
    expect(queue.getTasks()[1]?.status).toBe('ready')
    expect(backend.played).toEqual([1])

    await queue.startPlayback()
    expect(queue.getTasks()[1]?.status).toBe('playing')
    expect(backend.played).toEqual([1, 2])
    backend.finishCurrent()
    expect(queue.verifyInvariants()).toBe(true)
    await queue.dispose()
  })
  it('keeps a task ready when AudioContext resume fails and allows a later Play retry', async () => {
    const { queue, backend, requests } = createHarness()
    const pending = queue.enqueue('resume-retry.wav')
    requests[0]?.operation.resolve(response(1))
    await flushMicrotasks()
    backend.decodes[0]?.operation.resolve(fakeBuffer(1))
    await pending
    backend.resume.mockRejectedValueOnce(new Error('user gesture required'))

    await expect(queue.startPlayback()).rejects.toThrow('user gesture required')
    expect(queue.getTasks()[0]?.status).toBe('ready')
    expect(backend.played).toEqual([])

    await queue.startPlayback()
    expect(queue.getTasks()[0]?.status).toBe('playing')
    expect(backend.played).toEqual([1])
    backend.finishCurrent()
    expect(queue.getTasks()[0]?.status).toBe('completed')
    expect(queue.verifyInvariants()).toBe(true)
    await queue.dispose()
  })

  it('releases listener and playback resources through repeated enqueue, play, cancel, and dispose cycles', async () => {
    const backend = new FakeAudioBackend()
    const fetchAudio: FetchAudio = async (input) => {
      const marker = Number(String(input).match(/sample-(\d+)/)?.[1] ?? 0)
      return response(marker)
    }
    const queue = new AudioTaskQueue({ fetchAudio, backend })
    const listener = vi.fn()
    queue.subscribe(listener)

    for (let index = 1; index <= 30; index += 1) {
      const pending = queue.enqueue(`sample-${index}.wav`)
      await flushMicrotasks()
      const decode = backend.decodes.at(-1)
      expect(decode?.marker).toBe(index)
      decode?.operation.resolve(fakeBuffer(index))
      await pending

      const task = queue.getTasks().at(-1)
      expect(task?.status).toBe('ready')
      if (index % 7 === 0) {
        expect(queue.cancelTask(task?.id ?? -1)).toBe(true)
        expect(queue.getTasks().at(-1)?.status).toBe('cancelled')
      } else {
        await queue.startPlayback()
        if (index % 2 === 0) {
          queue.stopPlayback()
          expect(queue.getTasks().at(-1)?.status).toBe('ready')
          await queue.startPlayback()
        }
        backend.finishCurrent()
        expect(queue.getTasks().at(-1)?.status).toBe('completed')
      }
      expect(queue.verifyInvariants()).toBe(true)
    }

    const notificationsBeforeDispose = listener.mock.calls.length
    await Promise.all([queue.dispose(), queue.dispose()])
    expect(backend.dispose).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(notificationsBeforeDispose)
    const lateListener = vi.fn()
    queue.subscribe(lateListener)
    expect(lateListener).not.toHaveBeenCalled()
    expect(queue.verifyInvariants()).toBe(true)
    expect(queue.getTasks().filter((task) => task.status === 'completed')).toHaveLength(26)
    expect(queue.getTasks().filter((task) => task.status === 'cancelled')).toHaveLength(4)
  })
})
