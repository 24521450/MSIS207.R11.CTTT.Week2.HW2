import { describe, expect, it, vi } from 'vitest'
import { CanvasVisualizer } from './canvas-visualizer.ts'
import type { AnimationFrameScheduler } from './canvas-visualizer.ts'

class FakeScheduler implements AnimationFrameScheduler {
  readonly callbacks = new Map<number, FrameRequestCallback>()
  readonly cancel = vi.fn((frameId: number) => {
    this.callbacks.delete(frameId)
  })
  private nextId = 1

  request(callback: FrameRequestCallback): number {
    const frameId = this.nextId
    this.nextId += 1
    this.callbacks.set(frameId, callback)
    return frameId
  }

  tick(timestamp: number): void {
    const [frameId, callback] = this.callbacks.entries().next().value ?? []
    if (frameId === undefined || callback === undefined) {
      return
    }
    this.callbacks.delete(frameId)
    callback(timestamp)
  }
}

function createCanvas(initialWidth = 320) {
  const fillRect = vi.fn()
  const drawing = {
    fillStyle: '',
    clearRect: vi.fn(),
    fillRect,
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D
  const bounds = { width: initialWidth, height: 120 }
  const getBounds = vi.fn(() => ({ ...bounds }) as DOMRect)
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => drawing),
    getBoundingClientRect: getBounds,
  } as unknown as HTMLCanvasElement
  return {
    canvas,
    drawing,
    fillRect,
    getBounds,
    setBounds: (width: number, height = bounds.height): void => {
      bounds.width = width
      bounds.height = height
    },
  }
}

function createAnalyser() {
  const getByteFrequencyData = vi.fn((data: Uint8Array<ArrayBuffer>) => {
    data.fill(64)
  })
  const analyser = {
    frequencyBinCount: 256,
    getByteFrequencyData,
  } as unknown as AnalyserNode
  return { analyser, getByteFrequencyData }
}

