import { describe, it, expect } from 'vitest';
import { gradeMatrix, applyMatrix, resolveMapGrade } from './mapGrade.js';
import { MAPS } from '../data/maps.js';

const IDENTITY = [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0];
const near = (a, b) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4));

describe('gradeMatrix', () => {
  it('is the identity for a neutral grade', () => {
    near(gradeMatrix({}), IDENTITY);
    near(gradeMatrix({ tint: [1, 1, 1], contrast: 1, saturation: 1, brightness: 1 }), IDENTITY);
  });

  it('tints as per-channel gain, scaled by brightness', () => {
    const out = applyMatrix(gradeMatrix({ tint: [1.1, 1, 0.9], brightness: 0.5 }), [100, 100, 100]);
    near(out, [55, 50, 45]);
  });

  it('pivots contrast around mid-grey', () => {
    const m = gradeMatrix({ contrast: 1.2 });
    near(applyMatrix(m, [127.5, 127.5, 127.5]), [127.5, 127.5, 127.5]);
    expect(applyMatrix(m, [200, 200, 200])[0]).toBeGreaterThan(200);
    expect(applyMatrix(m, [50, 50, 50])[0]).toBeLessThan(50);
  });

  it('desaturates to luminance grey at saturation 0', () => {
    const [r, g, b] = applyMatrix(gradeMatrix({ saturation: 0 }), [255, 0, 0]);
    expect(r).toBeCloseTo(g, 4);
    expect(g).toBeCloseTo(b, 4);
    expect(r).toBeCloseTo(0.2126 * 255, 3);
  });

  it('applies saturation, then contrast, then tint, as one matrix', () => {
    const grade = { tint: [1.05, 0.98, 0.9], contrast: 1.1, saturation: 0.8, brightness: 0.95 };
    const c = [180, 90, 40];
    const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const sat = c.map(v => lum + (v - lum) * 0.8);
    const con = sat.map(v => (v - 127.5) * 1.1 + 127.5);
    const expected = con.map((v, i) => v * 0.95 * grade.tint[i]);
    near(applyMatrix(gradeMatrix(grade), c), expected);
  });

  it('leaves alpha alone', () => {
    const m = gradeMatrix({ tint: [1.2, 0.8, 1], contrast: 1.3, saturation: 0.5 });
    near(m.slice(15), [0, 0, 0, 1, 0]);
  });
});

describe('resolveMapGrade', () => {
  it('auto (no saved choice) grades only on a non-touch WebGL device', () => {
    expect(resolveMapGrade(null, { webgl: true, touch: false })).toBe(true);
    expect(resolveMapGrade(null, { webgl: true, touch: true })).toBe(false);
    expect(resolveMapGrade(undefined, { webgl: false, touch: false })).toBe(false);
  });

  it('honours an explicit choice, except that Canvas cannot grade', () => {
    expect(resolveMapGrade(true, { webgl: true, touch: true })).toBe(true);
    expect(resolveMapGrade(false, { webgl: true, touch: false })).toBe(false);
    expect(resolveMapGrade(true, { webgl: false, touch: false })).toBe(false);
  });
});

describe('map grade data', () => {
  it('gives every map a grade with values in a sane range', () => {
    for (const m of MAPS) {
      const g = m.grade;
      expect(g, `map ${m.id}`).toBeDefined();
      for (const t of g.tint) {
        expect(t).toBeGreaterThan(0.8);
        expect(t).toBeLessThan(1.2);
      }
      expect(g.contrast).toBeGreaterThanOrEqual(0.85);
      expect(g.contrast).toBeLessThanOrEqual(1.2);
      expect(g.saturation).toBeGreaterThanOrEqual(0.7);
      expect(g.saturation).toBeLessThanOrEqual(1.25);
      expect(g.brightness).toBeGreaterThanOrEqual(0.85);
      expect(g.brightness).toBeLessThanOrEqual(1.1);
      expect(g.vignette).toBeGreaterThanOrEqual(0);
      // Above 0.5 the vignette dims pads near the canvas edge (map 7 at 0.6).
      expect(g.vignette).toBeLessThanOrEqual(0.5);
    }
  });

  it('gives each map its own mood', () => {
    const keys = MAPS.map(m => JSON.stringify(m.grade));
    expect(new Set(keys).size).toBe(MAPS.length);
  });
});
