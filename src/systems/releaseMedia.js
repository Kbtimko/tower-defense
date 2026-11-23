// Pure geometry for scripts/release-media.mjs, kept out of the script so Vitest can pin it.

// Inclusive at both ends: an enemy exactly at `from` or `to` is still "mid-road".
export function inMiddleBand(progress, { from, to }) {
  return progress >= from && progress <= to;
}

export function centroidOf(points) {
  if (points.length === 0) return null;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}

// The crop window is centred on `centroid` (the board centre when there is none), then
// SHIFTED, never shrunk, to sit inside the board: a smaller window would be stretched by
// the later resize to the cover's aspect. A board smaller than the window is the only case
// that narrows it.
export function coverCrop({ cropWidth, cropHeight }, { board, centroid }) {
  const { x0, y0, x1, y1 } = board;
  const w = Math.min(cropWidth, Math.floor(x1 - x0));
  const h = Math.min(cropHeight, Math.floor(y1 - y0));
  const cx = centroid?.x ?? (x0 + x1) / 2;
  const cy = centroid?.y ?? (y0 + y1) / 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return {
    left: Math.round(clamp(cx - w / 2, x0, x1 - w)),
    top: Math.round(clamp(cy - h / 2, y0, y1 - h)),
    width: w,
    height: h,
  };
}
