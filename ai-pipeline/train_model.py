"""
train_model.py
===============
Autoguard AI - CNN Training, Evaluation, and TFLite Export

Reads the spectrogram images produced by preprocess.py, trains a small CNN
fault classifier, evaluates it on the locked test split, and exports a
quantized .tflite model for offline mobile deployment.

Expected input layout (created by preprocess.py):
  ml_pipeline/train/<class_name>/*.png
  ml_pipeline/validation/<class_name>/*.png
  ml_pipeline/test/<class_name>/*.png

Outputs (written to the working directory unless overridden with flags):
  autoguard_model.keras     - full trained Keras model (best epoch restored)
  best_model.keras          - checkpoint saved during training (safety copy)
  autoguard_model.tflite    - quantized model for mobile deployment
  labels.txt                - class index -> class name mapping for the app
  training_curves.png       - loss/accuracy curves
  confusion_matrix.png      - test-set confusion matrix
  classification_report.txt - per-class precision/recall/F1 on the test set

Dependencies (Windows PowerShell):
  python -m pip install tensorflow numpy matplotlib scikit-learn

Run (from inside the ai-pipeline folder):
  python train_model.py
"""

import argparse
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.utils.class_weight import compute_class_weight

# --------------------------------------------------------------------------
# CONFIG
# --------------------------------------------------------------------------
TRAIN_DIR = "ml_pipeline/train"
VAL_DIR = "ml_pipeline/validation"
TEST_DIR = "ml_pipeline/test"

IMG_SIZE = (128, 128)
BATCH_SIZE = 16
EPOCHS = 30
LEARNING_RATE = 0.001
DROPOUT_RATE = 0.5
EARLY_STOP_PATIENCE = 5
SEED = 42

MODEL_OUT = "autoguard_model.keras"
CHECKPOINT_OUT = "best_model.keras"
TFLITE_OUT = "autoguard_model.tflite"
LABELS_OUT = "labels.txt"
CURVES_OUT = "training_curves.png"
CONFUSION_OUT = "confusion_matrix.png"
REPORT_OUT = "classification_report.txt"

AUTOTUNE = tf.data.AUTOTUNE


# --------------------------------------------------------------------------
# Data loading
# --------------------------------------------------------------------------
def build_datasets(train_dir, val_dir, test_dir, img_size, batch_size, seed):
    """Load the three splits with tf.keras.utils.image_dataset_from_directory.

    color_mode is explicitly "grayscale" because preprocess.py saves single
    channel spectrogram PNGs. Leaving this at the default "rgb" would
    silently triple the channel count for no benefit.
    """
    common_kwargs = dict(
        image_size=img_size,
        batch_size=batch_size,
        color_mode="grayscale",
        label_mode="int",
    )

    train_ds = tf.keras.utils.image_dataset_from_directory(
        train_dir, shuffle=True, seed=seed, **common_kwargs
    )
    val_ds = tf.keras.utils.image_dataset_from_directory(
        val_dir, shuffle=False, **common_kwargs
    )
    test_ds = tf.keras.utils.image_dataset_from_directory(
        test_dir, shuffle=False, **common_kwargs
    )

    return train_ds, val_ds, test_ds


def augment_batch(images, labels):
    """Light, spectrogram-safe augmentation.

    No flips: a vertical flip inverts the frequency axis and a horizontal
    flip reverses time, both of which produce a physically meaningless
    spectrogram. Instead, apply a small time-axis shift and mild contrast
    jitter, both of which preserve the fault "signature" shape.
    """
    images = tf.image.random_contrast(images, lower=0.9, upper=1.1)
    shift = tf.random.uniform([], -4, 4, dtype=tf.int32)
    images = tf.roll(images, shift=shift, axis=2)  # axis 2 = width = time
    return images, labels


def prepare_datasets(train_ds, val_ds, test_ds):
    train_ds = train_ds.cache().map(augment_batch, num_parallel_calls=AUTOTUNE)
    train_ds = train_ds.prefetch(buffer_size=AUTOTUNE)
    val_ds = val_ds.cache().prefetch(buffer_size=AUTOTUNE)
    test_ds = test_ds.cache().prefetch(buffer_size=AUTOTUNE)
    return train_ds, val_ds, test_ds


