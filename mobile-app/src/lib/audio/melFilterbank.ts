/**
 * melFilterbank.ts
 * ================
 * Builds a Mel filterbank matrix matching librosa.filters.mel's default
 * behavior (htk=False, i.e. the Slaney-style mel scale with 'slaney' area
 * normalization), since that's what preprocess.py used via
 * librosa.feature.melspectrogram(..., n_mels=128) during training.
 *
 * Note: this is a faithful from-scratch reimplementation of the formulas,
 * not a port of librosa's source. It should be numerically very close but
 * is not guaranteed to be bit-identical to librosa's output. If on-device
 * predictions look meaningfully worse than the training/test accuracy,
 * this is the first place to double check.
 */

const MIN_LOG_HZ = 1000.0;
const MIN_LOG_MEL = (MIN_LOG_HZ - 0) / (200.0 / 3);
const LOGSTEP = Math.log(6.4) / 27.0;

function hzToMel(hz: number): number {
  if (hz < MIN_LOG_HZ) {
    return hz / (200.0 / 3);
  }
  return MIN_LOG_MEL + Math.log(hz / MIN_LOG_HZ) / LOGSTEP;
}

function melToHz(mel: number): number {
  if (mel < MIN_LOG_MEL) {
    return (200.0 / 3) * mel;
  }
  return MIN_LOG_HZ * Math.exp(LOGSTEP * (mel - MIN_LOG_MEL));
}

/**
 * Returns a Float64Array[nMels] of Float64Array[numFftBins] filter weights,
 * i.e. filterbank[m][k] = weight of FFT bin k in mel band m.
 */
export function buildMelFilterbank(
  sampleRate: number,
  nFft: number,
  nMels: number,
  fMin = 0,
  fMax: number | null = null
): Float64Array[] {
  const fMaxResolved = fMax ?? sampleRate / 2;
  const numFftBins = Math.floor(nFft / 2) + 1;

  // Center frequencies of each FFT bin
  const fftFreqs = new Float64Array(numFftBins);
  for (let k = 0; k < numFftBins; k++) {
    fftFreqs[k] = (k * sampleRate) / nFft;
  }

  // nMels + 2 mel-spaced points, converted back to Hz
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(fMaxResolved);
  const melPoints = new Float64Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) {
    melPoints[i] = melMin + ((melMax - melMin) * i) / (nMels + 1);
  }
  const hzPoints = Float64Array.from(melPoints, melToHz);

  // Slaney-style area normalization: each filter is scaled by 2 / (hz[m+2] - hz[m])
  const enorm = new Float64Array(nMels);
  for (let m = 0; m < nMels; m++) {
    enorm[m] = 2.0 / (hzPoints[m + 2] - hzPoints[m]);
  }

  const filterbank: Float64Array[] = [];
  for (let m = 0; m < nMels; m++) {
    const fLeft = hzPoints[m];
    const fCenter = hzPoints[m + 1];
    const fRight = hzPoints[m + 2];
    const filter = new Float64Array(numFftBins);

    for (let k = 0; k < numFftBins; k++) {
      const freq = fftFreqs[k];
      let weight = 0;
      if (freq >= fLeft && freq <= fCenter && fCenter !== fLeft) {
        weight = (freq - fLeft) / (fCenter - fLeft);
      } else if (freq > fCenter && freq <= fRight && fRight !== fCenter) {
        weight = (fRight - freq) / (fRight - fCenter);
      }
      filter[k] = Math.max(0, weight) * enorm[m];
    }
    filterbank.push(filter);
  }

  return filterbank;
}
