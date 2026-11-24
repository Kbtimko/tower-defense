// Pure helpers for the procedural road. No Phaser, no canvas — Vitest-friendly.
import { samplePath } from './pathGeometry.js';
import { ROAD_CURVE_SAMPLES } from '../data/roads.js';

function seedToInt(seed) {
  if (typeof seed === 'number') return seed | 0;
  const str = String(seed);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return h | 0;
}

// Integer lattice hash -> [0,1). Stateless so noise(x,y) is order-independent.
function hash2(ix, iy, s) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);
const mod = (n, m) => ((n % m) + m) % m;

/**
 * Seeded 2D value noise, smooth-interpolated, in [0,1].
 * `period` (optional) wraps the lattice so the field tiles at that many cells.
 */
export function makeNoise(seed, period = 0) {
  const s = seedToInt(seed);
  const wrap = (i) => (period > 0 ? mod(i, period) : i);
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = hash2(wrap(x0), wrap(y0), s);
    const b = hash2(wrap(x0 + 1), wrap(y0), s);
    const c = hash2(wrap(x0), wrap(y0 + 1), s);
    const d = hash2(wrap(x0 + 1), wrap(y0 + 1), s);
    const top = a + (b - a) * fx;
    const bot = c + (d - c) * fx;
    return top + (bot - top) * fy;
  };
}

/**
 * RGBA bytes for a seamlessly tileable size x size pattern. The lattice period
 * is a whole number of cells so the wrap lands exactly on the tile edge.
 */
export function noiseTile(seed, size, style) {
  const { scale, contrast, colors: [dark, light] } = style.noise;
  const cells = Math.max(1, Math.round(size / scale));
  const noise = makeNoise(seed, cells);
  const out = new Uint8ClampedArray(size * size * 4);
  const ch = (c, shift) => (c >> shift) & 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const raw = noise((x / size) * cells, (y / size) * cells);
      const v = Math.min(1, Math.max(0, (raw - 0.5) * contrast + 0.5));
      const i = (y * size + x) * 4;
      out[i] = ch(dark, 16) + (ch(light, 16) - ch(dark, 16)) * v;
      out[i + 1] = ch(dark, 8) + (ch(light, 8) - ch(dark, 8)) * v;
      out[i + 2] = ch(dark, 0) + (ch(light, 0) - ch(dark, 0)) * v;
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Stacked-stroke soft edge (canvas filter/blur is unavailable on iOS Safari).
 * Outermost first; each stroke is narrower and slightly more opaque, and the
 * innermost stays wider than the solid bed (2*halfWidth).
 */
export function featherSteps(halfWidth, feather, steps) {
  if (feather <= 0 || steps <= 0) return [];
  const out = [];
  for (let i = 0; i < steps; i++) {
    out.push({
      width: 2 * halfWidth + 2 * feather * ((steps - i) / steps),
      alpha: 0.02 + 0.1 * ((i + 1) / steps),
    });
  }
  return out;
}

function distToSegment(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
  return Math.hypot(a.x + t * dx - px, a.y + t * dy - py);
}

/** Minimum distance from any slot centre {cx, cy} to the sampled road centreline. */
export function roadClearance(waypoints, slots) {
  const curve = samplePath(waypoints, ROAD_CURVE_SAMPLES);
  let min = Infinity;
  for (const s of slots) {
    for (let i = 0; i < curve.length - 1; i++) {
      min = Math.min(min, distToSegment(s.cx, s.cy, curve[i], curve[i + 1]));
    }
  }
  return min;
}
