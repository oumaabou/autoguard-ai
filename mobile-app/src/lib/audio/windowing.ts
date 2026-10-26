/**
 * windowing.ts
 * ============
 * Splits a full recording into consecutive fixed-size windows, matching
 * how preprocess.py chopped each raw training file into WINDOW_SIZE chunks.
 *
 * A single WINDOW_SIZE (4000 samples @ 25,600Hz = ~156ms) is too short and
 * noise-prone to trust for a single real-world reading, so the app records
 * several seconds of audio and classifies EVERY window, then the caller
 * (classify.ts) averages the predictions for a far more stable result than
 * any one window alone.
 */

import { linearResample } from "./resample";
import { SAMPLE_RATE, WINDOW_SIZE } from "./constants";

export interface PreparedRecording {
  /** Full recording, resampled to the model's 25,600Hz - used for noise floor estimation. */
  resampled: Float64Array;
  /** The same recording chopped into consecutive WINDOW_SIZE chunks for per-window inference. */
  windows: Float64Array[];
}

export function prepareRecording(
  rawSamples: Float64Array,
  rawSampleRate: number
): PreparedRecording {
  const resampled = linearResample(rawSamples, rawSampleRate, SAMPLE_RATE);

  const numWindows = Math.floor(resampled.length / WINDOW_SIZE);
  const windows: Float64Array[] = [];
  for (let i = 0; i < numWindows; i++) {
    windows.push(resampled.slice(i * WINDOW_SIZE, (i + 1) * WINDOW_SIZE));
  }

  return { resampled, windows };
}
