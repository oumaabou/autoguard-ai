/**
 * classify.ts
 * ===========
 * Top-level orchestration: record audio -> estimate noise floor from the
 * whole recording -> window it -> spectrogram + denoise each window -> run
 * TFLite inference on each -> average across windows for a single, more
 * stable prediction than any one 156ms window alone.
 */

import { recordForDuration } from "../audio/recorder";
import { prepareRecording } from "../audio/windowing";
import { computeMelSpectrogramImage } from "../audio/spectrogram";
import { estimateNoiseFloor } from "../audio/noiseReduction";
import { runInference } from "./tflite";
import { FAULT_LABELS } from "../../constants/faults";

const RECORDING_DURATION_MS = 4000; // ~4s -> plenty of 4000-sample windows at 25.6kHz

/**
 * Confidence gating thresholds - see the "fault tolerant, not confidently
 * wrong" discussion this came out of. Real-world recordings (background
 * noise, mic/speaker distance, room acoustics) can meaningfully degrade a
 * reading even though the underlying model is accurate on clean audio (94%+
 * on its own held-out test set - verified separately). Rather than always
 * presenting a single top-1 label as if it were certain, a result below
 * BOTH thresholds gets flagged as uncertain so the UI can ask for a retake
 * instead of confidently naming the wrong fault.
 *
 * CONFIDENCE_THRESHOLD: the averaged top-class probability across all
 * windows. 0.5 is not a rigorously derived number - it's chosen to be
 * comfortably above the 1/6 ~= 16.7% random-chance baseline for this
 * 6-class problem, while still being reachable by a genuinely clean
 * recording. Revisit once more real-world confidence data comes in.
 *
 * AGREEMENT_THRESHOLD: fraction of INDIVIDUAL windows whose own top class
 * matches the final averaged winner. This catches a failure mode averaging
 * alone can hide: e.g. 3 windows confidently say "healthy" and 3 confidently
 * say "voltage_unbalance" can average out to a so-so-looking 45%/40% split
 * that still clears a confidence-only threshold, even though the reading is
 * actually very inconsistent window-to-window (likely noise/distance
 * corrupting part of the recording, not a stable signal).
 */
export const CONFIDENCE_THRESHOLD = 0.5;
export const AGREEMENT_THRESHOLD = 0.5;

export interface ClassificationResult {
  label: string;
  classIndex: number;
  confidence: number; // 0-1
  probabilities: number[]; // one per class, in FAULT_LABELS order
  windowsAnalyzed: number;
  /** Fraction of individual windows whose own top prediction matches the
   * final averaged winner, in [0, 1]. See AGREEMENT_THRESHOLD above. */
  windowAgreement: number;
  /** True only if BOTH `confidence >= CONFIDENCE_THRESHOLD` AND
   * `windowAgreement >= AGREEMENT_THRESHOLD` - callers should treat a
   * `false` result as "inconclusive, ask for a retake" rather than
   * presenting `label` as a definite diagnosis. */
  isConfident: boolean;
  /** How much noise-reduction strength was actually applied, in [0, 1].
   * 0 means the recording's estimated noise floor looked tonal/harmonic
   * (i.e. just quiet engine content, not real background noise) and
   * subtraction was skipped; 1 means it looked like genuine broadband
   * noise and full-strength subtraction was applied. Exposed mainly for
   * debugging - see noiseReduction.ts for why this is adaptive now. */
  denoiseStrength: number;
}

export interface ClassifyOptions {
  /** Set to false to skip spectral-subtraction noise reduction entirely,
   * e.g. when testing against a clean pre-recorded clip. When true
   * (the default), noise reduction is still only applied adaptively - see
   * noiseReduction.ts's estimateNoiseFloor(). */
  denoise?: boolean;
}

export async function recordAndClassify(
  options: ClassifyOptions = {}
): Promise<ClassificationResult> {
  const { samples, sampleRate } = await recordForDuration(RECORDING_DURATION_MS);
  return classifyRawAudio(samples, sampleRate, options);
}

/**
 * Runs the same windowing -> denoise -> spectrogram -> inference pipeline
 * on an arbitrary raw audio buffer. Exposed separately from
 * recordAndClassify() so it can also be used to classify a pre-recorded
 * .wav test clip (e.g. from ai-pipeline/test_clips/) for validation.
 */
export async function classifyRawAudio(
  samples: Float64Array,
  sampleRate: number,
  options: ClassifyOptions = {}
): Promise<ClassificationResult> {
  const denoise = options.denoise ?? true;
  const { resampled, windows } = prepareRecording(samples, sampleRate);

  if (windows.length === 0) {
    throw new Error("Recording was too short to analyze. Please try again.");
  }

  let noiseFloor: Float64Array | undefined;
  let denoiseStrength = 0;
  if (denoise) {
    const estimate = estimateNoiseFloor(resampled);
    denoiseStrength = estimate.strength;
    // Skip passing a floor at all when strength is ~0, instead of passing
    // an all-but-zero array - avoids doing pointless subtraction work per
    // window and exactly matches the denoise=false code path.
    noiseFloor = estimate.strength > 0 ? estimate.noiseFloor : undefined;
  }

  const numClasses = FAULT_LABELS.length;
  const summedProbabilities = new Float64Array(numClasses);
  const perWindowTopIndex: number[] = [];

  for (const window of windows) {
    const image = computeMelSpectrogramImage(window, noiseFloor);
    const probabilities = await runInference(image);
    for (let i = 0; i < numClasses; i++) {
      summedProbabilities[i] += probabilities[i] ?? 0;
    }

    let windowBestIndex = 0;
    for (let i = 1; i < numClasses; i++) {
      if ((probabilities[i] ?? 0) > (probabilities[windowBestIndex] ?? 0)) windowBestIndex = i;
    }
    perWindowTopIndex.push(windowBestIndex);
  }

  const averaged = Array.from(summedProbabilities, (sum) => sum / windows.length);

  let bestIndex = 0;
  for (let i = 1; i < averaged.length; i++) {
    if (averaged[i] > averaged[bestIndex]) bestIndex = i;
  }

  const agreeingWindows = perWindowTopIndex.filter((idx) => idx === bestIndex).length;
  const windowAgreement = agreeingWindows / windows.length;
  const confidence = averaged[bestIndex];
  const isConfident = confidence >= CONFIDENCE_THRESHOLD && windowAgreement >= AGREEMENT_THRESHOLD;

  return {
    label: FAULT_LABELS[bestIndex],
    classIndex: bestIndex,
    confidence,
    probabilities: averaged,
    windowsAnalyzed: windows.length,
    windowAgreement,
    isConfident,
    denoiseStrength,
  };
}
