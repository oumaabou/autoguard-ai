"""
preprocess.py
=============
Autoguard AI - Data Preprocessing Pipeline

Converts raw HUSTmotor .txt sensor logs into:
  1. 128x128 Mel-Spectrogram images  -> ml_pipeline/{train,validation,test}/<class>/
  2. Matching playable .wav clips    -> app_audio_assets/{train,validation,test}/<class>/

Pipeline per class:
  - Read EVERY .txt file belonging to that class (e.g. bearing_fault has
    5HZ, 10HZ, 20HZ, 30HZ files - each representing a different operating
    speed, not a different split).
  - Chop each file into ~4,000-row windows and isolate the Sound channel
    (column index 4 of Time, Vib_X, Vib_Y, Vib_Z, Sound).
  - Pool ALL chunks from ALL files in the class together into one big list.
  - Shuffle that pooled list, THEN split it 70/15/15 into train/val/test.
  - For every chunk, write one spectrogram PNG and one matching WAV.

Why split the pooled chunks instead of the raw files:
  If you only have 4-5 raw .txt files per class and you split at the FILE
  level (e.g. 70% of 4 files = 2.8 -> rounds to 3 train, 15% = 0.6 -> rounds
  to 1 validation, 15% = 0.6 -> rounds DOWN to 0 test), the test split can
  end up completely empty. Pooling first means you are dividing up dozens
  or hundreds of chunks instead of a handful of files, so every split gets
  a healthy, well-populated set of examples.

  Trade-off: because chunks from the same recording can now land in
  different splits, this is a slightly less strict leakage boundary than a
  file-level split. Given how few raw recordings exist per class here,
  pooling is the more practical choice - just be aware of it if you ever
  get access to many more recordings per class.

Dependencies (Windows PowerShell):
  python -m pip install numpy librosa scipy pillow

Run (from inside the ai-pipeline folder):
  python preprocess.py --clean

  # Or process one class at a time (useful if the full run is slow):
  python preprocess.py --clean --only-class bearing_fault
  python preprocess.py --only-class rotor_misalignment
"""

import argparse
import os
import random
import shutil

import numpy as np
from PIL import Image
from scipy.io import wavfile

try:
    import librosa
except ImportError as exc:
    raise SystemExit(
        "Missing dependency 'librosa'. Install with:\n"
        "  python -m pip install librosa"
    ) from exc

# --------------------------------------------------------------------------
# CONFIG
# --------------------------------------------------------------------------
# Script is run from inside .../autoguard-ai/ai-pipeline, so paths are
# relative to that folder (matches the existing datasets/, ml_pipeline/,
# app_audio_assets/ folders already sitting next to this script).
BASE_DIR = "."
DATASET_DIR = os.path.join(BASE_DIR, "datasets")
ML_PIPELINE_DIR = os.path.join(BASE_DIR, "ml_pipeline")
AUDIO_ASSETS_DIR = os.path.join(BASE_DIR, "app_audio_assets")

CLASSES = [
    "bearing_fault",
    "bowed_rotor",
    "broken_rotor_bars",
    "healthy",
    "rotor_misalignment",
    "voltage_unbalance",
]

SAMPLE_RATE = 25600          # Hz, HUSTmotor dataset sampling frequency
SOUND_COLUMN_INDEX = 4       # 0-based: Time, Vib_X, Vib_Y, Vib_Z, Sound
WINDOW_SIZE = 4000           # samples per chunk (fixed size, not fixed count)

IMG_SIZE = 128
N_MELS = 128
N_FFT = 1024
HOP_LENGTH = 256

TRAIN_SPLIT = 0.70
VAL_SPLIT = 0.15
TEST_SPLIT = 0.15           # kept for clarity; remainder after train/val

RANDOM_SEED = 42
SPLITS = ["train", "validation", "test"]


# --------------------------------------------------------------------------
# I/O helpers
# --------------------------------------------------------------------------
def create_output_dirs(clean=False):
    for split in SPLITS:
        for class_name in CLASSES:
            img_dir = os.path.join(ML_PIPELINE_DIR, split, class_name)
            wav_dir = os.path.join(AUDIO_ASSETS_DIR, split, class_name)

            if clean:
                for d in (img_dir, wav_dir):
                    if os.path.isdir(d):
                        shutil.rmtree(d)

            os.makedirs(img_dir, exist_ok=True)
            os.makedirs(wav_dir, exist_ok=True)


