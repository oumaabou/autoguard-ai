/**
 * resample.ts
 * ===========
 * Phone microphones don't record at the HUSTmotor dataset's 25,600 Hz -
 * they typically capture at a fixed device rate (commonly 44,100 Hz or
 * 48,000 Hz). Since the model was trained entirely on 25,600 Hz audio,
 * every recording must be resampled down to 25,600 Hz before feature
 * extraction, or the spectrogram frequency axis will not line up with
 * what the CNN learned.
 *
 * This is a simple linear-interpolation resampler. It's not as clean as a
 * proper polyphase/sinc resampler, but it's adequate for this use case and
 * requires no native dependencies.
 */

export function linearResample(
  samples: Float64Array,
  fromSampleRate: number,
  toSampleRate: number
): Float64Array {
  if (fromSampleRate === toSampleRate) {
    return samples;
  }

  const ratio = fromSampleRate / toSampleRate;
  const outputLength = Math.floor(samples.length / ratio);
  const output = new Float64Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const frac = srcPos - srcIndex;

    const s0 = samples[srcIndex] ?? 0;
    const s1 = samples[srcIndex + 1] ?? s0;
    output[i] = s0 + (s1 - s0) * frac;
  }

  return output;
}
