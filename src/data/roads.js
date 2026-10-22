// Tunables for the procedural road (roadmap 1.7). Colours start from the legacy
// PathRenderer STYLE_SPEC palette so each map keeps its identity.
// halfWidth is the SOLID bed half-width and must stay <= 13 so tower-slot CENTRES
// (>= halfWidth + ROAD_PAD_GAP from the centreline on real maps) clear the bed; a pad's
// stud ring may still lap the bed edge by design.

export const ROAD_PAD_GAP = 10;
// Above backdrop (0), area effects (2), ambient (5); below blockers/pads (10).
export const ROAD_DEPTH = 8;

// 'procedural' bakes the textured road; 'legacy' keeps the Graphics PathRenderer.
// A map entry may override with its own `roadRenderer`.
export const ROAD_RENDERER = 'procedural';
export function roadRendererFor(map) {
  return map.roadRenderer ?? ROAD_RENDERER;
}

const planet = {
  family: 'planet', kind: 'road', halfWidth: 13, feather: 9,
  base: 0x6a4230, edge: 0x3a2014,
  noise: { scale: 9, contrast: 1.4, colors: [0x52301f, 0x8a5236] },
  wear: 0.3,
  lane: { color: 0x2e1a10, alpha: 0.5, width: 2, dash: 5, gap: 9 },
};
const lunar = {
  family: 'lunar', kind: 'road', halfWidth: 13, feather: 9,
  base: 0x6e7178, edge: 0xb8bcc4,
  noise: { scale: 7, contrast: 1.3, colors: [0x5a5d64, 0x8c9098] },
  wear: 0.3,
  lane: { color: 0x2e3138, alpha: 0.4, width: 2, dash: 5, gap: 9 },
};
const station = {
  family: 'station', kind: 'road', halfWidth: 12, feather: 7,
  base: 0x1f262d, edge: 0x05080b,
  noise: { scale: 14, contrast: 0.8, colors: [0x181e24, 0x2c353e] },
  wear: 0.12,
  lane: { color: 0x7fdcff, alpha: 0.9, width: 2, dash: 6, gap: 10 },
};
const space = {
  family: 'space', kind: 'lane', halfWidth: 10, feather: 12,
  base: 0x2a5a8a, edge: 0x2a5a8a,
  noise: { scale: 18, contrast: 0.6, colors: [0x1c3f66, 0x3a78b0] },
  wear: 0,
  lane: { color: 0x9fe0ff, alpha: 0.85, width: 3, dash: 6, gap: 7 },
};
const organic = {
  family: 'organic', kind: 'road', halfWidth: 12, feather: 10,
  base: 0x1f5048, edge: 0x00ffc8,
  noise: { scale: 6, contrast: 1.6, colors: [0x143832, 0x2c6a5c] },
  wear: 0.25,
  lane: { color: 0x66ffd0, alpha: 0.5, width: 2, dash: 5, gap: 7 },
};
const scorched = {
  family: 'scorched', kind: 'road', halfWidth: 13, feather: 9,
  base: 0x4a4440, edge: 0xff6a20,
  noise: { scale: 8, contrast: 1.3, colors: [0x35302c, 0x5e5650] },
  wear: 0.15,
  lane: { color: 0xffa040, alpha: 0.8, width: 2, dash: 5, gap: 9 },
};

// Legacy keys (planet-dust, station-strip, space-nav, organic-glow) alias a family.
export const ROAD_STYLES = {
  'planet-dust': planet,
  'station-strip': station,
  'space-nav': space,
  'organic-glow': organic,
  'planet-road': planet,
  'lunar-road': lunar,
  'station-road': station,
  'space-lane': space,
  'organic-road': organic,
  'scorched-road': scorched,
};

// Portal = enemy spawn (Veth emissive feel), beacon = player base (human amber).
export const ENDPOINT_FX = {
  planet:   { portal: { colors: [0x9b59b6, 0x33ff66], radius: 36, spin: 1.2, pulse: 2.0 }, beacon: { color: 0xffb000, radius: 28, pulse: 1.6 } },
  lunar:    { portal: { colors: [0x9b59b6, 0xd0b0ff], radius: 36, spin: 1.0, pulse: 1.8 }, beacon: { color: 0xffb000, radius: 28, pulse: 1.6 } },
  station:  { portal: { colors: [0x33ff66, 0x9b59b6], radius: 36, spin: 1.6, pulse: 2.4 }, beacon: { color: 0xffb000, radius: 28, pulse: 1.8 } },
  space:    { portal: { colors: [0x9b59b6, 0x33ff66], radius: 36, spin: 0.8, pulse: 1.4 }, beacon: { color: 0xffb000, radius: 28, pulse: 1.4 } },
  organic:  { portal: { colors: [0x33ff66, 0xe74c3c], radius: 36, spin: 1.4, pulse: 2.2 }, beacon: { color: 0xffb000, radius: 28, pulse: 1.8 } },
  scorched: { portal: { colors: [0xe74c3c, 0x9b59b6], radius: 36, spin: 1.8, pulse: 2.6 }, beacon: { color: 0xffb000, radius: 28, pulse: 2.0 } },
};

// One sample density for both the painted curve and the pad-clearance check, so the
// test measures exactly the centreline that gets drawn.
export const ROAD_CURVE_SAMPLES = 24;

// Shared painter tunables (per-style colours/widths live in ROAD_STYLES above).
export const ROAD_PAINT = {
  tileSize: 64,           // noise tile px; tiles seamlessly, so only texel scale matters
  featherSteps: 5,        // stacked strokes per soft edge (no ctx.filter on iOS Safari)
  light: { dx: 1, dy: 1.5 }, // edge shade offset: light from the upper-left (art bible §1)
  edgeBand: 3,            // px of darkened rim left inside the bed
  edgeAlpha: 0.55,
  wear: [{ scale: 1.1, alpha: 0.35 }, { scale: 0.55, alpha: 0.5 }], // x halfWidth, x style.wear
  laneCore: [{ scale: 1.2, alpha: 0.18 }, { scale: 0.5, alpha: 0.3 }], // nav-lane glow, x halfWidth
  dashGlow: { widthScale: 3, alpha: 0.25 }, // halo under bright lane dashes
};

// Portal/beacon animation shape. ENDPOINT_FX supplies per-family colour/radius; `spin` is
// rad/s and `pulse` is Hz. Rings are drawn at radius*2 px (the 64 px texture is ring-in-frame).
export const ENDPOINT_LOOK = {
  depth: 9,                // above the road (8), below pads (10)
  canvas: { width: 1280, height: 720 }, // endpoints are clamped inside this
  ringAlpha: 1,
  innerRingScale: 0.62,    // inner ring size relative to the outer
  portalGlow: { scale: 1.4, alpha: [0.6, 1], swing: 0.12 }, // alpha range, scale swing (+/-)
  beaconGlow: { scale: 1.9, alpha: [0.55, 1], swing: 0.1 },
  beaconRing: { scale: 1.0, alpha: 0.95, spin: 0.35 },           // slow, rad/s
};
