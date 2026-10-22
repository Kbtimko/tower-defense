import { describe, it, expect } from 'vitest';
import { makeNoise, noiseTile, featherSteps, roadClearance } from './roadMath.js';
import { ROAD_STYLES, ROAD_PAD_GAP, ROAD_DEPTH, ENDPOINT_FX } from '../data/roads.js';
import { PATH_STYLES } from './PathRenderer.js';
import { PathManager } from './PathManager.js';
import { MAPS } from '../data/maps.js';

describe('ROAD_STYLES data', () => {
  it('has a style for every PATH_STYLES key', () => {
    for (const key of PATH_STYLES) expect(ROAD_STYLES[key], key).toBeDefined();
  });
  it('keeps solid halfWidth <= 13 and a valid kind/family/endpoint fx', () => {
    for (const [key, s] of Object.entries(ROAD_STYLES)) {
      expect(s.halfWidth, key).toBeLessThanOrEqual(13);
      expect(['road', 'lane']).toContain(s.kind);
      expect(ENDPOINT_FX[s.family], key).toBeDefined();
      expect(s.noise.colors).toHaveLength(2);
      expect(s.wear).toBeGreaterThanOrEqual(0);
      expect(s.wear).toBeLessThanOrEqual(1);
    }
  });
  it('exposes pad gap and depth constants', () => {
    expect(ROAD_PAD_GAP).toBe(10);
    expect(ROAD_DEPTH).toBe(8);
  });
});

describe('road clearance on real map data', () => {
  for (const map of MAPS) {
    it(`map ${map.id}: every slot is >= halfWidth + gap from the road`, () => {
      const pm = new PathManager(map.waypoints, map.towerSlots, 1280, 720);
      const style = ROAD_STYLES[map.pathRenderStyle];
      expect(style, map.pathRenderStyle).toBeDefined();
      expect(roadClearance(pm.waypoints, pm.buildZones)).toBeGreaterThanOrEqual(
        style.halfWidth + ROAD_PAD_GAP,
      );
    });
  }
  it('measures a known distance', () => {
    const d = roadClearance([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ cx: 50, cy: 30 }]);
    expect(d).toBeCloseTo(30, 6);
  });
  it('returns Infinity for no slots', () => {
    expect(roadClearance([{ x: 0, y: 0 }, { x: 10, y: 0 }], [])).toBe(Infinity);
  });
});

describe('makeNoise', () => {
  it('is deterministic per seed, differs across seeds, stays in [0,1]', () => {
    const a = makeNoise(7), b = makeNoise(7), c = makeNoise(8);
    let diff = 0;
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37, y = i * 0.91;
      expect(a(x, y)).toBe(b(x, y));
      expect(a(x, y)).toBeGreaterThanOrEqual(0);
      expect(a(x, y)).toBeLessThanOrEqual(1);
      if (a(x, y) !== c(x, y)) diff++;
    }
    expect(diff).toBeGreaterThan(100);
  });
  it('accepts string seeds deterministically', () => {
    expect(makeNoise('map-1')(3.3, 4.4)).toBe(makeNoise('map-1')(3.3, 4.4));
  });
  it('wraps its lattice at the given period', () => {
    const n = makeNoise(3, 8);
    for (const [x, y] of [[0.5, 1.5], [2.25, 7.1], [3, 3]]) {
      expect(n(x + 8, y)).toBeCloseTo(n(x, y), 9);
      expect(n(x, y + 8)).toBeCloseTo(n(x, y), 9);
    }
  });
});

describe('noiseTile', () => {
  const style = ROAD_STYLES['planet-road'];
  it('is size*size*4 bytes, opaque, deterministic', () => {
    const t = noiseTile(5, 16, style);
    expect(t).toBeInstanceOf(Uint8ClampedArray);
    expect(t.length).toBe(16 * 16 * 4);
    for (let i = 3; i < t.length; i += 4) expect(t[i]).toBe(255);
    expect(Array.from(noiseTile(5, 16, style))).toEqual(Array.from(t));
    expect(Array.from(noiseTile(6, 16, style))).not.toEqual(Array.from(t));
  });
  it('stays within the style colour range per channel', () => {
    const t = noiseTile(5, 16, style);
    const [d, l] = style.noise.colors;
    const lo = (c, s) => Math.min((d >> s) & 255, (l >> s) & 255);
    const hi = (c, s) => Math.max((d >> s) & 255, (l >> s) & 255);
    for (let i = 0; i < t.length; i += 4) {
      expect(t[i]).toBeGreaterThanOrEqual(lo(0, 16));
      expect(t[i]).toBeLessThanOrEqual(hi(0, 16));
    }
  });
  it('tiles seamlessly: the wrap seam is no rougher than interior steps', () => {
    const size = 32;
    const t = noiseTile(9, size, style);
    const px = (x, y) => t[(y * size + x) * 4];
    let seam = 0, interior = 0;
    for (let y = 0; y < size; y++) {
      seam += Math.abs(px(0, y) - px(size - 1, y));
      for (let x = 0; x < size - 1; x++) interior += Math.abs(px(x + 1, y) - px(x, y)) / (size - 1);
    }
    for (let x = 0; x < size; x++) seam += Math.abs(px(x, 0) - px(x, size - 1));
    // Seam is 2*size comparisons, interior averaged per row => compare per-comparison means.
    expect(seam / (2 * size)).toBeLessThanOrEqual((interior / size) * 3 + 2);
  });
});

describe('featherSteps', () => {
  it('goes outermost to innermost with decreasing width and non-decreasing small alpha', () => {
    const s = featherSteps(12, 8, 5);
    expect(s).toHaveLength(5);
    expect(s[0].width).toBeCloseTo(2 * (12 + 8), 6);
    for (let i = 1; i < s.length; i++) {
      expect(s[i].width).toBeLessThan(s[i - 1].width);
      expect(s[i].alpha).toBeGreaterThanOrEqual(s[i - 1].alpha);
    }
    for (const st of s) {
      expect(st.width).toBeGreaterThan(2 * 12);
      expect(st.alpha).toBeGreaterThan(0);
      expect(st.alpha).toBeLessThanOrEqual(0.5);
    }
  });
  it('handles zero feather / zero steps', () => {
    expect(featherSteps(12, 0, 4)).toEqual([]);
    expect(featherSteps(12, 8, 0)).toEqual([]);
  });
});
