"""
augment_noise.py
=================
Adds noise-injected copies of the TRAIN split only, so the model sees fault
signatures buried in real background noise during training instead of only
ever seeing pristine lab audio - closing (part of) the gap between the clean
HUSTmotor recordings and real phone-mic-in-a-noisy-garage conditions.

Why train-only: validation/test need to stay a clean, untouched measure of
real generalization - if noisy examples leaked into them, the accuracy
numbers would stop meaning what they're supposed to mean. If you later want
a robustness number specifically, run evaluate against a *separate* noisy
test set rather than the existing validation/test split.

Why it reads from app_audio_assets/train/ instead of datasets/*.txt: those
are the ALREADY chunked, ALREADY pooled-and-split WAV files preprocess.py
produced - reusing them means this script never touches the train/val/test
split boundary preprocess.py already decided, it only adds noisy siblings
inside the train side of that boundary.

Run (from inside the ai-pipeline folder, AFTER running preprocess.py at
least once so app_audio_assets/train/ exists):

    python augment_noise.py

Re-running is safe - it skips its own previously-generated "_noisyNNN" files
as sources (so noise never gets mixed into already-noisy audio) and
overwrites same-named outputs from a prior run rather than piling up
duplicates.
"""

import argparse
import glob
import os
import random

import numpy as np
from scipy.io import wavfile

from preprocess import (
    CLASSES,
    ML_PIPELINE_DIR,
    AUDIO_ASSETS_DIR,
    SAMPLE_RATE,
    IMG_SIZE,
    signal_to_spectrogram_image,
    chunk_to_wav,
)

NOISE_SAMPLES_DIR = os.path.join(os.path.dirname(__file__), "noise_samples")

# How many noisy copies to generate per clean training chunk. 2 roughly
# triples each class's train-split size (1 clean original + 2 noisy
# variants) without needing any new fault recordings.
COPIES_PER_CHUNK = 2

# Random SNR range per copy, in dB. 0dB = noise and signal at equal power
# (harsh), 15dB = signal clearly dominant but noise still present. Spanning
# a range instead of one fixed value is the point - real conditions vary
# take to take, and the model should be robust across that spread, not
# tuned to one specific noise level.
SNR_DB_RANGE = (0.0, 15.0)

SUFFIX_MARKER = "_noisy"


def load_noise_samples(noise_dir):
    """Loads every .wav in noise_samples/ as a mono, SAMPLE_RATE float64
    array. Multiple files just get pooled - a random one is picked (and a
    random offset within it) per augmented copy, so more noise recordings
    dropped in later automatically add more variety with zero code changes."""
    paths = sorted(glob.glob(os.path.join(noise_dir, "*.wav")))
    if not paths:
        raise SystemExit(
            f"No .wav noise samples found in {noise_dir}. Add at least one "
            "(fan hum, road noise, etc.) - see noise_samples/README.md."
        )
    samples = []
    for p in paths:
        sr, data = wavfile.read(p)
        if sr != SAMPLE_RATE:
            raise SystemExit(
                f"{p} is {sr}Hz, expected {SAMPLE_RATE}Hz. Convert it first, e.g.:\n"
                f"  ffmpeg -i input.m4a -ac 1 -ar {SAMPLE_RATE} -sample_fmt s16 {p}"
            )
        if data.ndim > 1:
            data = data.mean(axis=1)  # downmix to mono if it wasn't already
        data = data.astype(np.float64) / 32768.0
        samples.append(data)
        print(f"  loaded noise sample: {os.path.basename(p)} ({len(data) / SAMPLE_RATE:.1f}s)")
    return samples


def random_noise_segment(noise_samples, length, rng):
    """Picks a random noise sample and a random contiguous window of
    `length` samples from it, wrapping around if the sample is shorter than
    `length` (won't happen with real recordings of any reasonable length,
    but keeps this from crashing on a very short one)."""
    noise = rng.choice(noise_samples)
    if len(noise) <= length:
        reps = length // len(noise) + 1
        noise = np.tile(noise, reps)
    start = rng.randint(0, len(noise) - length)
    return noise[start:start + length]


