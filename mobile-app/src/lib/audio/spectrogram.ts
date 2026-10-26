/**
 * spectrogram.ts
 * ==============
 * On-device re-implementation of the exact feature pipeline used by
 * ai-pipeline/preprocess.py, so a live microphone recording produces a
 * spectrogram in the same feature space the CNN was trained on:
 *
 *   preprocess.py:  raw sound chunk -> librosa.feature.melspectrogram
 *                   (n_fft=1024, hop_length=256, n_mels=128) -> power_to_db
 *                   -> normalize to 0-255 -> resize to 128x128 -> save PNG
 *
 *   this file:      raw sound chunk -> STFT (fft.ts) -> mel filterbank
 *                   (melFilterbank.ts) -> power_to_db -> normalize to 0-255
 *                   -> resize to 128x128 (bilinearResize.ts) -> Uint8Array
 *
 * IMPORTANT: these constants live in constants.ts and must always match
 * preprocess.py / train_model.py.
 */

import { realFftPowerSpectrum } from "./fft";
import { buildMelFilterbank } from "./melFilterbank";
import { bilinearResize } from "./bilinearResize";
import {
  SAMPLE_RATE,
  WINDOW_SIZE,
  N_FFT,
  HOP_LENGTH,
  N_MELS,
  IMG_SIZE,
  OVER_SUBTRACTION_FACTOR,
} from "./constants";

export { SAMPLE_RATE, WINDOW_SIZE, N_FFT, HOP_LENGTH, N_MELS, IMG_SIZE };

// The filterbank only depends on sample rate/FFT size/mel count, all fixed,
// so build it once and reuse it for every window instead of recomputing it
// per inference call.
const MEL_FILTERBANK = buildMelFilterbank(SAMPLE_RATE, N_FFT, N_MELS);

// scipy/librosa's "hann" window (used via get_window with fftbins=True) is
// the PERIODIC form (denominator = size), not the symmetric form
// (denominator = size - 1). Verified numerically against librosa 0.11.0:
// this periodic form reproduces librosa's STFT power spectrum to ~1e-7
// relative error; the symmetric form does not.
function hannWindow(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  }
  return window;
}

const HANN_WINDOW = hannWindow(N_FFT);

/** Zero-pad a signal by `padWidth` samples on each side. librosa.stft's
 * default pad_mode changed from "reflect" to "constant" (zero-padding) as
 * of librosa 0.10+ - verified against the installed librosa 0.11.0, whose
 * STFT output only matches this zero-padding, not reflect-padding. */
function reflectPad(signal: Float64Array, padWidth: number): Float64Array {
  const n = signal.length;
  const out = new Float64Array(n + 2 * padWidth);
  out.set(signal, padWidth);
  // Zeros elsewhere (Float64Array is zero-initialized) - matches
  // pad_mode="constant" with the default constant_values=0.
  return out;
}

/**
 * Computes the log-mel spectrogram of a single fixed-length sound window
 * and returns a 128x128 array of pixel values in [0, 255], matching the
 * grayscale PNGs preprocess.py generated for training.
 *
 * If `noiseFloor` is provided (see noiseReduction.ts), it is subtracted
 * from each frame's magnitude spectrum before mel-filtering, to suppress
 * steady background noise a phone mic picks up that the lab-recorded
 * training data never had. Pass undefined to skip noise reduction (e.g.
 * when processing the clean training/test .wav clips for comparison).
 */
