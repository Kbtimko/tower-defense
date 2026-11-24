// Backing-store multiplier for high-DPI screens. `threshold` is the fitted
// device-pixel width (as a multiple of the logical canvas width) at which 2x
// pays for itself; `minDpr` keeps 1x-density screens at k = 1 whatever their size;
// `max` caps k.
export const RENDER_SCALE = { threshold: 1.25, minDpr: 1.5, max: 2 };
