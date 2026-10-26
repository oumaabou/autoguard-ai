/**
 * debug-tflite.tsx
 * ================
 * Debug screen for isolating TFLite/pipeline issues from real-world
 * microphone/speaker acoustic problems.
 *
 * "Run TFLite Test" - tests model loading + inference plumbing on a dummy
 * all-zero image. Confirms the native binding works at all.
 *
 * "Test bundled clips" - runs the FULL classification pipeline
 * (resample -> denoise -> spectrogram -> inference -> average) on known-
 * label .wav files bundled directly into the app, bypassing the
 * microphone and speaker entirely. If these come back correct with high
 * confidence, the JS pipeline is faithful to the trained model, and any
 * poor real-world mic results are a genuine acoustic domain-gap issue
 * (speaker/room/mic distortion), not a code bug.
 *
 * "Record Live Mic" - runs the exact same pipeline as the real dashboard
 * "Start Listening" button, but logs full diagnostic detail. Crucially, it
 * logs RAW signal stats (peak amplitude, RMS) BEFORE any processing - this
 * is the fastest way to tell whether the microphone captured real audio at
 * all, which matters a lot on emulators: Android emulators do NOT
 * automatically forward the host computer's real microphone unless it's
 * explicitly enabled in Android Studio's Extended Controls > Microphone
 * settings. If peak/RMS come back near 0 regardless of what's actually
 * happening in the room, that's an emulator audio passthrough problem, not
 * a bug in this pipeline.
 *
 * Navigate to it directly via: mobileapp://debug-tflite
 * Safe to delete once you're confident in the pipeline.
 */

