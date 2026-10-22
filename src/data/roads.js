// Tunables for the procedural road (roadmap 1.7). Colours start from the legacy
// PathRenderer STYLE_SPEC palette so each map keeps its identity.
// halfWidth is the SOLID bed half-width and must stay <= 13 so tower pads
// (drawn at depth 10, >= 25 px from the centreline on real maps) never overlap it.

export const ROAD_PAD_GAP = 10;
// Above backdrop (0), area effects (2), ambient (5); below blockers/pads (10).
export const ROAD_DEPTH = 8;

const planet = {
  family: 'planet', kind: 'road', halfWidth: 13, feather: 9,
  base: 0x6b5740, edge: 0x9a8362,
  noise: { scale: 9, contrast: 1.4, colors: [0x5a4632, 0x8a5a3a] },
  wear: 0.35,
  lane: { color: 0x3a2e20, alpha: 0.45, width: 2, dash: 5, gap: 9 },
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
  base: 0x49555f, edge: 0x33414e,
  noise: { scale: 14, contrast: 0.8, colors: [0x3e4953, 0x56636e] },
  wear: 0.2,
  lane: { color: 0x66ccff, alpha: 0.55, width: 2, dash: 6, gap: 10 },
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
  base: 0x2a1a16, edge: 0xff7a30,
  noise: { scale: 8, contrast: 1.5, colors: [0x1c110e, 0x3e2a22] },
  wear: 0.2,
  lane: { color: 0xff5522, alpha: 0.5, width: 2, dash: 5, gap: 9 },
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
  planet:   { portal: { colors: [0x9b59b6, 0x33ff66], radius: 26, spin: 1.2, pulse: 2.0 }, beacon: { color: 0xffb000, radius: 20, pulse: 1.6 } },
  lunar:    { portal: { colors: [0x9b59b6, 0xd0b0ff], radius: 26, spin: 1.0, pulse: 1.8 }, beacon: { color: 0xffb000, radius: 20, pulse: 1.6 } },
  station:  { portal: { colors: [0x33ff66, 0x9b59b6], radius: 24, spin: 1.6, pulse: 2.4 }, beacon: { color: 0xffb000, radius: 20, pulse: 1.8 } },
  space:    { portal: { colors: [0x9b59b6, 0x33ff66], radius: 28, spin: 0.8, pulse: 1.4 }, beacon: { color: 0xffb000, radius: 22, pulse: 1.4 } },
  organic:  { portal: { colors: [0x33ff66, 0xe74c3c], radius: 28, spin: 1.4, pulse: 2.2 }, beacon: { color: 0xffb000, radius: 20, pulse: 1.8 } },
  scorched: { portal: { colors: [0xe74c3c, 0x9b59b6], radius: 28, spin: 1.8, pulse: 2.6 }, beacon: { color: 0xffb000, radius: 22, pulse: 2.0 } },
};
