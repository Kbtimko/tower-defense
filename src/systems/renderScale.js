import { CANVAS_WIDTH, WORLD_HEIGHT } from '../data/layout.js';
import { RENDER_SCALE } from '../data/renderScale.js';

let renderScale = 1;

// Phaser's FIT mode fixes the backing store at CANVAS_WIDTH x WORLD_HEIGHT and
// CSS-stretches it, so on a dense screen the canvas is upscaled and blurry.
// Compare the device pixels the fitted canvas will cover against the backing
// width. Integer k only: a fractional camera zoom shimmers sprites and text.
export function renderScaleFor({ cssWidth, cssHeight, dpr }) {
  if (!(cssWidth > 0) || !(cssHeight > 0) || !(dpr > 0)) return 1;
  const fittedCssWidth =
    Math.min(cssWidth / CANVAS_WIDTH, cssHeight / WORLD_HEIGHT) * CANVAS_WIDTH;
  const k = fittedCssWidth * dpr >= RENDER_SCALE.threshold * CANVAS_WIDTH ? 2 : 1;
  return Math.min(k, RENDER_SCALE.max);
}

export function parseRenderScaleOverride(search) {
  const value = new URLSearchParams(search).get('res');
  return value === '1' ? 1 : value === '2' ? 2 : null;
}

export function getRenderScale() {
  return renderScale;
}

// Set once at boot; k never changes on resize.
export function setRenderScale(k) {
  renderScale = k;
}
