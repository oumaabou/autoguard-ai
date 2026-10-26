"""
generate_test_clips.py
=======================
Generates full-length, playable .wav test clips (one per raw dataset file,
~6.4 seconds each at 25,600 Hz) instead of the ~156ms training chunks in
app_audio_assets/. Useful for:

  - Playing a known-fault sound through a speaker near your phone to test
    the app's recording -> spectrogram -> inference pipeline end-to-end.
  - Sanity-checking the on-device Mel-Spectrogram JS implementation against
    ai-pipeline's Python one on the exact same source audio.

Run (from inside the ai-pipeline folder):
  python generate_test_clips.py
"""

import os

import numpy as np
from scipy.io import wavfile

DATASET_DIR = "datasets"
OUTPUT_DIR = "test_clips"
SAMPLE_RATE = 25600
SOUND_COLUMN_INDEX = 4

CLASSES = [
    "bearing_fault",
    "bowed_rotor",
    "broken_rotor_bars",
    "healthy",
    "rotor_misalignment",
    "voltage_unbalance",
]


def load_sound_column(filepath):
    skip_rows = 0
    with open(filepath, "r", errors="ignore") as f:
        for line in f:
            parts = line.strip().replace(",", " ").split()
            if len(parts) > SOUND_COLUMN_INDEX:
                try:
                    [float(p) for p in parts[:SOUND_COLUMN_INDEX + 1]]
                    break
                except ValueError:
                    pass
            skip_rows += 1

    return np.loadtxt(filepath, skiprows=skip_rows, usecols=SOUND_COLUMN_INDEX,
                       dtype=np.float64, ndmin=1)


def signal_to_wav(signal, sr, out_path):
    centered = signal - np.mean(signal)
    peak = np.max(np.abs(centered))
    normalized = centered / peak if peak > 0 else centered
    pcm16 = (normalized * 32767).astype(np.int16)
    wavfile.write(out_path, sr, pcm16)


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    total = 0

    for class_name in CLASSES:
        class_dir = os.path.join(DATASET_DIR, class_name)
        if not os.path.isdir(class_dir):
            print(f"[WARN] Missing class folder: {class_dir}")
            continue

        out_class_dir = os.path.join(OUTPUT_DIR, class_name)
        os.makedirs(out_class_dir, exist_ok=True)

        txt_files = sorted(f for f in os.listdir(class_dir) if f.lower().endswith(".txt"))
        for fname in txt_files:
            filepath = os.path.join(class_dir, fname)
            signal = load_sound_column(filepath)
            duration_s = len(signal) / SAMPLE_RATE

            out_name = os.path.splitext(fname)[0] + ".wav"
            out_path = os.path.join(out_class_dir, out_name)
            signal_to_wav(signal, SAMPLE_RATE, out_path)

            print(f"[{class_name}] {fname} -> {out_name} ({duration_s:.1f}s)")
            total += 1

    print(f"\nDone. Generated {total} full-length test clips in {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
