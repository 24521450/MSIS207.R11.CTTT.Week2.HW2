export interface AudioTask {
  id: number
  order: number
  trackUrl: string
  status: AudioTaskStatus
  error?: string
  readonly abortController: AbortController
}

export type AudioTaskSnapshot = Readonly<
  Pick<AudioTask, 'id' | 'order' | 'trackUrl' | 'status' | 'error'>
>

export type AudioTaskStatus =
  | 'queued'
  | 'downloading'
  | 'decoding'
  | 'ready'
  | 'playing'
  | 'completed'
  | 'cancelled'
  | 'error'

export type AudioTaskListener = (tasks: readonly AudioTaskSnapshot[]) => void
export type Unsubscribe = () => void

export interface AudioBackend {
  decode(data: ArrayBuffer): Promise<AudioBuffer>
  resume(): Promise<void>
  play(buffer: AudioBuffer, onEnded: () => void): void
  stop(): void
  getAnalyser(): AnalyserNode | null
  dispose(): Promise<void>
}

export interface AudioQueueController {
  enqueue(trackUrl: string): Promise<AudioBuffer>
  cancelTask(taskId: number): boolean
  startPlayback(): Promise<void>
  stopPlayback(): void
  getTasks(): readonly AudioTaskSnapshot[]
  getAnalyser(): AnalyserNode | null
  subscribe(listener: AudioTaskListener): Unsubscribe
  verifyInvariants(): boolean
  dispose(): Promise<void>
}

export type FetchAudio = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
