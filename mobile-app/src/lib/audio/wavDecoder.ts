/**
 * wavDecoder.ts
 * =============
 * Minimal parser for the uncompressed PCM .wav files preprocess.py /
 * generate_test_clips.py produce (16-bit signed PCM, mono). Used only for
 * bypassing the microphone during debugging - feeding a known-label test
 * clip's exact raw samples straight into the classification pipeline to
 * check whether a misclassification is a pipeline bug or a real-world
 * speaker/microphone acoustic domain-gap issue.
 *
 * Not a general-purpose WAV decoder - assumes canonical PCM WAV layout
 * (fmt chunk before data chunk, no extra metadata chunks in between),
 * which is exactly what scipy.io.wavfile.write() produces.
 */

export interface DecodedWav {
  samples: Float64Array; // normalized to [-1, 1]
  sampleRate: number;
}

export function decodeWav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const riff = readAscii(view, 0, 4);
  const wave = readAscii(view, 8, 4);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Not a valid RIFF/WAVE file.");
  }

  let offset = 12;
  let sampleRate = 0;
  let bitsPerSample = 16;
  let numChannels = 1;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;

    if (chunkId === "fmt ") {
      numChannels = view.getUint16(chunkDataStart + 2, true);
      sampleRate = view.getUint32(chunkDataStart + 4, true);
      bitsPerSample = view.getUint16(chunkDataStart + 14, true);
    } else if (chunkId === "data") {
      dataOffset = chunkDataStart;
      dataLength = chunkSize;
    }

    offset = chunkDataStart + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }

  if (dataOffset < 0) {
    throw new Error("No data chunk found in WAV file.");
  }
  if (bitsPerSample !== 16) {
    throw new Error(`Only 16-bit PCM WAV is supported, got ${bitsPerSample}-bit.`);
  }

  const bytesPerSample = 2 * numChannels;
  const numFrames = Math.floor(dataLength / bytesPerSample);
  const samples = new Float64Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    // Mono, or take the first channel if the file happens to have more.
    const sampleOffset = dataOffset + i * bytesPerSample;
    const raw = view.getInt16(sampleOffset, true);
    samples[i] = raw / 32768;
  }

  return { samples, sampleRate };
}

function readAscii(view: DataView, offset: number, length: number): string {
  let str = "";
  for (let i = 0; i < length; i++) {
    str += String.fromCharCode(view.getUint8(offset + i));
  }
  return str;
}
