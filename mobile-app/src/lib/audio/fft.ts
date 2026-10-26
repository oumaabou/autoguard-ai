/**
 * fft.ts
 * ======
 * Minimal iterative radix-2 Cooley-Tukey FFT, used by spectrogram.ts to
 * compute the STFT of a recorded engine-sound window on-device.
 *
 * There is no native FFT available without pulling in a heavier native
 * audio DSP library, so this is a small self-contained implementation.
 * It only supports power-of-two lengths (we always call it with N_FFT =
 * 1024, matching preprocess.py).
 */

/** In-place iterative FFT. re/im must both have length = power of two. */
export function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new Error(`fftInPlace: length must be a power of two, got ${n}`);
  }

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Iterative Cooley-Tukey butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < halfLen; k++) {
        const angle = angleStep * k;
        const wRe = Math.cos(angle);
        const wIm = Math.sin(angle);

        const evenIdx = i + k;
        const oddIdx = i + k + halfLen;

        const oddRe = re[oddIdx] * wRe - im[oddIdx] * wIm;
        const oddIm = re[oddIdx] * wIm + im[oddIdx] * wRe;

        re[oddIdx] = re[evenIdx] - oddRe;
        im[oddIdx] = im[evenIdx] - oddIm;
        re[evenIdx] += oddRe;
        im[evenIdx] += oddIm;
      }
    }
  }
}

/**
 * Real-input FFT convenience wrapper. Returns the power spectrum
 * (|X[k]|^2) for the first n/2 + 1 bins (the non-redundant half for a
 * real-valued input), matching what librosa.stft/melspectrogram use
 * internally.
 */
export function realFftPowerSpectrum(frame: Float64Array): Float64Array {
  const n = frame.length;
  const re = Float64Array.from(frame);
  const im = new Float64Array(n);
  fftInPlace(re, im);

  const numBins = n / 2 + 1;
  const power = new Float64Array(numBins);
  for (let k = 0; k < numBins; k++) {
    power[k] = re[k] * re[k] + im[k] * im[k];
  }
  return power;
}
