/**
 * noiseReduction.ts
 * =================
 * Spectral subtraction for real-world background noise (road noise, wind,
 * cabin chatter) that the lab-recorded HUSTmotor training data never had.
 *
 * Design note: a naive approach (assume the first N frames of a recording
 * are "noise only", like ai-pipeline/audio_processor.py's placeholder
 * dual_domain_noise_mitigation) doesn't fit here - the engine is audible
 * for the entire recording, there's no guaranteed silent lead-in.
 *
 * Instead this uses MINIMUM STATISTICS noise estimation: for each
 * frequency bin, the noise floor is approximated as a low percentile of
 * that bin's magnitude across the WHOLE recording. Steady background noise
 * stays roughly constant over time, while the engine's fault signature
 * fluctuates - so even without a silent period, the low end of each bin's
 * range over several seconds is a reasonable stand-in for "just the noise".
 *
 * ADAPTIVE STRENGTH (added after diagnosing a real accuracy bug):
 * That percentile approach has no way to tell "genuine background noise"
 * apart from "the quietest moments of the engine itself" - it always
 * treats the bottom ~10% of each bin's energy as noise, whether or not any
 * real noise is present. Confirmed on lab-clean bypass-mic test clips with
 * ZERO real background noise: this still zeroed out ~20% of every
 * spectrogram's content, measurably hurting classification confidence on
 * subtler-signature classes (healthy, bowed_rotor, voltage_unbalance).
 *
 * The fix: measure the SPECTRAL FLATNESS (Wiener entropy) of the estimated
 * floor itself. A running motor's own quiet moments still have the same
 * harmonic/tonal shape as its loud moments, so a floor derived from "quiet
 * engine" is peaky/tonal (low flatness, near 0). Genuine ambient noise
 * (traffic, wind, electrical hum) is comparatively broadband (high
 * flatness, near 1). Verified numerically: clean lab clips produced floor
 * flatness of 0.14-0.29; the same clips with synthetic broadband noise
 * mixed in produced 0.77-0.82 - a clear, well-separated signal to gate on.
 *
 * When flatness is low, we now skip (or scale down) the subtraction
 * instead of always applying it at full strength.
 */

import { N_FFT, HOP_LENGTH } from "./constants";
import { realFftPowerSpectrum } from "./fft";

const NOISE_PERCENTILE = 0.1; // bottom 10% of magnitude per bin, across time

// Below this flatness, the "floor" looks tonal/harmonic - almost certainly
// just quiet engine content, not real background noise - so we skip
// subtraction entirely. Above the upper threshold, the floor looks
// broadband/noise-like enough to subtract at full strength. Chosen with
// margin around the measured clean (0.14-0.29) vs. noisy (0.77-0.82)
// clusters above.
const FLATNESS_SKIP_THRESHOLD = 0.35;
const FLATNESS_FULL_THRESHOLD = 0.6;

function hannWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  }
  return window;
}
const HANN_WINDOW = hannWindow(N_FFT);

function percentile(sorted: Float64Array, p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx];
}

/**
 * Spectral flatness (Wiener entropy): geometric mean / arithmetic mean of a
 * magnitude spectrum. Returns a value in [0, 1] - near 0 for tonal/peaky
 * spectra (energy concentrated at a few harmonics, like a motor), near 1
 * for flat/broadband spectra (like white or pink ambient noise). Bin 0 (DC)
 * is excluded since it can be near-zero and skew the geometric mean.
 */
function spectralFlatness(magnitudes: Float64Array): number {
  let logSum = 0;
  let sum = 0;
  let count = 0;
  for (let k = 1; k < magnitudes.length; k++) {
    const value = magnitudes[k];
    if (value <= 1e-12) continue;
    logSum += Math.log(value);
    sum += value;
    count++;
  }
  if (count === 0) return 0;
  const geoMean = Math.exp(logSum / count);
  const arithMean = sum / count;
  return arithMean > 0 ? geoMean / arithMean : 0;
}

export interface NoiseEstimate {
  /** Per-frequency-bin magnitude floor, to be passed into
   * computeMelSpectrogramImage() - already scaled by `strength` below, so
   * callers can use it directly without any extra scaling. */
  noiseFloor: Float64Array;
  /** Spectral flatness of the raw (unscaled) estimated floor, in [0, 1].
   * Exposed mainly for debugging/logging. */
  flatness: number;
  /** How much of the subtraction to actually apply, in [0, 1], based on
   * `flatness`. 0 = skip subtraction entirely (floor looks like quiet
   * engine content, not real noise). 1 = apply full subtraction strength
   * (floor looks like genuine broadband background noise). */
  strength: number;
}

/**
 * Estimates a per-frequency-bin noise magnitude floor from an entire
 * (already resampled to 25,600Hz) recording, and how confidently that
 * floor represents real background noise (vs. just quiet engine content) -
 * see the ADAPTIVE STRENGTH note above. `noiseFloor` is pre-scaled by
 * `strength`, so pass it straight into computeMelSpectrogramImage().
 */
export function estimateNoiseFloor(fullRecording: Float64Array): NoiseEstimate {
  const numBins = N_FFT / 2 + 1;
  const numFrames = Math.max(1, Math.floor((fullRecording.length - N_FFT) / HOP_LENGTH) + 1);

  // magnitudesByBin[k] = array of magnitude values for bin k across all frames
  const magnitudesByBin: number[][] = Array.from({ length: numBins }, () => []);

  const frame = new Float64Array(N_FFT);
  for (let t = 0; t < numFrames; t++) {
    const start = t * HOP_LENGTH;
    if (start + N_FFT > fullRecording.length) break;

    for (let i = 0; i < N_FFT; i++) {
      frame[i] = fullRecording[start + i] * HANN_WINDOW[i];
    }

    const power: Float64Array = realFftPowerSpectrum(frame);
    for (let k = 0; k < numBins; k++) {
      magnitudesByBin[k].push(Math.sqrt(power[k]));
    }
  }

  const rawFloor = new Float64Array(numBins);
  for (let k = 0; k < numBins; k++) {
    const sorted = Float64Array.from(magnitudesByBin[k]).sort();
    rawFloor[k] = sorted.length > 0 ? percentile(sorted, NOISE_PERCENTILE) : 0;
  }

  const flatness = spectralFlatness(rawFloor);
  const strength = Math.max(
    0,
    Math.min(1, (flatness - FLATNESS_SKIP_THRESHOLD) / (FLATNESS_FULL_THRESHOLD - FLATNESS_SKIP_THRESHOLD))
  );

  const noiseFloor =
    strength >= 1 ? rawFloor : Float64Array.from(rawFloor, (v) => v * strength);

  return { noiseFloor, flatness, strength };
}
