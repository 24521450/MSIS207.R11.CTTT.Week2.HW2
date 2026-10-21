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
    this.activeSource = source
    source.buffer = buffer
    source.onended = () => {
      if (this.activeSource !== source) {
        return
      }
      this.releaseSource(source)
      onEnded()
    }

    try {
      source.connect(analyser)
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
    try {
      source.disconnect()
    } catch {
      // Continue clearing the source even if it has no remaining connections.
    }
    source.buffer = null
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
    const analyser = this.analyser
    this.analyser = null
    try {
      analyser?.disconnect()
    } catch {
      // Closing the context still releases the graph if the node was disconnected already.
    }

    const context = this.context
    this.context = null
    if (!context || context.state === 'closed') {
      this.disposePromise = Promise.resolve()
    } else {
      try {
        this.disposePromise = context.close()
      } catch (error) {
        this.disposePromise = Promise.reject(error)
      }
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
      try {
        analyser.connect(context.destination)
      } catch (error) {
        try {
          analyser.disconnect()
        } catch {
          // Ignore a partial graph cleanup failure and surface the original connect error.
        }
        throw error
      }
      this.analyser = analyser
    }
    return this.analyser
  }

  private releaseSource(source: AudioBufferSourceNode): void {
    source.onended = null
    try {
      source.disconnect()
    } catch {
      // Natural completion must still advance the queue if disconnect is already complete.
    }
    source.buffer = null
    if (this.activeSource === source) {
      this.activeSource = null
    }
  }
}
