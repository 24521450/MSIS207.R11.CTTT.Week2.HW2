import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sampleDirectory = resolve(projectRoot, 'public', 'samples')
const sampleRate = 22_050
const durationSeconds = 3
const channelCount = 1
const bitsPerSample = 16
const frameCount = sampleRate * durationSeconds

function createToneWav(frequencies, outputName) {
  const dataSize = frameCount * channelCount * (bitsPerSample / 8)
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(channelCount, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * channelCount * (bitsPerSample / 8), 28)
  buffer.writeUInt16LE(channelCount * (bitsPerSample / 8), 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / sampleRate
    const fadeIn = Math.min(1, time / 0.025)
    const fadeOut = Math.min(1, (durationSeconds - time) / 0.04)
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut))
    const tone = frequencies.reduce((sum, [frequency, gain]) => {
      return sum + Math.sin(2 * Math.PI * frequency * time) * gain
    }, 0)
    const sample = Math.max(-1, Math.min(1, tone * envelope * 0.42))
    buffer.writeInt16LE(Math.round(sample * 32_767), 44 + frame * 2)
  }

  return writeFile(resolve(sampleDirectory, outputName), buffer)
}

await mkdir(sampleDirectory, { recursive: true })
await Promise.all([
  createToneWav([[440, 1], [880, 0.18]], 'soft-pulse.wav'),
  createToneWav([[523.25, 0.85], [1_046.5, 0.28], [1_569.75, 0.1]], 'bright-wave.wav'),
])
console.log(`Generated 2 mono PCM WAV samples in ${sampleDirectory}`)