def mix_at_snr(signal_chunk, noise_chunk, snr_db, rng):
    """Scales noise_chunk so the mix hits the target SNR (in dB) relative to
    signal_chunk's power, then adds them. SNR_dB = 10*log10(P_signal /
    P_noise) - solve for the scale factor that makes that true, then apply
    it before mixing."""
    signal_power = np.mean(signal_chunk ** 2)
    noise_power = np.mean(noise_chunk ** 2)
    if noise_power <= 1e-12 or signal_power <= 1e-12:
        return signal_chunk  # degenerate silent input - nothing sensible to mix
    target_noise_power = signal_power / (10 ** (snr_db / 10))
    scale = np.sqrt(target_noise_power / noise_power)
    return signal_chunk + scale * noise_chunk


def augment_class(class_name, noise_samples, copies_per_chunk, snr_range, seed):
    # Re-seeded per class (not one rng shared/advanced across classes) so a
    # class's output is identical whether it's run alone (--only-class) or
    # as part of a full run - otherwise how much rng state prior classes
    # consumed would shift this class's random SNR values, changing the
    # "_snrNNdb" filenames between runs and leaving old, differently-named
    # copies behind as orphaned duplicates instead of being cleanly
    # overwritten. (Found the hard way: a healthy-only test run followed by
    # a full run left 544 images in train/healthy instead of the correct
    # 336, because the second run's rng state - and therefore its SNR
    # filenames - didn't match the first.)
    rng = random.Random(f"{seed}:{class_name}")

    train_wav_dir = os.path.join(AUDIO_ASSETS_DIR, "train", class_name)
    train_img_dir = os.path.join(ML_PIPELINE_DIR, "train", class_name)

    source_wavs = sorted(
        f for f in glob.glob(os.path.join(train_wav_dir, "*.wav")) if SUFFIX_MARKER not in os.path.basename(f)
    )
    if not source_wavs:
        print(f"  [{class_name}] no clean train WAVs found in {train_wav_dir} - skipping "
              f"(run preprocess.py first)")
        return 0

    generated = 0
    for src_path in source_wavs:
        sr, clean = wavfile.read(src_path)
        clean = clean.astype(np.float64) / 32768.0
        base_name = os.path.splitext(os.path.basename(src_path))[0]

        for copy_idx in range(copies_per_chunk):
            snr_db = rng.uniform(*snr_range)
            noise_seg = random_noise_segment(noise_samples, len(clean), rng)
            noisy = mix_at_snr(clean, noise_seg, snr_db, rng)

            out_name = f"{base_name}{SUFFIX_MARKER}{copy_idx:03d}_snr{snr_db:.0f}db"

            img = signal_to_spectrogram_image(noisy, SAMPLE_RATE, IMG_SIZE)
            img.save(os.path.join(train_img_dir, out_name + ".png"))
            chunk_to_wav(noisy, SAMPLE_RATE, os.path.join(train_wav_dir, out_name + ".wav"))
            generated += 1

    print(f"  [{class_name}] {len(source_wavs)} clean chunks -> +{generated} noisy copies "
          f"(train split now has {len(source_wavs) + generated} images)")
    return generated


def main():
    parser = argparse.ArgumentParser(description="Add noise-injected copies to the TRAIN split only")
    parser.add_argument("--noise-dir", default=NOISE_SAMPLES_DIR)
    parser.add_argument("--copies-per-chunk", type=int, default=COPIES_PER_CHUNK)
    parser.add_argument("--snr-min-db", type=float, default=SNR_DB_RANGE[0])
    parser.add_argument("--snr-max-db", type=float, default=SNR_DB_RANGE[1])
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--only-class", default=None)
    args = parser.parse_args()

    print(f"Loading noise samples from {args.noise_dir}...")
    noise_samples = load_noise_samples(args.noise_dir)

    classes_to_run = [args.only_class] if args.only_class else CLASSES
    total = 0
    print(f"\nGenerating {args.copies_per_chunk} noisy cop{'y' if args.copies_per_chunk == 1 else 'ies'} "
          f"per clean train chunk, SNR range [{args.snr_min_db:.0f}, {args.snr_max_db:.0f}] dB...\n")
    for class_name in classes_to_run:
        total += augment_class(
            class_name, noise_samples, args.copies_per_chunk, (args.snr_min_db, args.snr_max_db), args.seed
        )

    print(f"\nDone. Generated {total} noise-augmented train images across {len(classes_to_run)} class(es).")
    print("Validation/test splits were not touched. Re-run train_model.py to retrain on the expanded train set.")


if __name__ == "__main__":
    main()
