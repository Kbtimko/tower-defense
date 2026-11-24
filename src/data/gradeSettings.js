// Shared by every map's grade (roadmap 1.4); per-map values live in maps.js.
// Vignette radius is a fraction of the MAP (per axis): 0.8 keeps the darkening
// in the corners, clear of the path and pads.
export const VIGNETTE_RADIUS = 0.8;

// The camera postFX darkened everything the camera drew, so the world-space
// overlay sits above every world layer (damage numbers are at 100).
export const VIGNETTE_DEPTH = 1000;

// World px of overlay past each map edge: the overlay shakes with the world,
// and the strongest shake (boss death, 0.02) moves it up to ~26 px.
export const VIGNETTE_MARGIN = 32;

// The falloff is smooth, so a half-resolution texture scaled up with linear
// filtering is indistinguishable and costs a quarter of the memory.
export const VIGNETTE_TEXTURE_SCALE = 0.5;
