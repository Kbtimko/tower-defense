// The map world keeps its original size; the canvas grows a HUD rail on each
// side, and the main camera's viewport is the world rect between them.
export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;

// Two HUD_CELL columns per rail: one column holds only ~7 touch-sized buttons,
// too few for the controls + stats + hero card.
export const RAIL_WIDTH = 176;
export const CANVAS_WIDTH = WORLD_WIDTH + 2 * RAIL_WIDTH;

// 44 CSS px on a 360-px-high phone viewport (FIT scale 0.5) = 88 game px.
export const HUD_CELL = 88;

// Apple/Google minimum touch target, in CSS px after FIT scaling.
export const MIN_TOUCH_PX = 44;
// iPhone 14 landscape emulation (750x340) scales a cell to ~40.4 CSS px, so the
// smallest phones get a 40-px floor rather than an impossible 44.
export const MIN_TOUCH_PX_SMALL_PHONE = 40;
