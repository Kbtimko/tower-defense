// Post-win movement beats (ms). Order and spans follow spec 2.3; keep them here so UI code has no literals.
export const ARRIVAL = {
  focusMs: 300,
  focusScale: 1.12,
  stampStartMs: 300,
  stampEachMs: 150,
  stampScale: 1.6,
  flyStartMs: 750,
  flyMs: 2000,
  frontStartMs: 1750,
  frontMs: 1000,
  lightStartMs: 2750,
  lightMs: 300,
  cardAtMs: 3050,
  totalMs: 3200,
};

// Route positions, normalized to the route frame (worldMapLayout.routeFrameFor), not
// the screen. Map 9's node is the hive core. Hand-tuned from the vista mockup so that
// on every capture device (frame aspect 1.34-1.94) the node rects fit with no overlap
// and the distance to the hive strictly falls Earth -> node 9 (front-line consistency).
// The px distance difference is linear in aspect^2, so passing at both ends of that
// range passes everywhere between.
export const ROUTE = {
  earth: [0.05, 0.84],
  nodes: {
    0: [0.20, 0.82],
    1: [0.21, 0.45],
    2: [0.37, 0.63],
    3: [0.37, 0.12],
    4: [0.54, 0.54],
    5: [0.535, 0.28],
    6: [0.74, 0.53],
    7: [0.70, 0.28],
    8: [0.91, 0.40],
    9: [0.90, 0.13],
  },
};

// Px values per layout class (spec 5). The scene publishes topBand, card, statsStrip
// and gutter as --wm-* custom properties, so CSS boxes and routeFrameFor agree.
// Compact is sized for the smallest compact device (iPhone 14 landscape, 750x340):
// a 52-px top row and a 240-px card leave a 474x264 route frame.
export const LAYOUT = {
  node: { tall: { d: 56, final: 64 }, compact: { d: 44, final: 50 } },
  // Label box under each node: tall = "N · Name" + stars (two lines, capped at labelW
  // with an ellipsis); compact = the stars line only.
  labelPx: { tall: 34, compact: 15 },
  labelW: { tall: 132, compact: 48 },
  topBand: { tall: 112, compact: 52 },
  card: {
    tall: { min: 280, vw: 0.26, max: 360 },
    compact: { min: 220, vw: 0.32, max: 300 },
  },
  statsStrip: { tall: 64, compact: 0 },
  gutter: 12,
  // Space between the Earth/hive tags and the body they name.
  tagGap: 4,
  inputGuardMs: 250,
  maxCanvasDpr: 2,
};

// Route-frame coords; r is a fraction of the frame's short side. Seeded from the
// mockup's planet() calls, moved off the nodes they would otherwise sit under.
export const PLANETS = [
  { id: 'mars', x: 0.10, y: 0.52, r: 0.029, base: ['#e8916a', '#7a2e1a'] },
  { id: 'jupiter', x: 0.25, y: 0.27, r: 0.076, base: ['#f0d9b5', '#9a6a3a'],
    bands: [[-0.6, 0.15, 'rgba(150,90,50,.5)'], [-0.2, 0.18, 'rgba(190,120,70,.45)'], [0.25, 0.12, 'rgba(150,90,50,.5)'], [0.1, 0.1, 'rgba(200,80,60,.5)']] },
  { id: 'saturn', x: 0.62, y: 0.16, r: 0.036, base: ['#e9cf98', '#8a6a3a'], ring: 'rgba(230,205,160,.7)' },
  { id: 'neptune', x: 0.45, y: 0.40, r: 0.025, base: ['#9fd8ff', '#1a4a8a'] },
  { id: 'toxic', x: 0.66, y: 0.80, r: 0.036, base: ['#9dffb0', '#1a5a3a'], glow: 'rgba(93,255,154,.25)',
    bands: [[-0.3, 0.2, 'rgba(30,120,60,.4)'], [0.2, 0.15, 'rgba(30,120,60,.4)']] },
  { id: 'rogue', x: 0.81, y: 0.27, r: 0.047, base: ['#3a3550', '#0a0812'], cracks: 'rgba(190,120,255,.7)', glow: 'rgba(155,77,255,.18)' },
  { id: 'homeworld', x: 0.93, y: 0.66, r: 0.09, base: ['#d9a8ff', '#3a0a6a'], glow: 'rgba(155,77,255,.35)',
    bands: [[-0.5, 0.12, 'rgba(255,120,220,.35)'], [0, 0.1, 'rgba(255,120,220,.3)'], [0.45, 0.12, 'rgba(255,120,220,.35)']] },
];

// Base wash from bottom-left (Sol) to top-right (Veth): blue -> navy -> violet,
// the vista mockup's stops. [offset, colour].
export const SPACE_GRADIENT = [
  [0, '#0a1530'],
  [0.45, '#090d1c'],
  [1, '#14082a'],
];

// The fixed star field painted into the far layer (mockup: 260 stars). It never
// moves, so it may be brighter than the drift layers' 20% ambient-motion cap.
export const STARS_STATIC = { seed: 3, count: 260, alpha: [0.15, 0.75], sizePx: [0.6, 2], color: '#e8e0d0' };

