import type { AudioBackend } from './types.ts'

export type AudioContextFactory = () => AudioContext

export class WebAudioBackend implements AudioBackend {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private activeSource: AudioBufferSourceNode | null = null
  private disposed = false
  private disposePromise: Promise<void> | null = null

  private readonly createContext: AudioContextFactory

  constructor(createContext: AudioContextFactory = () => new AudioContext()) {
    this.createContext = createContext
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.getContext().decodeAudioData(data)
  }

  async resume(): Promise<void> {
    const context = this.getContext()
    if (context.state !== 'running') {
      await context.resume()
    }
  }

  play(buffer: AudioBuffer, onEnded: () => void): void {
    const context = this.getContext()
    const analyser = this.getOrCreateAnalyser(context)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(analyser)
    this.activeSource = source
    source.onended = () => {
      if (this.activeSource !== source) {
        return
      }
      this.releaseSource(source)
      onEnded()
    }

    try {
      source.start()
    } catch (error) {
      this.releaseSource(source)
      throw error
    }
  }

  stop(): void {
    const source = this.activeSource
    this.activeSource = null
    if (!source) {
      return
    }

    source.onended = null
    try {
      source.stop()
    } catch {
      // A source that has already ended cannot be stopped again.
    }
    source.disconnect()
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  dispose(): Promise<void> {
    if (this.disposePromise) {
      return this.disposePromise
    }

    this.disposed = true
    this.stop()
    this.analyser?.disconnect()
    this.analyser = null

    const context = this.context
    this.context = null
    if (!context || context.state === 'closed') {
      this.disposePromise = Promise.resolve()
    } else {
      this.disposePromise = context.close()
    }
    return this.disposePromise
  }

  private getContext(): AudioContext {
    if (this.disposed) {
      throw new DOMException('The audio backend has been disposed.', 'InvalidStateError')
    }
    this.context ??= this.createContext()
    return this.context
  }

  private getOrCreateAnalyser(context: AudioContext): AnalyserNode {
    if (!this.analyser) {
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.connect(context.destination)
      this.analyser = analyser
    }
    return this.analyser
  }

  private releaseSource(source: AudioBufferSourceNode): void {
    source.onended = null
    source.disconnect()
    if (this.activeSource === source) {
      this.activeSource = null
    }
  }
}