export function computeMelSpectrogramImage(
  signal: Float64Array,
  noiseFloor?: Float64Array
): Uint8Array {
  if (signal.length !== WINDOW_SIZE) {
    throw new Error(
      `computeMelSpectrogramImage expects exactly ${WINDOW_SIZE} samples, got ${signal.length}`
    );
  }

  const padded = reflectPad(signal, Math.floor(N_FFT / 2));
  const numFrames = 1 + Math.floor((padded.length - N_FFT) / HOP_LENGTH);
  const numMelBins = MEL_FILTERBANK.length;

  // melPower[m * numFrames + t] = mel-band m, time-frame t
  const melPower = new Float64Array(numMelBins * numFrames);

  const frame = new Float64Array(N_FFT);
  for (let t = 0; t < numFrames; t++) {
    const start = t * HOP_LENGTH;
    for (let i = 0; i < N_FFT; i++) {
      frame[i] = padded[start + i] * HANN_WINDOW[i];
    }
    const powerSpectrum = realFftPowerSpectrum(frame);

    // Spectral subtraction: work in magnitude domain, subtract the
    // over-subtracted noise floor, floor at 0, then convert back to power.
    let cleanedPower = powerSpectrum;
    if (noiseFloor) {
      cleanedPower = new Float64Array(powerSpectrum.length);
      for (let k = 0; k < powerSpectrum.length; k++) {
        const magnitude = Math.sqrt(powerSpectrum[k]);
        const cleanedMagnitude = Math.max(0, magnitude - OVER_SUBTRACTION_FACTOR * noiseFloor[k]);
        cleanedPower[k] = cleanedMagnitude * cleanedMagnitude;
      }
    }

    for (let m = 0; m < numMelBins; m++) {
      const filter = MEL_FILTERBANK[m];
      let sum = 0;
      for (let k = 0; k < filter.length; k++) {
        sum += filter[k] * cleanedPower[k];
      }
      melPower[m * numFrames + t] = sum;
    }
  }

  // power_to_db(S, ref=max): matches librosa.power_to_db exactly, including
  // its default top_db=80.0 floor. librosa computes:
  //   log_spec = 10*log10(max(amin, S)) - 10*log10(max(amin, ref))
  //   log_spec = max(log_spec, log_spec.max() - top_db)
  // That final clamp is critical and was missing here: without it, a single
  // near-silent mel bin can land anywhere from -80dB to -300dB depending on
  // tiny floating-point noise in the noise floor, and since the image is
  // normalized by (db - min)/(max - min), that one unstable bin was
  // dragging the brightness scale for the ENTIRE 128x128 image around.
  // Confirmed numerically: JS mel power matched librosa's to ~1e-7 relative
  // error, but without the top_db floor, one bin differed by 15dB, which
  // alone was enough to visibly corrupt several classes' spectrograms.
  const AMIN = 1e-10;
  const TOP_DB = 80.0;

  let maxPower = 0;
  for (let i = 0; i < melPower.length; i++) {
    if (melPower[i] > maxPower) maxPower = melPower[i];
  }
  const refPower = Math.max(maxPower, AMIN);
  const refDb = 10 * Math.log10(refPower);

  const rawDb = new Float64Array(melPower.length);
  let rawMaxDb = -Infinity;
  for (let i = 0; i < melPower.length; i++) {
    const db = 10 * Math.log10(Math.max(melPower[i], AMIN)) - refDb;
    rawDb[i] = db;
    if (db > rawMaxDb) rawMaxDb = db;
  }

  const floor = rawMaxDb - TOP_DB;
  const melDb = new Float64Array(melPower.length);
  let minDb = Infinity;
  let maxDb = -Infinity;
  for (let i = 0; i < melPower.length; i++) {
    const db = Math.max(rawDb[i], floor);
    melDb[i] = db;
    if (db < minDb) minDb = db;
    if (db > maxDb) maxDb = db;
  }

  // Normalize to 0-255, exactly like signal_to_spectrogram_image() in preprocess.py
  const range = Math.max(maxDb - minDb, 1e-8);
  const normalized = new Float64Array(melDb.length);
  for (let i = 0; i < melDb.length; i++) {
    normalized[i] = ((melDb[i] - minDb) / range) * 255;
  }

  // Resize (numMelBins x numFrames) -> (IMG_SIZE x IMG_SIZE)
  const resized = bilinearResize(normalized, numMelBins, numFrames, IMG_SIZE, IMG_SIZE);

  const output = new Uint8Array(IMG_SIZE * IMG_SIZE);
  for (let i = 0; i < output.length; i++) {
    output[i] = Math.max(0, Math.min(255, Math.round(resized[i])));
  }
  return output;
}
