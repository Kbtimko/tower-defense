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

// Page CSS px -> game px, matching Phaser's ScaleManager.transformX/Y. Note
// displayScale is GAME px per CSS px, so this multiplies; it is NOT the inverse
// of gameToPageCss above (which treats displayScale the other way round).
export function pageToGame(scale, pageX, pageY) {
  const bounds = scale?.canvasBounds;
  const ds = scale?.displayScale;
  if (!bounds || !ds) return { x: pageX, y: pageY };
  return { x: (pageX - bounds.x) * ds.x, y: (pageY - bounds.y) * ds.y };
}
