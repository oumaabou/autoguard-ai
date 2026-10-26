/**
 * recorder.ts
 * ===========
 * Captures raw PCM audio from the microphone for on-device fault
 * classification.
 *
 * Uses react-native-live-audio-stream instead of expo-audio/expo-av,
 * because expo-audio records compressed formats (.m4a/AAC) intended for
 * playback, and there is no practical way to decode compressed audio back
 * into raw samples in pure JS. Fault detection needs direct access to PCM
 * samples to run the same STFT/Mel pipeline used during training.
 *
 * NOTE: react-native-live-audio-stream is a native module, so it requires
 * a custom Expo dev client (it will not work inside Expo Go). Run:
 *   npx expo install expo-dev-client
 *   npm install react-native-live-audio-stream
 *   npx expo prebuild
 *   npx expo run:android   (or run:ios)
 */

import LiveAudioStream from "react-native-live-audio-stream";
import { PermissionsAndroid, Platform } from "react-native";
import { base64ToBytes, pcm16BytesToFloat64 } from "./base64Pcm";

// Most Android/iOS devices reliably support 44.1kHz mic capture; we
// resample down to the model's 25,600Hz elsewhere (see resample.ts).
const DEVICE_SAMPLE_RATE = 44100;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

export interface RecordingResult {
  samples: Float64Array;
  sampleRate: number;
}

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true; // iOS permission is handled via Info.plist prompt
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    {
      title: "Microphone Permission",
      message: "AutoGuard AI needs microphone access to listen to your engine.",
      buttonPositive: "Allow",
    }
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Records audio for `durationMs` milliseconds and resolves with the raw
 * PCM samples captured during that window.
 */
export async function recordForDuration(durationMs: number): Promise<RecordingResult> {
  const hasPermission = await ensureMicPermission();
  if (!hasPermission) {
    throw new Error("Microphone permission was denied.");
  }

  LiveAudioStream.init({
    sampleRate: DEVICE_SAMPLE_RATE,
    channels: CHANNELS,
    bitsPerSample: BITS_PER_SAMPLE,
    audioSource: 6, // Android MediaRecorder.AudioSource.MIC
    bufferSize: 4096,
    // Required by the library's Options type. We only consume audio via the
    // "data" event stream below, not this file, but the native side still
    // wants a filename to write to.
    wavFile: "autoguard_recording.wav",
  });

  const chunks: Float64Array[] = [];
  const onData = (base64Chunk: string) => {
    const bytes = base64ToBytes(base64Chunk);
    chunks.push(pcm16BytesToFloat64(bytes));
  };

  return new Promise((resolve, reject) => {
    try {
      LiveAudioStream.on("data", onData);
      LiveAudioStream.start();

      setTimeout(() => {
        LiveAudioStream.stop();

        const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
        const samples = new Float64Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          samples.set(chunk, offset);
          offset += chunk.length;
        }

        resolve({ samples, sampleRate: DEVICE_SAMPLE_RATE });
      }, durationMs);
    } catch (err) {
      reject(err);
    }
  });
}
