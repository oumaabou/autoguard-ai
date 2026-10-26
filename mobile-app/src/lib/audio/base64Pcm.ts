/**
 * base64Pcm.ts
 * ============
 * Tiny, dependency-free base64 -> bytes decoder, and a helper to interpret
 * those bytes as little-endian 16-bit signed PCM samples (the format
 * react-native-live-audio-stream delivers audio chunks in).
 */

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const BASE64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < BASE64_CHARS.length; i++) {
  BASE64_LOOKUP[BASE64_CHARS[i]] = i;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const byteLength = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_LOOKUP[clean[i]] ?? 0;
    const c1 = BASE64_LOOKUP[clean[i + 1]] ?? 0;
    const c2 = clean[i + 2] !== undefined ? BASE64_LOOKUP[clean[i + 2]] : undefined;
    const c3 = clean[i + 3] !== undefined ? BASE64_LOOKUP[clean[i + 3]] : undefined;

    const triple = (c0 << 18) | (c1 << 12) | ((c2 ?? 0) << 6) | (c3 ?? 0);

    if (byteIndex < byteLength) bytes[byteIndex++] = (triple >> 16) & 0xff;
    if (c2 !== undefined && byteIndex < byteLength) bytes[byteIndex++] = (triple >> 8) & 0xff;
    if (c3 !== undefined && byteIndex < byteLength) bytes[byteIndex++] = triple & 0xff;
  }

  return bytes;
}

/** Interpret raw bytes as little-endian 16-bit signed PCM, normalized to [-1, 1]. */
export function pcm16BytesToFloat64(bytes: Uint8Array): Float64Array {
  const sampleCount = Math.floor(bytes.length / 2);
  const samples = new Float64Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const lo = bytes[i * 2];
    const hi = bytes[i * 2 + 1];
    let value = (hi << 8) | lo;
    if (value >= 0x8000) value -= 0x10000; // interpret as signed
    samples[i] = value / 32768;
  }
  return samples;
}
