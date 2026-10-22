import { POINTER_FINE_QUERY } from './mobile.js';

// The map world keeps its original size; the canvas grows a HUD rail on each
// side, and the main camera's viewport is the world rect between them.
export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;

// 44 CSS px on a 360-px-high phone viewport (FIT scale 0.5) = 88 game px.
export const TOUCH_HUD_CELL = 88;
// Mouse targets don't need 44 px; 52-px cells make 104-px rails, giving the map
// more of the canvas on desktop.
export const FINE_HUD_CELL = 52;
// Two columns per rail: one column holds only ~7 touch-sized buttons, too few
// for the controls + stats + hero card.
export const RAIL_COLUMNS = 2;

export function isPointerFine(win) {
  // Called as a method: a detached matchMedia throws "Illegal invocation".
  return win?.matchMedia?.(POINTER_FINE_QUERY)?.matches === true;
}

// hudK scales rail content authored against the touch cell size.
export function railMetricsFor({ pointerFine }) {
  const hudCell = pointerFine ? FINE_HUD_CELL : TOUCH_HUD_CELL;
  const railWidth = RAIL_COLUMNS * hudCell;
  return { hudCell, railWidth, canvasWidth: WORLD_WIDTH + 2 * railWidth, hudK: hudCell / TOUCH_HUD_CELL };
}

// Resolved once at boot: the canvas size is fixed at Phaser init, so rails
// can't change with the pointer mid-session.
export const POINTER_FINE = isPointerFine(globalThis);
const metrics = railMetricsFor({ pointerFine: POINTER_FINE });
export const HUD_CELL = metrics.hudCell;
export const RAIL_WIDTH = metrics.railWidth;
export const CANVAS_WIDTH = metrics.canvasWidth;
export const HUD_K = metrics.hudK;

// Apple/Google minimum touch target, in CSS px after FIT scaling.
export const MIN_TOUCH_PX = 44;
// iPhone 14 landscape emulation (750x340) scales a cell to ~40.4 CSS px, so the
// smallest phones get a 40-px floor rather than an impossible 44.
export const MIN_TOUCH_PX_SMALL_PHONE = 40;