describe('CanvasVisualizer', () => {
  it('reuses one frequency buffer across frames and cancels RAF on stop', () => {
    const { canvas, drawing, fillRect, getBounds } = createCanvas()
    const scheduler = new FakeScheduler()
    const { analyser, getByteFrequencyData } = createAnalyser()
    const timestamps: number[] = []
    const stopObserving = vi.fn()
    const visualizer = new CanvasVisualizer(canvas, {
      scheduler,
      devicePixelRatio: () => 2,
      observeResize: (_canvas, onResize) => {
        onResize()
        return stopObserving
      },
      onFrame: (timestamp) => timestamps.push(timestamp),
    })

    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(240)
    expect(drawing.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0)
    expect(scheduler.callbacks.size).toBe(0)

    visualizer.setAnalyser(analyser)
    const resizeReads = getBounds.mock.calls.length
    expect(scheduler.callbacks.size).toBe(1)
    scheduler.tick(10)
    const firstBuffer = getByteFrequencyData.mock.calls[0]?.[0]
    scheduler.tick(26)
    const secondBuffer = getByteFrequencyData.mock.calls[1]?.[0]

    expect(firstBuffer).toBeDefined()
    expect(secondBuffer).toBe(firstBuffer)
    expect(getByteFrequencyData).toHaveBeenCalledTimes(2)
    expect(timestamps).toEqual([10, 26])
    expect(fillRect.mock.calls.length).toBeGreaterThan(256)
    expect(getBounds).toHaveBeenCalledTimes(resizeReads)

    visualizer.setAnalyser(null)
    expect(scheduler.callbacks.size).toBe(0)
    expect(scheduler.cancel).toHaveBeenCalledTimes(1)
    expect(fillRect.mock.calls.at(-1)?.[0]).toBeCloseTo(25.6)
    visualizer.dispose()
    visualizer.dispose()
    expect(stopObserving).toHaveBeenCalledTimes(1)
  })

  it('does not schedule duplicate frames when the same analyser is attached repeatedly', () => {
    const { canvas } = createCanvas()
    const scheduler = new FakeScheduler()
    const { analyser } = createAnalyser()
    const visualizer = new CanvasVisualizer(canvas, {
      scheduler,
      devicePixelRatio: () => 1,
      observeResize: () => () => undefined,
    })

    visualizer.setAnalyser(analyser)
    visualizer.setAnalyser(analyser)
    expect(scheduler.callbacks.size).toBe(1)
    visualizer.dispose()
    expect(scheduler.callbacks.size).toBe(0)
  })

  it.each([1, 2])('draws every frequency bin within resized bounds at DPR %i', (pixelRatio) => {
    const { canvas, drawing, fillRect, setBounds } = createCanvas(640)
    const scheduler = new FakeScheduler()
    const { analyser } = createAnalyser()
    const stopObserving = vi.fn()
    let resize!: () => void
    const visualizer = new CanvasVisualizer(canvas, {
      scheduler,
      devicePixelRatio: () => pixelRatio,
      observeResize: (_canvas, onResize) => {
        resize = onResize
        return stopObserving
      },
    })
    visualizer.setAnalyser(analyser)

    const expectAllBinsFit = (width: number, timestamp: number): void => {
      fillRect.mockClear()
      scheduler.tick(timestamp)
      const barCalls = fillRect.mock.calls.slice(1)
      expect(barCalls).toHaveLength(256)
      for (const call of barCalls) {
        const x = Number(call[0])
        const barWidth = Number(call[2])
        expect(x).toBeGreaterThanOrEqual(0)
        expect(barWidth).toBeGreaterThan(0)
        expect(x + barWidth).toBeLessThanOrEqual(width + 0.000001)
      }

      const lastBin = barCalls[255]
      expect(lastBin).toBeDefined()
      expect(Number(lastBin?.[0])).toBeCloseTo((255 * width) / 256)
      expect(Number(lastBin?.[0]) + Number(lastBin?.[2])).toBeGreaterThan(Number(lastBin?.[0]))
      expect(canvas.width).toBe(Math.round(width * pixelRatio))
      expect(canvas.height).toBe(Math.round(120 * pixelRatio))
      expect(drawing.setTransform).toHaveBeenLastCalledWith(pixelRatio, 0, 0, pixelRatio, 0, 0)
    }

    expectAllBinsFit(640, 1)
    for (const [index, width] of [320, 144, 640].entries()) {
      setBounds(width)
      resize()
      expectAllBinsFit(width, index + 2)
    }

    visualizer.dispose()
    expect(scheduler.callbacks.size).toBe(0)
    expect(stopObserving).toHaveBeenCalledTimes(1)
  })

  it('releases RAF and its resize listener after repeated visualization cycles', () => {
    const { canvas } = createCanvas(320)
    const scheduler = new FakeScheduler()
    const { analyser, getByteFrequencyData } = createAnalyser()
    const resizeListeners = new Set<() => void>()
    const stopObserving = vi.fn((listener: () => void) => resizeListeners.delete(listener))
    const visualizer = new CanvasVisualizer(canvas, {
      scheduler,
      devicePixelRatio: () => 2,
      observeResize: (_canvas, onResize) => {
        resizeListeners.add(onResize)
        return () => stopObserving(onResize)
      },
    })

    for (let cycle = 0; cycle < 30; cycle += 1) {
      visualizer.setAnalyser(analyser)
      scheduler.tick(cycle)
      visualizer.setAnalyser(null)
      expect(scheduler.callbacks.size).toBe(0)
      expect(resizeListeners.size).toBe(1)
    }

    expect(getByteFrequencyData).toHaveBeenCalledTimes(30)
    visualizer.setAnalyser(analyser)
    expect(scheduler.callbacks.size).toBe(1)
    visualizer.dispose()
    expect(scheduler.callbacks.size).toBe(0)
    expect(resizeListeners.size).toBe(0)
    expect(stopObserving).toHaveBeenCalledTimes(1)
    expect(getByteFrequencyData).toHaveBeenCalledTimes(30)
  })
})
