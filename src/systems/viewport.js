// Converts a game-space coordinate to page-absolute CSS pixels, accounting for
// the Phaser ScaleManager's FIT scale factor (displayScale) and letterbox offset
// (canvasBounds). When the transform is unavailable (e.g. tests / non-browser),
// returns the coordinate unchanged (identity), which is correct for an unscaled
// 1:1 canvas.
export function gameToPageCss(scale, gameX, gameY) {
  const bounds = scale?.canvasBounds;
  const ds = scale?.displayScale;
  if (!bounds || !ds) return { x: gameX, y: gameY };
  return { x: bounds.x + gameX * ds.x, y: bounds.y + gameY * ds.y };
}
