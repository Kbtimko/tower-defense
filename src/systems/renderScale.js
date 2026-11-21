import { CANVAS_WIDTH, WORLD_HEIGHT } from '../data/layout.js';
import { RENDER_SCALE } from '../data/renderScale.js';

let renderScale = 1;

// Phaser's FIT mode fixes the backing store at CANVAS_WIDTH x WORLD_HEIGHT and
// CSS-stretches it, so on a dense screen the canvas is upscaled and blurry.
// Compare the device pixels the fitted canvas will cover against the backing
// width. Integer k only: a fractional camera zoom shimmers sprites and text.
// `landscape`: the game is landscape-only and phones boot upright behind a rotate
// prompt, so a portrait viewport is judged by its landscape dimensions.
export function renderScaleFor({ cssWidth, cssHeight, dpr, landscape = false }) {
  if (!(cssWidth > 0) || !(cssHeight > 0) || !(dpr > 0)) return 1;
  // A DPR-1 desktop is already sharp; 2x there only costs fill rate.
  if (dpr < RENDER_SCALE.minDpr) return 1;
  if (landscape) [cssWidth, cssHeight] = [Math.max(cssWidth, cssHeight), Math.min(cssWidth, cssHeight)];
  const fittedCssWidth =
    Math.min(cssWidth / CANVAS_WIDTH, cssHeight / WORLD_HEIGHT) * CANVAS_WIDTH;
  const k = fittedCssWidth * dpr >= RENDER_SCALE.threshold * CANVAS_WIDTH ? 2 : 1;
  // The rule yields 1 or 2, so `max` can only lower k.
  return Math.min(k, RENDER_SCALE.max);
}

// The #game rect is zero before layout settles (or when hidden); the window is
// the fallback so boot never measures a 0x0 viewport.
// `useScreen` (coarse pointers): browser bars eat portrait height, and the screen
// is what the game gets once the player rotates, so size k from it instead.
export function viewportCssSize(rect, win, { useScreen = false } = {}) {
  if (useScreen && win.screen?.width > 0 && win.screen?.height > 0) {
    return { cssWidth: win.screen.width, cssHeight: win.screen.height };
  }
  return rect && rect.width > 0 && rect.height > 0
    ? { cssWidth: rect.width, cssHeight: rect.height }
    : { cssWidth: win.innerWidth, cssHeight: win.innerHeight };
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
