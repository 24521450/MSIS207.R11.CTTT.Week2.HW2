import { describe, expect, it, vi } from 'vitest'
import { WebAudioBackend } from './web-audio-backend.ts'

interface FakeSource {
  buffer: AudioBuffer | null
  onended: ((this: AudioBufferSourceNode, event: Event) => void) | null
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

function createSource(): FakeSource {
  return {
    buffer: null,
    onended: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    disconnect: vi.fn(),
  }
}

function createContextHarness() {
  let state: AudioContextState = 'suspended'
  const analyser = {
    fftSize: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as AnalyserNode
  Object.defineProperty(analyser, 'frequencyBinCount', {
    get: () => analyser.fftSize / 2,
  })
  const sources: FakeSource[] = []
  const context = {
    get state() {
      return state
    },
    destination: {},
    createAnalyser: vi.fn(() => analyser),
    createBufferSource: vi.fn(() => {
      const source = createSource()
      sources.push(source)
      return source as unknown as AudioBufferSourceNode
    }),
    decodeAudioData: vi.fn(async () => ({ duration: 0.1 }) as AudioBuffer),
    resume: vi.fn(async () => {
      state = 'running'
    }),
    close: vi.fn(async () => {
      state = 'closed'
    }),
  } as unknown as AudioContext
  return { context, analyser, sources, state: () => state }
}

describe('WebAudioBackend', () => {
  it('creates AudioContext lazily and resumes only when requested', async () => {
    const harness = createContextHarness()
    const createContext = vi.fn(() => harness.context)
    const backend = new WebAudioBackend(createContext)

    expect(createContext).not.toHaveBeenCalled()
    expect(backend.getAnalyser()).toBeNull()
    expect(harness.context.resume).not.toHaveBeenCalled()

    await backend.decode(new ArrayBuffer(4))
    expect(createContext).toHaveBeenCalledTimes(1)
    expect(harness.context.resume).not.toHaveBeenCalled()
    await backend.resume()
    expect(harness.context.resume).toHaveBeenCalledTimes(1)
    expect(harness.state()).toBe('running')
    await backend.dispose()
  })

  it('uses fftSize 512, creates a source per play, and releases sources on end, stop, and dispose', async () => {
    const harness = createContextHarness()
    const backend = new WebAudioBackend(() => harness.context)
    const buffer = { duration: 0.1 } as AudioBuffer
    const firstEnded = vi.fn()
    const secondEnded = vi.fn()

    backend.play(buffer, firstEnded)
    expect(harness.analyser.fftSize).toBe(512)
    expect(harness.analyser.frequencyBinCount).toBe(256)
    expect(harness.analyser.connect).toHaveBeenCalledWith(harness.context.destination)
    expect(harness.sources[0]?.connect).toHaveBeenCalledWith(harness.analyser)
    expect(harness.sources[0]?.start).toHaveBeenCalledTimes(1)
    harness.sources[0]?.onended?.call(harness.sources[0] as unknown as AudioBufferSourceNode, new Event('ended'))
    expect(firstEnded).toHaveBeenCalledTimes(1)
    expect(harness.sources[0]?.disconnect).toHaveBeenCalledTimes(1)
    expect(harness.sources[0]?.buffer).toBeNull()

    backend.play(buffer, secondEnded)
    backend.stop()
    expect(harness.sources[1]?.stop).toHaveBeenCalledTimes(1)
    expect(harness.sources[1]?.onended).toBeNull()
    expect(harness.sources[1]?.disconnect).toHaveBeenCalledTimes(1)
    expect(secondEnded).not.toHaveBeenCalled()

    const firstDispose = backend.dispose()
    const secondDispose = backend.dispose()
    await Promise.all([firstDispose, secondDispose])
    expect(firstDispose).toBe(secondDispose)
    expect(harness.analyser.disconnect).toHaveBeenCalledTimes(1)
    expect(harness.context.close).toHaveBeenCalledTimes(1)
  })

  it('still reports natural playback end if a source disconnect fails', async () => {
    const harness = createContextHarness()
    const backend = new WebAudioBackend(() => harness.context)
    const onEnded = vi.fn()
    backend.play({ duration: 0.1 } as AudioBuffer, onEnded)
    harness.sources[0]?.disconnect.mockImplementationOnce(() => {
      throw new Error('already disconnected')
    })

    expect(() => {
      harness.sources[0]?.onended?.call(harness.sources[0] as unknown as AudioBufferSourceNode, new Event('ended'))
    }).not.toThrow()
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(backend.getAnalyser()).toBe(harness.analyser)
    await backend.dispose()
  })

  it('releases every source across repeated natural-end and stop cycles before closing the context', async () => {
    const harness = createContextHarness()
    const backend = new WebAudioBackend(() => harness.context)
    const onEnded = vi.fn()
    const buffer = { duration: 0.1 } as AudioBuffer
    const cycleCount = 40

    for (let index = 0; index < cycleCount; index += 1) {
      backend.play(buffer, onEnded)
      const source = harness.sources[index]
      expect(source).toBeDefined()
      if (index % 2 === 0) {
        source?.onended?.call(source as unknown as AudioBufferSourceNode, new Event('ended'))
      } else {
        backend.stop()
        expect(source?.stop).toHaveBeenCalledTimes(1)
      }
      expect(source?.disconnect).toHaveBeenCalledTimes(1)
      expect(source?.buffer).toBeNull()
      expect(source?.onended).toBeNull()
    }

    expect(harness.sources).toHaveLength(cycleCount)
    expect(onEnded).toHaveBeenCalledTimes(cycleCount / 2)
    await backend.dispose()
    expect(harness.analyser.disconnect).toHaveBeenCalledTimes(1)
    expect(harness.context.close).toHaveBeenCalledTimes(1)
    expect(backend.getAnalyser()).toBeNull()
  })
})