def compute_class_weights(train_dir, class_names):
    """Balanced class weights computed from actual file counts per class,
    so the model doesn't just learn to predict the majority fault type."""
    counts = []
    for name in class_names:
        class_dir = os.path.join(train_dir, name)
        n = len([f for f in os.listdir(class_dir) if f.lower().endswith(".png")])
        counts.append(n)

    labels = np.concatenate([np.full(c, i) for i, c in enumerate(counts)])
    weights = compute_class_weight(
        class_weight="balanced", classes=np.arange(len(class_names)), y=labels
    )
    print("\nClass counts (train):")
    for name, n, w in zip(class_names, counts, weights):
        print(f"  {name}: {n} images -> weight {w:.3f}")
    return dict(enumerate(weights))


# --------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------
def build_model(img_size, num_classes, dropout_rate, learning_rate):
    model = tf.keras.Sequential([
        tf.keras.layers.Input(shape=(img_size[0], img_size[1], 1)),
        tf.keras.layers.Rescaling(1.0 / 255),

        tf.keras.layers.Conv2D(32, (3, 3), activation="relu"),
        tf.keras.layers.MaxPooling2D((2, 2)),

        tf.keras.layers.Conv2D(64, (3, 3), activation="relu"),
        tf.keras.layers.MaxPooling2D((2, 2)),

        tf.keras.layers.Conv2D(64, (3, 3), activation="relu"),

        tf.keras.layers.Flatten(),
        tf.keras.layers.Dense(64, activation="relu"),
        tf.keras.layers.Dropout(dropout_rate),
        tf.keras.layers.Dense(num_classes, activation="softmax"),
    ])

    model.compile(
        loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=False),
        optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
        metrics=["accuracy"],
    )
    return model


def build_callbacks(checkpoint_path, patience):
    early_stop = tf.keras.callbacks.EarlyStopping(
        monitor="val_loss",
        patience=patience,
        restore_best_weights=True,  # ensures the in-memory model = best epoch, not last epoch
    )
    checkpoint = tf.keras.callbacks.ModelCheckpoint(
        filepath=checkpoint_path,
        monitor="val_loss",
        save_best_only=True,
    )
    return [early_stop, checkpoint]


# --------------------------------------------------------------------------
# Evaluation
# --------------------------------------------------------------------------
def plot_training_curves(history, out_path):
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    axes[0].plot(history.history["loss"], label="Train Loss")
    axes[0].plot(history.history["val_loss"], label="Validation Loss")
    axes[0].set_title("Loss")
    axes[0].set_xlabel("Epoch")
    axes[0].legend()

    axes[1].plot(history.history["accuracy"], label="Train Accuracy")
    axes[1].plot(history.history["val_accuracy"], label="Validation Accuracy")
    axes[1].set_title("Accuracy")
    axes[1].set_xlabel("Epoch")
    axes[1].legend()

    fig.tight_layout()
    fig.savefig(out_path)
    plt.close(fig)
    print(f"Saved training curves -> {out_path}")


def evaluate_on_test(model, test_ds, class_names, confusion_out, report_out):
    y_true = np.concatenate([labels.numpy() for _, labels in test_ds], axis=0)
    y_pred_probs = model.predict(test_ds)
    y_pred = np.argmax(y_pred_probs, axis=1)

    report = classification_report(y_true, y_pred, target_names=class_names, zero_division=0)
    print("\nClassification Report (test set):")
    print(report)
    with open(report_out, "w") as f:
        f.write(report)
    print(f"Saved classification report -> {report_out}")

    cm = confusion_matrix(y_true, y_pred)
    fig, ax = plt.subplots(figsize=(7, 6))
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(class_names)))
    ax.set_yticks(range(len(class_names)))
    ax.set_xticklabels(class_names, rotation=45, ha="right")
    ax.set_yticklabels(class_names)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title("Confusion Matrix (Test Set)")
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, str(cm[i, j]), ha="center", va="center",
                     color="white" if cm[i, j] > cm.max() / 2 else "black")
    fig.colorbar(im, ax=ax)
    fig.tight_layout()
    fig.savefig(confusion_out)
    plt.close(fig)
    print(f"Saved confusion matrix -> {confusion_out}")

    return y_true, y_pred


