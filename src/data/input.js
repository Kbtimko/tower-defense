// Input / touch-layout tunables.

// Gap kept between a floating panel and the edge of #game when it is clamped in.
export const PANEL_EDGE_MARGIN = 6;

// Held this long without release becomes a long-press (peek). Long enough that a
// deliberate tap never trips it, short enough to feel responsive on touch.
export const LONG_PRESS_MS = 450;

// Finger travel allowed before a press stops counting as a tap. Touch contact
// jitters, so a strict 0 would turn most taps into drags.
export const TAP_SLOP_PX = 12;

// How long a peeked/inspected card lingers after release so it can be read.
export const PEEK_LINGER_MS = 1500;

// Window in which a second press of the same control confirms a destructive
// action (sell, etc.) instead of re-arming it.
export const CONFIRM_WINDOW_MS = 2500;
