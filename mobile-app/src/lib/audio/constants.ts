/**
 * constants.ts
 * ============
 * Shared feature-extraction constants. MUST always match the values in
 * ai-pipeline/preprocess.py and train_model.py - if you change any of
 * these on the Python side, update them here too, or on-device inference
 * will silently operate on a different feature distribution than the
 * model was trained on.
 */

export const SAMPLE_RATE = 25600;
export const WINDOW_SIZE = 4000; // samples per chunk, matches preprocess.py
export const N_FFT = 1024;
export const HOP_LENGTH = 256;
export const N_MELS = 128;
export const IMG_SIZE = 128;

// Spectral subtraction over-subtraction factor (noiseReduction.ts). 1.5
// matches the factor used in ai-pipeline/audio_processor.py's placeholder
// dual_domain_noise_mitigation, kept for consistency with that design intent.
export const OVER_SUBTRACTION_FACTOR = 1.5;