# --------------------------------------------------------------------------
# TFLite export
# --------------------------------------------------------------------------
def convert_to_tflite(model, train_ds, tflite_out, num_samples=100):
    """Full integer (INT8) post-training quantization.

    A plain `converter.optimizations = [DEFAULT]` only quantizes weights and
    leaves activations in float32 (dynamic-range quantization) - it does not
    give the full 8-bit, offline-mobile-ready model described in the project
    plan. Supplying a representative_dataset lets the converter also
    quantize activations, which is what actually shrinks the model and
    speeds up inference on-device.
    """
    def representative_dataset():
        for images, _ in train_ds.unbatch().batch(1).take(num_samples):
            yield [images]

    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.representative_dataset = representative_dataset
    converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
    converter.inference_input_type = tf.uint8    # app can feed raw 0-255 pixel bytes directly
    converter.inference_output_type = tf.float32  # keep output as interpretable probabilities

    tflite_model = converter.convert()
    with open(tflite_out, "wb") as f:
        f.write(tflite_model)

    size_kb = len(tflite_model) / 1024
    print(f"Saved quantized TFLite model -> {tflite_out} ({size_kb:.1f} KB)")
    return tflite_model


def verify_tflite_model(tflite_out, test_ds):
    """Sanity check: run the quantized .tflite model directly through the
    TFLite interpreter and compare its predictions to the ground truth.
    Quantization can silently hurt accuracy more than expected - better to
    catch that here than to discover it later on-device."""
    interpreter = tf.lite.Interpreter(model_path=tflite_out)
    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    correct, total = 0, 0
    for images, labels in test_ds.unbatch().batch(1):
        img_uint8 = tf.cast(images, tf.uint8).numpy()
        interpreter.set_tensor(input_details[0]["index"], img_uint8)
        interpreter.invoke()
        output = interpreter.get_tensor(output_details[0]["index"])
        pred = np.argmax(output[0])
        if pred == labels.numpy()[0]:
            correct += 1
        total += 1

    accuracy = correct / total if total else 0.0
    print(f"TFLite quantized model test accuracy: {accuracy:.2%} ({correct}/{total})")
    return accuracy


def save_labels(class_names, labels_out):
    with open(labels_out, "w") as f:
        for name in class_names:
            f.write(name + "\n")
    print(f"Saved label mapping -> {labels_out}")


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Autoguard AI model training pipeline")
    parser.add_argument("--train-dir", default=TRAIN_DIR)
    parser.add_argument("--val-dir", default=VAL_DIR)
    parser.add_argument("--test-dir", default=TEST_DIR)
    parser.add_argument("--epochs", type=int, default=EPOCHS)
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--img-size", type=int, default=IMG_SIZE[0])
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--model-out", default=MODEL_OUT)
    parser.add_argument("--tflite-out", default=TFLITE_OUT)
    args = parser.parse_args()

    tf.random.set_seed(args.seed)
    np.random.seed(args.seed)

    img_size = (args.img_size, args.img_size)

    print("Loading datasets...")
    train_ds, val_ds, test_ds = build_datasets(
        args.train_dir, args.val_dir, args.test_dir, img_size, args.batch_size, args.seed
    )
    class_names = train_ds.class_names
    num_classes = len(class_names)
    print(f"Found {num_classes} classes: {class_names}")

    save_labels(class_names, LABELS_OUT)
    class_weights = compute_class_weights(args.train_dir, class_names)

    train_ds, val_ds, test_ds = prepare_datasets(train_ds, val_ds, test_ds)

    print("\nBuilding model...")
    model = build_model(img_size, num_classes, DROPOUT_RATE, LEARNING_RATE)
    model.summary()

    callbacks = build_callbacks(CHECKPOINT_OUT, EARLY_STOP_PATIENCE)

    print("\nTraining...")
    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=args.epochs,
        callbacks=callbacks,
        class_weight=class_weights,
    )

    plot_training_curves(history, CURVES_OUT)

    print("\nEvaluating on test set...")
    evaluate_on_test(model, test_ds, class_names, CONFUSION_OUT, REPORT_OUT)

    model.save(args.model_out)
    print(f"\nSaved final Keras model -> {args.model_out}")

    print("\nConverting to TFLite (full INT8 quantization)...")
    convert_to_tflite(model, train_ds, args.tflite_out)
    verify_tflite_model(args.tflite_out, test_ds)

    print("\nDone.")


if __name__ == "__main__":
    main()