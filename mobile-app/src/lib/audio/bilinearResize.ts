/**
 * bilinearResize.ts
 * =================
 * Resizes a 2D grid (rows x cols) to a fixed (outRows x outCols) grid using
 * bilinear interpolation - a JS equivalent of the PIL.Image.resize(...,
 * Image.BILINEAR) call preprocess.py uses to force every spectrogram to a
 * uniform 128x128 shape.
 */

export function bilinearResize(
  data: Float64Array,
  rows: number,
  cols: number,
  outRows: number,
  outCols: number
): Float64Array {
  const output = new Float64Array(outRows * outCols);

  const rowScale = rows / outRows;
  const colScale = cols / outCols;

  for (let outY = 0; outY < outRows; outY++) {
    // Half-pixel-center sampling, matching standard image resize convention.
    // IMPORTANT: srcY must be clamped to [0, rows-1] BEFORE flooring, not
    // just the resulting index. Otherwise, near the edges srcY goes
    // slightly negative (or past rows-1), y0 gets clamped but yFrac is
    // still computed from the unclamped srcY - producing a fraction outside
    // [0,1] that extrapolates the interpolation far past the real pixel
    // range (observed: values like 350 instead of a valid 0-255 pixel).
    // Confirmed numerically against PIL.Image.resize(BILINEAR): the
    // unclamped version had pixel errors up to 105/255 concentrated at the
    // time-axis edges (every spectrogram is stretched from ~16 time frames
    // to 128, so these edge columns are a meaningful chunk of the image);
    // clamping srcX/srcY first brings max error down to 0.5 (pure rounding).
    const srcY = Math.max(0, Math.min(rows - 1, (outY + 0.5) * rowScale - 0.5));
    const y0 = Math.floor(srcY);
    const y1 = Math.min(rows - 1, y0 + 1);
    const yFrac = srcY - y0;

    for (let outX = 0; outX < outCols; outX++) {
      const srcX = Math.max(0, Math.min(cols - 1, (outX + 0.5) * colScale - 0.5));
      const x0 = Math.floor(srcX);
      const x1 = Math.min(cols - 1, x0 + 1);
      const xFrac = srcX - x0;

      const topLeft = data[y0 * cols + x0];
      const topRight = data[y0 * cols + x1];
      const bottomLeft = data[y1 * cols + x0];
      const bottomRight = data[y1 * cols + x1];

      const top = topLeft + (topRight - topLeft) * xFrac;
      const bottom = bottomLeft + (bottomRight - bottomLeft) * xFrac;
      output[outY * outCols + outX] = top + (bottom - top) * yFrac;
    }
  }

  return output;
}
