/**
 * tflite.ts
 * =========
 * Loads the bundled autoguard_model.tflite and runs inference against a
 * single 128x128 grayscale spectrogram image.
 *
 * NOTE: react-native-fast-tflite is a native module (Nitro Modules based),
 * so it requires a custom Expo dev client, same as the audio recorder.
 *   npm install react-native-fast-tflite react-native-nitro-modules
 *   npx expo prebuild
 *
 * The model file lives at assets/model/autoguard_model.tflite and is
 * registered as a bundleable asset via metro.config.js (tflite added to
 * resolver.assetExts).
 *
 * Model loading goes through expo-asset rather than a bare require() - see
 * getModel() below for why: react-native-fast-tflite 3.0.1 (current npm
 * latest as of Aug 2026) has a real-release-build-only bug where a bare
 * require() resolves to something its own native loader can't read.
 */

import { loadTensorflowModel, TensorflowModel } from "react-native-fast-tflite";
import { Asset } from "expo-asset";
import { IMG_SIZE } from "../audio/spectrogram";

let cachedModel: TensorflowModel | null = null;

async function getModel(): Promise<TensorflowModel> {
  if (cachedModel) return cachedModel;

  // react-native-fast-tflite 3.0.1 has a bug where a bare require(...)
  // resolves - only in a real release/EAS build, never through the Metro
  // dev server, which is why this was never caught testing locally - to a
  // scheme-less Android res/raw resource name (e.g.
  // "assets_model_autoguard_model") that its native HybridAssetLoader then
  // feeds straight into java.net.URL(...), throwing
  // "MalformedURLException: no protocol". There's a fix on the library's
  // main branch (falls back to res/raw lookup instead of assuming a URL)
  // but it hasn't been published to npm yet.
  //
  // Sidestepping it: resolve the bundled asset to a real file:// URI
  // ourselves via expo-asset first, then hand fast-tflite an explicit
  // { url } - a first-class documented loading mode that always goes
  // through its loadFromUrl path (which has a scheme and works fine),
  // never touching the broken res/raw branch at all.
  const resolvedAsset = await Asset.fromModule(
    require("../../../assets/model/autoguard_model.tflite")
  ).downloadAsync();

  if (!resolvedAsset.localUri) {
    throw new Error(
      "Could not resolve a local file:// path for the bundled TFLite model " +
        `(asset.uri was "${resolvedAsset.uri}") - it may not be bundled correctly for this build.`
    );
  }

  cachedModel = await loadTensorflowModel(
    { url: resolvedAsset.localUri },
    [] // no GPU delegate - CPU inference only
  );
  return cachedModel;
}

/**
 * Runs inference on one 128x128 grayscale image (values 0-255) and returns
 * the raw softmax output (one probability per class, in labels.txt order).
 */
export async function runInference(image: Uint8Array): Promise<Float32Array> {
  if (image.length !== IMG_SIZE * IMG_SIZE) {
    throw new Error(
      `runInference expects a ${IMG_SIZE}x${IMG_SIZE} image (${IMG_SIZE * IMG_SIZE} values), got ${image.length}`
    );
  }

  const model = await getModel();

  // Model was exported with inference_input_type = tf.uint8, expecting raw
  // 0-255 pixel values shaped (1, 128, 128, 1) - the Rescaling(1/255) layer
  // is baked into the model itself, so no normalization is needed here.
  //
  // runSync expects a raw ArrayBuffer per tensor, not a TypedArray - extract
  // the exact slice in case `image` is ever a view into a larger buffer.
  const inputBuffer = image.buffer.slice(
    image.byteOffset,
    image.byteOffset + image.byteLength
  ) as ArrayBuffer; // Uint8Array we construct is always backed by a plain ArrayBuffer, never SharedArrayBuffer
  const outputs = model.runSync([inputBuffer]);

  // Single softmax output tensor, one probability per class.
  return new Float32Array(outputs[0] as unknown as ArrayBuffer);
}