import { useState } from "react";
import { Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { loadTensorflowModel } from "react-native-fast-tflite";
import { IMG_SIZE, N_MELS } from "../lib/audio/spectrogram";
import { FAULT_LABELS } from "../constants/faults";
import { loadBundledWav } from "../lib/audio/loadBundledWav";
import { classifyRawAudio } from "../lib/ml/classify";
import { recordForDuration } from "../lib/audio/recorder";

// True label is encoded in the filename - used only to print a PASS/FAIL
// marker in the log, has no effect on the classification itself.
const BUNDLED_CLIPS: { trueLabel: string; asset: number }[] = [
  { trueLabel: "bearing_fault", asset: require("../../assets/test_clips/bearing_fault_BF_10HZ.wav") },
  { trueLabel: "bowed_rotor", asset: require("../../assets/test_clips/bowed_rotor_BOW_10HZ.wav") },
  { trueLabel: "broken_rotor_bars", asset: require("../../assets/test_clips/broken_rotor_bars_BROKEN_10HZ.wav") },
  { trueLabel: "healthy", asset: require("../../assets/test_clips/healthy_H_10HZ.wav") },
  { trueLabel: "rotor_misalignment", asset: require("../../assets/test_clips/rotor_misalignment_MISAL_10HZ.wav") },
  { trueLabel: "voltage_unbalance", asset: require("../../assets/test_clips/voltage_unbalance_UNBAL_10HZ.wav") },
];

const RECORDING_DURATION_MS = 4000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function DebugTfliteScreen() {
  const [log, setLog] = useState<string[]>([]);
  const appendLog = (line: string) => setLog((prev) => [...prev, line]);

  const runModelTest = async () => {
    setLog([]);
    try {
      appendLog("Step 1: calling loadTensorflowModel(require(...))...");
      const model = await loadTensorflowModel(
        require("../../assets/model/autoguard_model.tflite"),
        []
      );
      appendLog("Step 1 OK: model loaded.");
      appendLog(`Model inputs: ${JSON.stringify(model.inputs)}`);
      appendLog(`Model outputs: ${JSON.stringify(model.outputs)}`);

      appendLog("Step 2: running inference on a dummy all-zero image...");
      const dummyImage = new Uint8Array(IMG_SIZE * IMG_SIZE);
      const outputs = model.runSync([dummyImage.buffer]);
      const probsArray = new Float32Array(outputs[0] as unknown as ArrayBuffer);
      appendLog(`Step 2 OK: raw output = ${JSON.stringify(Array.from(probsArray))}`);

      const probs = Array.from(probsArray);
      const bestIdx = probs.indexOf(Math.max(...probs));
      appendLog(`Predicted class: ${FAULT_LABELS[bestIdx]} (${(probs[bestIdx] * 100).toFixed(1)}%)`);
      appendLog("ALL TESTS PASSED.");
    } catch (err) {
      appendLog("FAILED:");
      appendLog(err instanceof Error ? (err.stack ?? err.message) : String(err));
    }
  };

  const runBundledClipTests = async (denoise: boolean) => {
    setLog([]);
    appendLog(`Running bundled clip tests (denoise=${denoise})...`);
    for (const { trueLabel, asset } of BUNDLED_CLIPS) {
      try {
        const { samples, sampleRate } = await loadBundledWav(asset);
        appendLog(`\n[${trueLabel}] loaded ${samples.length} samples @ ${sampleRate}Hz`);

        const result = await classifyRawAudio(samples, sampleRate, { denoise });
        const pass = result.label === trueLabel ? "PASS" : "FAIL";
        appendLog(
          `[${trueLabel}] -> predicted "${result.label}" (${(result.confidence * 100).toFixed(1)}%) ` +
            `across ${result.windowsAnalyzed} windows - ${pass} ` +
            `[agreement=${(result.windowAgreement * 100).toFixed(0)}% confident=${result.isConfident} denoiseStrength=${result.denoiseStrength.toFixed(2)}]`
        );
      } catch (err) {
        appendLog(`[${trueLabel}] ERROR: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    appendLog("\nDone.");
  };

  const runLiveMicTest = async () => {
    setLog([]);
    appendLog("Get your noise source (engine sound + background noise) ready...");
    for (let s = 3; s >= 1; s--) {
      appendLog(`Recording starts in ${s}...`);
      await sleep(1000);
    }
    appendLog("Recording now (4 seconds)...");
    try {
      const { samples, sampleRate } = await recordForDuration(RECORDING_DURATION_MS);

      // Raw signal stats BEFORE any processing - the fastest way to tell if
      // the microphone captured real audio at all, independent of anything
      // the classification pipeline does with it.
      let peak = 0;
      let sumSq = 0;
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        const v = samples[i];
        const abs = Math.abs(v);
        if (abs > peak) peak = abs;
        sumSq += v * v;
        sum += v;
      }
      const rms = Math.sqrt(sumSq / samples.length);
      const mean = sum / samples.length;
      appendLog(
        `\nRaw mic capture: ${samples.length} samples @ ${sampleRate}Hz | ` +
          `peak=${peak.toFixed(5)} rms=${rms.toFixed(5)} mean=${mean.toFixed(5)}`
      );
      if (peak < 0.001) {
        appendLog(
          "WARNING: peak amplitude is ~0 - the microphone does not appear to be " +
            "capturing any real audio, regardless of what's happening in the room. " +
            "On an emulator this almost always means the virtual microphone isn't " +
            "wired up to your computer's real mic - check Android Studio's Extended " +
            "Controls > Microphone > 'Virtual microphone uses host audio input'."
        );
      } else if (peak < 0.02) {
        appendLog(
          "NOTE: peak amplitude is very low - the mic may be picking up something, " +
            "but it's extremely quiet relative to a full-scale signal. Results may " +
            "still be unreliable."
        );
      }

      // Run BOTH denoise settings on the exact same captured samples, not
      // two separate recordings - isolates whether adaptive noise reduction
      // itself is helping or hurting THIS specific take, rather than mixing
      // that question up with take-to-take room/mic variance.
      const withDenoise = await classifyRawAudio(samples, sampleRate, { denoise: true });
      const withoutDenoise = await classifyRawAudio(samples, sampleRate, { denoise: false });

      appendLog(`\n=== denoise ON ===`);
      appendLog(
        `Predicted: "${withDenoise.label}" (${(withDenoise.confidence * 100).toFixed(1)}%) ` +
          `[agreement=${(withDenoise.windowAgreement * 100).toFixed(0)}% confident=${withDenoise.isConfident}]`
      );
      appendLog(
        `Denoise strength applied: ${withDenoise.denoiseStrength.toFixed(2)} ` +
          (withDenoise.denoiseStrength > 0
            ? "(real background noise detected - subtraction engaged)"
            : "(recording looked clean/tonal - subtraction skipped)")
      );
      FAULT_LABELS.forEach((label, i) => {
        appendLog(`  ${label}: ${(withDenoise.probabilities[i] * 100).toFixed(1)}%`);
      });

      appendLog(`\n=== denoise OFF ===`);
      appendLog(
        `Predicted: "${withoutDenoise.label}" (${(withoutDenoise.confidence * 100).toFixed(1)}%) ` +
          `[agreement=${(withoutDenoise.windowAgreement * 100).toFixed(0)}% confident=${withoutDenoise.isConfident}]`
      );
      FAULT_LABELS.forEach((label, i) => {
        appendLog(`  ${label}: ${(withoutDenoise.probabilities[i] * 100).toFixed(1)}%`);
      });

      appendLog(`\nWindows analyzed: ${withDenoise.windowsAnalyzed}`);
    } catch (err) {
      appendLog("FAILED:");
      appendLog(err instanceof Error ? (err.stack ?? err.message) : String(err));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>TFLite Debug</Text>
      <Text style={styles.subtitle}>N_MELS={N_MELS}, IMG_SIZE={IMG_SIZE}</Text>
      <Text style={[styles.subtitle, { color: "#0f0" }]}>BUILD MARKER: resize-fix-v2</Text>

      <TouchableOpacity style={styles.button} onPress={runModelTest}>
        <Text style={styles.buttonText}>1. Run TFLite Plumbing Test</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={() => runBundledClipTests(true)}>
        <Text style={styles.buttonText}>2. Test Bundled Clips (denoise ON)</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.buttonTertiary]} onPress={() => runBundledClipTests(false)}>
        <Text style={styles.buttonText}>3. Test Bundled Clips (denoise OFF)</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.buttonQuaternary]} onPress={runLiveMicTest}>
        <Text style={styles.buttonText}>4. Record Live Mic (4s) + Classify</Text>
      </TouchableOpacity>

      <ScrollView style={{ marginTop: 16 }}>
        {log.map((line, i) => (
          <Text key={i} style={styles.logLine} selectable>
            {line}
          </Text>
        ))}
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0b" },
  title: { color: "white", fontSize: 22, fontWeight: "700", marginBottom: 4 },
  subtitle: { color: "#888", fontSize: 13, marginBottom: 16 },
  button: { backgroundColor: "#208AEF", padding: 14, borderRadius: 10, alignItems: "center", marginBottom: 10 },
  buttonSecondary: { backgroundColor: "#2E8B57" },
  buttonTertiary: { backgroundColor: "#8B5A2B" },
  buttonQuaternary: { backgroundColor: "#7B3FA0" },
  buttonText: { color: "white", fontWeight: "700", fontSize: 15 },
  logLine: { color: "#0f0", fontFamily: "monospace", fontSize: 12, marginBottom: 4 },
});
