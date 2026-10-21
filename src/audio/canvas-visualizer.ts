export interface AnimationFrameScheduler {
  request(callback: FrameRequestCallback): number
  cancel(frameId: number): void
}

export interface CanvasVisualizerOptions {
  scheduler?: AnimationFrameScheduler
  devicePixelRatio?: () => number
  observeResize?: (canvas: HTMLCanvasElement, onResize: () => void) => () => void
  onFrame?: (timestamp: number) => void
}

function browserFrameScheduler(): AnimationFrameScheduler {
  return {
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (frameId) => window.cancelAnimationFrame(frameId),
  }
}

function observeCanvasResize(canvas: HTMLCanvasElement, onResize: () => void): () => void {
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(onResize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }

  window.addEventListener('resize', onResize)
  return () => window.removeEventListener('resize', onResize)
}

export class CanvasVisualizer {
  private readonly context: CanvasRenderingContext2D | null
  private readonly scheduler: AnimationFrameScheduler
  private readonly readDevicePixelRatio: () => number
  private readonly observeResize: (canvas: HTMLCanvasElement, onResize: () => void) => () => void
  private readonly onFrame: ((timestamp: number) => void) | undefined
  private readonly stopObservingResize: () => void
  private readonly handleResize = (): void => this.resize()
  private readonly drawFrame: FrameRequestCallback = (timestamp) => {
    this.frameId = null
    const analyser = this.analyser
    const data = this.frequencyData
    const context = this.context
    if (this.disposed || !this.running || !analyser || !data || !context) {
      return
    }

    analyser.getByteFrequencyData(data)
    this.drawSpectrum(data, analyser.frequencyBinCount)
    this.onFrame?.(timestamp)
    if (this.running && !this.disposed) {
      this.frameId = this.scheduler.request(this.drawFrame)
    }
  }
  private analyser: AnalyserNode | null = null
  private frequencyData: Uint8Array<ArrayBuffer> | null = null
  private frameId: number | null = null
  private running = false
  private disposed = false
  private logicalWidth = 0
  private logicalHeight = 0
  private readonly canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement, options: CanvasVisualizerOptions = {}) {
    this.canvas = canvas
    this.context = canvas.getContext('2d')
    this.scheduler = options.scheduler ?? browserFrameScheduler()
    this.readDevicePixelRatio = options.devicePixelRatio ?? (() => window.devicePixelRatio || 1)
    this.observeResize = options.observeResize ?? observeCanvasResize
    this.onFrame = options.onFrame
    this.stopObservingResize = this.observeResize(canvas, this.handleResize)
    this.resize()
  }

  setAnalyser(analyser: AnalyserNode | null): void {
    if (this.disposed) {
      return
    }

    if (analyser) {
      if (this.analyser !== analyser) {
        this.analyser = analyser
        this.frequencyData = new Uint8Array(analyser.frequencyBinCount)
      }
      this.running = true
      this.requestFrame()
      return
    }

    this.running = false
    this.cancelFrame()
    this.drawIdle(this.logicalWidth, this.logicalHeight)
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    this.running = false
    this.cancelFrame()
    this.stopObservingResize()
    this.analyser = null
    this.frequencyData = null
  }

  private resize(): void {
    if (this.disposed || !this.context) {
      return
    }

    const bounds = this.canvas.getBoundingClientRect()
    this.logicalWidth = bounds.width
    this.logicalHeight = bounds.height
    const pixelRatio = Math.max(1, this.readDevicePixelRatio())
    const width = Math.max(1, Math.round(bounds.width * pixelRatio))
    const height = Math.max(1, Math.round(bounds.height * pixelRatio))
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    this.drawIdle(bounds.width, bounds.height)
  }

  private drawIdle(width: number, height: number): void {
    const context = this.context
    if (!context) {
      return
    }
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#10182b'
    context.fillRect(0, 0, width, height)
    context.fillStyle = '#2a3650'
    context.fillRect(width * 0.08, height * 0.5 - 1, width * 0.84, 2)
  }

  private drawSpectrum(data: Uint8Array<ArrayBuffer>, binCount: number): void {
    const context = this.context
    if (!context || binCount === 0) {
      return
    }

    const width = this.logicalWidth
    const height = this.logicalHeight
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#10182b'
    context.fillRect(0, 0, width, height)

    // Allocate one equal slot per bin so the final bar always remains inside the canvas.
    const slotWidth = width / binCount
    const gap = Math.min(1, slotWidth * 0.12)
    const barWidth = Math.max(0, slotWidth - gap)
    context.fillStyle = '#36d6a0'
    for (let index = 0; index < binCount; index += 1) {
      const magnitude = (data[index] ?? 0) / 255
      const barHeight = Math.max(2, magnitude * height * 0.88)
      const x = index * slotWidth
      context.fillRect(x, height - barHeight, barWidth, barHeight)
    }
  }

  private requestFrame(): void {
    if (this.frameId === null && this.running && !this.disposed) {
      this.frameId = this.scheduler.request(this.drawFrame)
    }
  }

  private cancelFrame(): void {
    if (this.frameId === null) {
      return
    }
    this.scheduler.cancel(this.frameId)
    this.frameId = null
  }
}
