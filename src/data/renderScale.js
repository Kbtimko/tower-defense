// Backing-store multiplier for high-DPI screens. `threshold` is the fitted
// device-pixel width (as a multiple of the logical canvas width) at which 2x
// pays for itself; `max` caps k.
export const RENDER_SCALE = { threshold: 1.25, max: 2 };
