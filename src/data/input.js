// Input / touch-layout tunables.

// Gap kept between a floating panel and the edge of #game when it is clamped in.
export const PANEL_EDGE_MARGIN = 6;

// Gap between a rail control and the peek card that opens beside it.
export const PEEK_GAP_PX = 10;

// Held this long without release becomes a long-press (peek). Long enough that a
// deliberate tap never trips it, short enough to feel responsive on touch.
export const LONG_PRESS_MS = 450;

// Finger travel allowed before a press stops counting as a tap. Touch contact
// jitters, so a strict 0 would turn most taps into drags. CSS px on both the
// canvas and the DOM: a game-px slop would shrink to ~4 CSS px on a phone, where
// the canvas is scaled down several-fold.
export const TAP_SLOP_PX = 12;

// Canvas tap hit radii (game px): a tap within this of a tower opens its panel,
// of a free build slot places there, of the path moves the hero.
export const TAP_TOWER_RADIUS = 22;
export const TAP_SLOT_RADIUS = 22;
export const TAP_PATH_RADIUS = 40;
// Looser than TAP_SLOT_RADIUS: a barracks reposition is a drag-drop, not a click.
export const REPOSITION_SNAP_RADIUS = 60;

// How long a peeked/inspected card lingers after release so it can be read.
export const PEEK_LINGER_MS = 1500;

// Window in which a second press of the same control confirms a destructive
// action (sell, etc.) instead of re-arming it.
export const CONFIRM_WINDOW_MS = 2500;
