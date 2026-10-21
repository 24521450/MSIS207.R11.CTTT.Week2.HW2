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

function createCanvas() {
  const fillRect = vi.fn()
  const drawing = {
    fillStyle: '',
    clearRect: vi.fn(),
    fillRect,
    setTransform: vi.fn(),
  } as unknown as CanvasRenderingContext2D
  const bounds = { width: 320, height: 120 }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => drawing),
    getBoundingClientRect: vi.fn(() => ({ ...bounds }) as DOMRect),
  } as unknown as HTMLCanvasElement
  return { canvas, drawing, fillRect }
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
    const { canvas, drawing, fillRect } = createCanvas()
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

    visualizer.setAnalyser(null)
    expect(scheduler.callbacks.size).toBe(0)
    expect(scheduler.cancel).toHaveBeenCalledTimes(1)
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
})
