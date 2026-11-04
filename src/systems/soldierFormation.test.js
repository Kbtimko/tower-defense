import { describe, it, expect } from 'vitest';
import { formationOffsets } from './soldierFormation.js';

const S = 10, FB = 0.4;
const dot = (o, d) => o.dx * d.x + o.dy * d.y;

describe('formationOffsets', () => {
  it('E32: counts 1/3/4 give that many distinct offsets', () => {
    for (const n of [1, 3, 4]) {
      const o = formationOffsets(n, { x: 1, y: 0 }, S, FB);
      expect(o).toHaveLength(n);
      expect(new Set(o.map((p) => `${p.dx.toFixed(4)},${p.dy.toFixed(4)}`)).size).toBe(n);
    }
  });

  it('index 0 is `spacing` ahead; flanks are mirror images about dir, behind it', () => {
    const d = { x: 1, y: 0 };
    const [a, l, r] = formationOffsets(3, d, S, FB);
    expect(dot(a, d)).toBeCloseTo(S, 6);
    expect(a.dy).toBeCloseTo(0, 6);
    expect(l.dx).toBeCloseTo(r.dx, 6);
    expect(l.dy).toBeCloseTo(-r.dy, 6);
    expect(Math.abs(l.dy)).toBeCloseTo(S, 6);
    expect(l.dx).toBeCloseTo(-FB * S, 6);
  });

  it('fourth soldier sits further behind than the flanks', () => {
    const d = { x: 1, y: 0 };
    const o = formationOffsets(4, d, S, FB);
    expect(dot(o[3], d)).toBeLessThan(dot(o[1], d));
    // Left of the heading (+y for dir +x), half a spacing out: the side index 1 flanks.
    expect(o[3].dy).toBeCloseTo(0.5 * S, 6);
    expect(Math.sign(o[3].dy)).toBe(Math.sign(o[1].dy));
  });

  it('a fifth soldier sits opposite the fourth, one spacing further back', () => {
    const d = { x: 1, y: 0 };
    const o = formationOffsets(5, d, S, FB);
    expect(o).toHaveLength(5);
    expect(o[4].dy).toBeCloseTo(-o[3].dy, 6);
    expect(o[4].dy).not.toBeCloseTo(0, 6);
    expect(dot(o[4], d)).toBeCloseTo(dot(o[3], d) - S, 6);
    expect(formationOffsets(4, d, S, FB)).toEqual(o.slice(0, 4));
  });

  it('is deterministic', () => {
    const d = { x: 0.6, y: 0.8 };
    expect(formationOffsets(4, d, S, FB)).toEqual(formationOffsets(4, d, S, FB));
  });

  it('E33: zero and NaN dir fall back to -x with no NaN', () => {
    for (const d of [{ x: 0, y: 0 }, { x: NaN, y: NaN }]) {
      const o = formationOffsets(4, d, S, FB);
      for (const p of o) {
        expect(Number.isNaN(p.dx)).toBe(false);
        expect(Number.isNaN(p.dy)).toBe(false);
      }
      expect(o[0].dx).toBeCloseTo(-S, 6);
      expect(o[0].dy).toBeCloseTo(0, 6);
    }
  });

  it('normalises dir and rotates with it', () => {
    const a = formationOffsets(4, { x: 5, y: 0 }, S, FB);
    const b = formationOffsets(4, { x: 0, y: 3 }, S, FB); // 90 degrees
    a.forEach((p, i) => {
      expect(b[i].dx).toBeCloseTo(-p.dy, 6);
      expect(b[i].dy).toBeCloseTo(p.dx, 6);
    });
  });
});