def load_sound_column(filepath):
    """Read a raw HUSTmotor .txt file and return only the Sound channel.

    Uses vectorized NumPy parsing (fast) instead of a per-line Python loop
    (slow on files with 100k+ rows). Header/label rows are detected once by
    finding the first line that parses as SOUND_COLUMN_INDEX+1 floats, then
    everything from that line onward is loaded in one vectorized pass.
    """
    skip_rows = 0
    with open(filepath, "r", errors="ignore") as f:
        for line in f:
            parts = line.strip().replace(",", " ").split()
            if len(parts) > SOUND_COLUMN_INDEX:
                try:
                    [float(p) for p in parts[:SOUND_COLUMN_INDEX + 1]]
                    break  # first fully-numeric data row found
                except ValueError:
                    pass
            skip_rows += 1

    data = np.loadtxt(filepath, skiprows=skip_rows, usecols=SOUND_COLUMN_INDEX,
                       dtype=np.float64, ndmin=1)
    return data


def chunk_signal(signal, window_size):
    """Split signal into fixed-size, contiguous, non-overlapping windows.
    Any leftover samples that don't fill a full window are dropped."""
    total_len = len(signal)
    num_windows = total_len // window_size
    return [signal[i * window_size:(i + 1) * window_size] for i in range(num_windows)]




#Convert a 1D sound chunk into a normalized, resized Mel-Spectrogram image.
def signal_to_spectrogram_image(signal, sr, img_size):
    mel = librosa.feature.melspectrogram(
        y=signal.astype(np.float32),
        sr=sr,
        n_fft=N_FFT,
        hop_length=HOP_LENGTH,
        n_mels=N_MELS,
    )
    mel_db = librosa.power_to_db(mel, ref=np.max)

    # Normalize to 0-255 so amplitude differences between recordings
    mel_min, mel_max = mel_db.min(), mel_db.max()
    mel_norm = (mel_db - mel_min) / (mel_max - mel_min + 1e-8)
    mel_uint8 = (mel_norm * 255).astype(np.uint8)

    img = Image.fromarray(mel_uint8)
    img = img.resize((img_size, img_size), Image.BILINEAR)
    return img


def chunk_to_wav(signal, sr, out_path):
    """Scale a sound chunk to 16-bit PCM and write it as a playable .wav."""
    centered = signal - np.mean(signal)
    peak = np.max(np.abs(centered))
    normalized = centered / peak if peak > 0 else centered
    pcm16 = (normalized * 32767).astype(np.int16)
    wavfile.write(out_path, sr, pcm16)


# --------------------------------------------------------------------------
# Chunk collection (per class, pooled across ALL files in that class)
# --------------------------------------------------------------------------
def collect_class_chunks(class_dir, window_size):
    """Read every .txt file in class_dir, chop each into fixed-size windows,
    and return one flat pooled list of (chunk_array, source_filename, local_index)."""
    txt_files = sorted(f for f in os.listdir(class_dir) if f.lower().endswith(".txt"))
    pool = []
    for fname in txt_files:
        filepath = os.path.join(class_dir, fname)
        try:
            sound = load_sound_column(filepath)
        except Exception as exc:
            print(f"  [ERROR] {fname}: {exc}")
            continue

        chunks = chunk_signal(sound, window_size)
        if not chunks:
            print(f"  [WARN] {fname}: shorter than one window ({window_size} samples), skipping")
            continue

        base_name = os.path.splitext(fname)[0]
        for local_idx, chunk in enumerate(chunks):
            pool.append((chunk, base_name, local_idx))

        print(f"  {fname} -> {len(chunks)} chunks")

    return txt_files, pool

