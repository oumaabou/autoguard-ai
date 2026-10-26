# mobile-app - AutoGuard AI (React Native / Expo)

Android app (Expo SDK 56, React Native 0.85, TypeScript). Records engine sound, classifies it on-device with TensorFlow Lite, and talks to the backend for explanations, chat, prices and accounts.

## Run
Native modules (`react-native-fast-tflite`, `react-native-live-audio-stream`) do **not** run in Expo Go - use a development build:
```bash
npm install
npx expo run:android           # builds and installs a dev client; keep Metro running
# or cloud build: eas build --profile preview --platform android
```
Backend URL is set in `src/lib/api.ts` (`API_BASE_URL`). Use `http://10.0.2.2:8000` for a local backend on the Android emulator.

## Where things live
| Path | What |
|---|---|
| `src/app/` | Screens (welcome, auth, dashboard, diagnostic, advocacy chat, evaluator, history, profile, debug-tflite) |
| `src/lib/audio/` | Recorder, resampling, windowing, FFT, Mel filterbank, noise reduction, spectrogram |
| `src/lib/ml/` | TFLite loading + inference, window averaging, confidence gating |
| `src/lib/` | API client, auth store, profile, exchange rates, i18n (6 languages) |
| `assets/model/` | `autoguard_model.tflite` |
| `assets/test_clips/` | One known-label clip per class for the `debug-tflite` screen |

`mobileapp://debug-tflite` runs the full pipeline on bundled clips without a microphone - useful to verify the model and DSP independently of room acoustics.
