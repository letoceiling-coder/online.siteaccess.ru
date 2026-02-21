import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Generate WAV beep: 0.15 sec, 44.1kHz, mono, 880Hz sine
function generateBeepWav() {
  const sampleRate = 44100;
  const duration = 0.15; // seconds
  const frequency = 880; // Hz
  const numSamples = Math.floor(sampleRate * duration);
  const amplitude = 0.3; // 30% volume to avoid clipping

  // Generate sine wave samples
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    samples[i] = Math.floor(amplitude * 32767 * Math.sin(2 * Math.PI * frequency * t));
  }

  // WAV file format
  const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
  const fileSize = 36 + dataSize; // Header (44 bytes) - 8 bytes + dataSize

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // audio format (1 = PCM)
  buffer.writeUInt16LE(1, 22); // num channels (1 = mono)
  buffer.writeUInt32LE(sampleRate, 24); // sample rate
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate (sampleRate * numChannels * bytesPerSample)
  buffer.writeUInt16LE(2, 32); // block align (numChannels * bytesPerSample)
  buffer.writeUInt16LE(16, 34); // bits per sample

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write samples
  for (let i = 0; i < numSamples; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }

  // Write file
  const outputPath = join(__dirname, '..', 'public', 'sounds', 'new-message.wav');
  const outputDir = dirname(outputPath);
  
  // Ensure directory exists
  mkdirSync(outputDir, { recursive: true });
  
  writeFileSync(outputPath, buffer);
  
  console.log(`Generated WAV file: ${outputPath}`);
  console.log(`File size: ${buffer.length} bytes`);
  console.log(`Duration: ${duration}s, Frequency: ${frequency}Hz, Sample rate: ${sampleRate}Hz`);
}

generateBeepWav();