#shuffle the pooled chunks and divide them 70/15/15 into train/val/test.
def split_pool(pool, seed):
    rng = random.Random(seed)
    shuffled = list(pool)
    rng.shuffle(shuffled)

    n = len(shuffled)
    n_train = int(n * TRAIN_SPLIT)
    n_val = int(n * VAL_SPLIT)
    # remainder goes to test so rounding never starves any split when n is small
    n_test = n - n_train - n_val

    return {
        "train": shuffled[:n_train],
        "validation": shuffled[n_train:n_train + n_val],
        "test": shuffled[n_train + n_val:],
    }, n_train, n_val, n_test


# --------------------------------------------------------------------------
# Main driver
# --------------------------------------------------------------------------
def save_split(class_name, split_name, items):
    img_out_dir = os.path.join(ML_PIPELINE_DIR, split_name, class_name)
    wav_out_dir = os.path.join(AUDIO_ASSETS_DIR, split_name, class_name)

    for chunk, base_name, local_idx in items:
        chunk_name = f"{base_name}_chunk{local_idx:03d}"

        img = signal_to_spectrogram_image(chunk, SAMPLE_RATE, IMG_SIZE)
        img.save(os.path.join(img_out_dir, chunk_name + ".png"))

        chunk_to_wav(chunk, SAMPLE_RATE, os.path.join(wav_out_dir, chunk_name + ".wav"))


def main():
    global DATASET_DIR, ML_PIPELINE_DIR, AUDIO_ASSETS_DIR, WINDOW_SIZE, IMG_SIZE

    parser = argparse.ArgumentParser(description="Autoguard AI preprocessing pipeline")
    parser.add_argument("--dataset-dir", default=DATASET_DIR)
    parser.add_argument("--ml-pipeline-dir", default=ML_PIPELINE_DIR)
    parser.add_argument("--audio-assets-dir", default=AUDIO_ASSETS_DIR)
    parser.add_argument("--window-size", type=int, default=WINDOW_SIZE,
                         help="samples per chunk (default: 4000)")
    parser.add_argument("--img-size", type=int, default=IMG_SIZE)
    parser.add_argument("--seed", type=int, default=RANDOM_SEED)
    parser.add_argument("--clean", action="store_true",
                         help="wipe existing train/validation/test contents before regenerating")
    parser.add_argument("--only-class", default=None,
                         help="process a single class only (useful for running the pipeline in batches)")
    args = parser.parse_args()

    DATASET_DIR = args.dataset_dir
    ML_PIPELINE_DIR = args.ml_pipeline_dir
    AUDIO_ASSETS_DIR = args.audio_assets_dir
    WINDOW_SIZE = args.window_size
    IMG_SIZE = args.img_size

    classes_to_run = [args.only_class] if args.only_class else CLASSES

    create_output_dirs(clean=(args.clean and args.only_class is None))
    if args.clean and args.only_class:
        for split in SPLITS:
            for d in (os.path.join(ML_PIPELINE_DIR, split, args.only_class),
                      os.path.join(AUDIO_ASSETS_DIR, split, args.only_class)):
                if os.path.isdir(d):
                    shutil.rmtree(d)
                os.makedirs(d, exist_ok=True)

    grand_total = 0
    for class_name in classes_to_run:
        class_dir = os.path.join(DATASET_DIR, class_name)
        if not os.path.isdir(class_dir):
            print(f"[WARN] Missing class folder: {class_dir} - skipping this class")
            continue

        print(f"\n[{class_name}] reading files...")
        txt_files, pool = collect_class_chunks(class_dir, WINDOW_SIZE)

        if not txt_files:
            print(f"  [WARN] No .txt files found in {class_dir}")
            continue
        if not pool:
            print(f"  [WARN] No usable chunks produced for {class_name}")
            continue

        splits, n_train, n_val, n_test = split_pool(pool, seed=args.seed)
        print(f"  pooled {len(pool)} chunks from {len(txt_files)} files -> "
              f"train={n_train}, validation={n_val}, test={n_test}")

        for split_name in SPLITS:
            save_split(class_name, split_name, splits[split_name])

        grand_total += len(pool)

    print(f"\nDone. Generated {grand_total} spectrogram/wav pairs across "
          f"{len(classes_to_run)} class(es).")


if __name__ == "__main__":
    main()
