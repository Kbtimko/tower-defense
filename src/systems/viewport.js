import { RAIL_WIDTH } from '../data/layout.js';

// Converts a game-space coordinate to page-absolute CSS pixels, accounting for
// the Phaser ScaleManager's FIT scale factor and letterbox offset (canvasBounds).
// displayScale is GAME px per CSS px, so the inverse of pageToGame divides.
// When the transform is unavailable (e.g. tests / non-browser), returns the
// coordinate unchanged (identity), which is correct for an unscaled 1:1 canvas.
export function gameToPageCss(scale, gameX, gameY) {
  const bounds = scale?.canvasBounds;
  const ds = scale?.displayScale;
  if (!bounds || !ds) return { x: gameX, y: gameY };
  return { x: bounds.x + gameX / ds.x, y: bounds.y + gameY / ds.y };
}

// Page CSS px -> game px, matching Phaser's ScaleManager.transformX/Y. Note
// displayScale is GAME px per CSS px, so this multiplies; gameToPageCss divides.
export function pageToGame(scale, pageX, pageY) {
  const bounds = scale?.canvasBounds;
  const ds = scale?.displayScale;
  if (!bounds || !ds) return { x: pageX, y: pageY };
  return { x: (pageX - bounds.x) * ds.x, y: (pageY - bounds.y) * ds.y };
}

// The main camera's viewport starts RAIL_WIDTH into the canvas (scroll 0, zoom
// 1), so a world point is that many canvas px right of its world x.
export function worldToPageCss(scale, worldX, worldY) {
  return gameToPageCss(scale, worldX + RAIL_WIDTH, worldY);
}

export function pageToWorld(scale, pageX, pageY) {
  const g = pageToGame(scale, pageX, pageY);
  return { x: g.x - RAIL_WIDTH, y: g.y };
}

// Clamps a floating panel's top-left so the whole panel stays inside `area`
// (width/height of the container) with `margin` to spare. When the panel is
// larger than the area the top/left win (margin) so its header stays reachable.
export function clampPanel(desired, size, area, margin) {
  const left = Math.max(margin, Math.min(desired.left, area.width - size.width - margin));
  const top = Math.max(margin, Math.min(desired.top, area.height - size.height - margin));
  return { left, top };
}

// A peek card beside a rail control: vertically centred on it, opening over the
// map (left of the right rail, right of the left rail), clamped like a panel.
const centredOn = (anchor, size) => anchor.top + (anchor.height - size.height) / 2;

export function placeLeftOf({ anchor, size, area, gap, margin }) {
  return clampPanel({ left: anchor.left - gap - size.width, top: centredOn(anchor, size) }, size, area, margin);
}

export function placeRightOf({ anchor, size, area, gap, margin }) {
  return clampPanel({ left: anchor.left + anchor.width + gap, top: centredOn(anchor, size) }, size, area, margin);
}

// The vertical half of the above, for a panel whose horizontal side is CSS.
export function clampCentredTop({ anchor, height, areaHeight, margin }) {
  return Math.max(margin, Math.min(centredOn(anchor, { height }), areaHeight - height - margin));
}

// clampPanel inside a rect that is itself offset in the container (the map
// inside #game), returning container coordinates.
export function clampPanelWithin(desired, size, rect, margin) {
  const local = clampPanel({ left: desired.left - rect.left, top: desired.top - rect.top }, size, rect, margin);
  return { left: local.left + rect.left, top: local.top + rect.top };
}

// A peek card beside a whole rect (the radial footprint): right side first, the
// left when the right has no room, vertically centred, then clamped inside
// `bounds` (left/top/width/height, e.g. the map rect) so it never leaves the map.
export function placeBeside(rect, size, bounds, gap, margin) {
  const right = rect.left + rect.width + gap;
  const left = rect.left - gap - size.width;
  const fitsRight = right + size.width <= bounds.left + bounds.width - margin;
  const fitsLeft = left >= bounds.left + margin;
  const desiredLeft = fitsRight || !fitsLeft ? right : left;
  return clampPanelWithin({ left: desiredLeft, top: centredOn(rect, size) }, size, bounds, margin);
}
