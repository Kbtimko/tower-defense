import { describe, it, expect } from 'vitest';
import { pennantCorners, growTriangle } from './pennantGeometry.js';

// Signed distance from point p to the line through a→b, positive on the side away from c.
function outwardDist(p, a, b, c) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const cross = (q) => ((b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x)) / len;
  return -Math.sign(cross(c)) * cross(p);
}

describe('pennantCorners', () => {
  it('puts the pole top, the tip w out at half height, and the foot h down the pole', () => {
    expect(pennantCorners(100, 50, { w: 10, h: 7 })).toEqual([
      { x: 100, y: 50 }, { x: 110, y: 53.5 }, { x: 100, y: 57 },
    ]);
  });
});

describe('growTriangle', () => {
  const pennant = pennantCorners(100, 50, { w: 10, h: 7 });
  const right = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }];

  it('returns the same corners for d = 0', () => {
    growTriangle(right, 0).forEach((p, i) => {
      expect(p.x).toBeCloseTo(right[i].x, 9);
      expect(p.y).toBeCloseTo(right[i].y, 9);
    });
  });

  for (const [name, tri] of [['pennant', pennant], ['3-4-5', right]]) {
    for (const d of [2, 3]) {
      it(`moves every edge of the ${name} triangle out by exactly ${d}`, () => {
        const g = growTriangle(tri, d);
        for (const [i, j, k] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]]) {
          // The grown edge's endpoints both sit d outside the original edge: parallel and d out.
          expect(outwardDist(g[i], tri[i], tri[j], tri[k])).toBeCloseTo(d, 9);
          expect(outwardDist(g[j], tri[i], tri[j], tri[k])).toBeCloseTo(d, 9);
        }
      });
    }
  }
});
