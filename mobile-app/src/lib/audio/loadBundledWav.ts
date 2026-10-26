/**
 * loadBundledWav.ts
 * =================
 * Reads a bundled .wav asset's raw bytes for debugging/testing purposes
 * (bypassing microphone capture entirely - see debug-tflite.tsx).
 */

import { Asset } from "expo-asset";
// SDK 54+ deprecated readAsStringAsync on the main "expo-file-system" export
// in favor of the new File/Directory class API. We just need to read one
// small bundled asset to base64, so keep using the simple legacy API here
// rather than rewriting this debug-only helper against the new classes.
import * as FileSystem from "expo-file-system/legacy";
import { base64ToBytes } from "./base64Pcm";
import { decodeWav, DecodedWav } from "./wavDecoder";

export async function loadBundledWav(moduleId: number): Promise<DecodedWav> {
  const asset = Asset.fromModule(moduleId);
  await asset.downloadAsync();
  if (!asset.localUri) {
    throw new Error("Failed to resolve bundled .wav asset URI.");
  }

  const base64 = await FileSystem.readAsStringAsync(asset.localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(base64);
  return decodeWav(bytes);
}
