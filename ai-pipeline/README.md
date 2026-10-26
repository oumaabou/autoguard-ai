# ai-pipeline - data preparation, training, export

Turns raw motor recordings into spectrogram images, trains a small CNN and exports an INT8 TensorFlow Lite model used by the mobile app.

## Setup
```bash
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
```

## Data
The raw dataset (HUSTmotor `.txt` logs: columns Time, Vib_X, Vib_Y, Vib_Z, Sound) is **not** included. Download it from its original source and place it as:
```
datasets/<class_name>/<file>.txt   # 6 classes, 4 files each (5/10/20/30 Hz)
```
Classes: bearing_fault, bowed_rotor, broken_rotor_bars, healthy, rotor_misalignment, voltage_unbalance.

## Run
```bash
python preprocess.py --clean      # chunk -> 70/15/15 split -> 128x128 Mel-spectrogram PNGs
python augment_noise.py           # noisy copies of the TRAIN split (uses noise_samples/*.wav)
python train_model.py             # train, evaluate, export .tflite, write report + plots
python generate_test_clips.py     # full-length WAV test clips for end-to-end app testing
```

## Files
| File | Purpose |
|---|---|
| `preprocess.py` | Chunking, spectrogram generation, split |
| `augment_noise.py` | Additive-noise augmentation (train only) |
| `train_model.py` | CNN, training, evaluation, INT8 TFLite export |
| `autoguard_model.tflite` | Final quantised model (bundled in the app) |
| `labels.txt` | Class order |
| `classification_report.txt`, `confusion_matrix.png`, `training_curves.png` | Evaluation outputs |

> The feature constants (sample rate 25,600 Hz, window 4,000, n_fft 1024, hop 256, 128 mels) must match `mobile-app/src/lib/audio/constants.ts`.

See the root README for results and an honest discussion of the dataset's limitations.