// How every PLANETS entry is shaded (mockup planet()): r-relative geometry, the
// lit-side highlight offset, the night-side shade and the crack count.
export const PLANET_STYLE = {
  highlight: 0.35,
  core: 0.1,
  glow: [0.8, 2.4],
  ring: { rx: 2, ry: 0.5, tilt: -0.35, width: 0.18 },
  cracks: { count: 6, seed: 5, width: 0.05, from: 0.2, to: 0.9, sweep: 0.4 },
  night: { from: 0.45, color: 'rgba(0,0,0,.65)' },
};

// Earth at the route start (Sol side). r is a fraction of the frame's short side.
export const EARTH = {
  r: 0.06,
  stops: [[0, '#9fe0ff'], [0.45, '#2a7ac0'], [0.75, '#0b2a55']],
  glow: 'rgba(79,195,247,.55)',
};

// The hive core under node 10. Drawn on the story layer because it dims to
// dimAlpha when the campaign is won (spec 2.3, hiveDim).
export const HIVE_CORE = {
  r: 0.13,
  stops: [[0, '#e8c8ff'], [0.35, 'rgba(155,77,255,.85)'], [0.7, 'rgba(58,10,106,.5)'], [1, 'rgba(58,10,106,0)']],
  dimAlpha: 0.25,
};

// Gradient end stop for every glow and wash (canvas has no 'fade to nothing' colour).
export const TRANSPARENT = 'rgba(0,0,0,0)';

// Slow cyan pulse on the `next` node; .motion-off stops it.
export const NODE_PULSE_MS = 1800;

// Far-layer washes in viewport fractions (r of viewport width): this is the layer
// BACKDROP_ART replaces, and art covers the viewport, not the frame.
export const NEBULAE = [
  { x: 0.30, y: 0.70, r: 0.25, color: 'rgba(60,120,200,.18)' },
  { x: 0.62, y: 0.25, r: 0.30, color: 'rgba(155,77,255,.22)' },
  { x: 0.48, y: 0.45, r: 0.18, color: 'rgba(200,90,160,.10)' },
];

// Route-frame band endpoints; it crosses near the Asteroid Belt node (map 4).
export const BELT = {
  seed: 9,
  from: [0.40, 0.95],
  to: [0.66, 0.40],
  jitter: 0.04,
  count: 120,
  sizePx: [0.6, 2.2],
  color: 'rgba(160,150,140,.35)',
};

// Centred on Earth's route point plus `offset` (viewport fractions); r of viewport width.
export const SUN_GLARE = { offset: [-0.03, 0.11], r: 0.35, color: 'rgba(255,214,140,.22)' };

// Veth-held space: a radial wash on the hive core out to the front radius.
export const HAZE = {
  rgb: [110, 40, 190],
  maxAlpha: 0.22,
  featherPx: 60,
  // The haze never shrinks below this while any map is held: node 10 IS the hive,
  // so the true radius there is 0. Plus half the feather it stays short of node 9
  // on every capture device (worldRoute.test.js).
  minRadiusPx: 36,
  front: { dash: [6, 6], color: 'rgba(200,160,255,.55)', width: 1.5 },
};

// Travelled gold reads the kit's --ui-currency so the trail matches the ★ and LAUNCH.
export const TRAIL = {
  travelled: { cssVar: '--ui-currency', width: 2.5 },
  ahead: { color: 'rgba(180,160,220,.3)', width: 1.5, dash: [4, 5] },
};

// Amber engine is the art-bible human accent.
// Parked by worldRoute.parkShip: stepped back along the incoming leg (stepPx at a
// time) until its sizePx box, grown by clearPx, misses every node rect (label and
// stars included); if the whole leg is covered it steps sideways, up to maxOffsetPx.
// shape is the chevron hull in sizePx units, nose along +x; the engine glow sits
// at engineX with radius engineR (also sizePx units).
export const SHIP = {
  sizePx: 16,
  hull: '#d8e2ee',
  engine: '#ffb000',
  clearPx: 4,
  stepPx: 2,
  maxOffsetPx: 60,
  shape: [[0.6, 0], [-0.4, 0.45], [-0.15, 0], [-0.4, -0.45]],
  engineX: -0.35,
  engineR: 0.7,
};

// Ambient drift stays under 20% opacity (art bible 8). speed is CSS px/s.
const MAP_STAR_LAYERS = [
  { count: 90, speed: 3, size: 1, alpha: 0.12 },
  { count: 40, speed: 7, size: 1.6, alpha: 0.18 },
];

// minFrameMs: repaint only once the fastest layer has moved 1 CSS px. The drift
// is faint and slow, so 60 fps full-viewport repaints buy nothing (final review I2).
export const STARS_MAP = {
  seed: 7,
  layers: MAP_STAR_LAYERS,
  minFrameMs: 1000 / Math.max(...MAP_STAR_LAYERS.map(l => l.speed)),
};

// Deferred-asset slot (spec 4.4): empty today, so nothing is loaded and the
// procedural backdrop draws. Dropping art in = set this to its path under
// public/ (e.g. 'assets/worldmap/vista.webp'); BootScene then loads it.
export const BACKDROP_ART = null;
