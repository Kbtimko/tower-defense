// src/systems/pathGeometry.test.js
import { samplePath, clampToBounds, pathLength, pointAtProgress } from './pathGeometry.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

describe('samplePath', () => {
  it('returns a copy of the straight segment (densified) for 2 points', () => {
    const out = samplePath([{ x: 0, y: 0 }, { x: 10, y: 0 }], 5);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[out.length - 1]).toEqual({ x: 10, y: 0 });
    expect(out.length).toBe(6); // 5 sub-segments => 6 points
    expect(out[2].x).toBeCloseTo(4, 6); // evenly spaced
  });

  it('first and last sampled points equal the first/last control points exactly', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 80 }, { x: 120, y: 20 }, { x: 200, y: 100 }];
    const out = samplePath(pts, 8);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('passes through every interior control point (within float epsilon)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 80 }, { x: 120, y: 20 }, { x: 200, y: 100 }];
    const out = samplePath(pts, 16);
    for (const p of pts) {
      const hit = out.some(o => near(o.x, p.x, 1e-3) && near(o.y, p.y, 1e-3));
      expect(hit).toBe(true);
    }
  });

  it('is deterministic', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 80 }, { x: 120, y: 20 }];
    expect(samplePath(pts, 10)).toEqual(samplePath(pts, 10));
  });

  it('handles coincident adjacent points without NaN', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }];
    const out = samplePath(pts, 8);
    expect(out.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('returns shallow-copied points for < 2 inputs', () => {
    expect(samplePath([{ x: 1, y: 2 }], 8)).toEqual([{ x: 1, y: 2 }]);
    expect(samplePath([], 8)).toEqual([]);
  });

  it('clamps samplesPerSegment below 1 and never emits NaN', () => {
    const out = samplePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 0);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('clampToBounds', () => {
  it('clamps each point into [0,w] x [0,h]', () => {
    const out = clampToBounds([{ x: -5, y: 50 }, { x: 120, y: -3 }], 100, 80);
    expect(out).toEqual([{ x: 0, y: 50 }, { x: 100, y: 0 }]);
  });

  it('leaves in-bounds points unchanged', () => {
    expect(clampToBounds([{ x: 50, y: 50 }], 100, 100)).toEqual([{ x: 50, y: 50 }]);
  });
});

import { offsetPolyline } from './pathGeometry.js';

describe('offsetPolyline', () => {
  // A straight horizontal centerline. Tangent is +x, so the LEFT normal is
  // (-ty, tx) = (0, 1): a positive offset shifts points to +y, negative to -y.
  const LINE = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];

  it('offsets a horizontal line by +dist along +y', () => {
    const out = offsetPolyline(LINE, 5);
    expect(out).toHaveLength(LINE.length);
    for (const p of out) expect(p.y).toBeCloseTo(5, 6);
    expect(out.map((p) => p.x)).toEqual([0, 10, 20]);
  });

  it('offsets by -dist along -y', () => {
    const out = offsetPolyline(LINE, -5);
    for (const p of out) expect(p.y).toBeCloseTo(-5, 6);
  });

  it('returns the input unchanged in shape for <2 points', () => {
    expect(offsetPolyline([{ x: 1, y: 2 }], 5)).toEqual([{ x: 1, y: 2 }]);
    expect(offsetPolyline([], 5)).toEqual([]);
  });
});

describe('pathLength', () => {
  it('sums the segment lengths', () => {
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 14 }])).toBe(15);
  });

  it('is zero for a degenerate path', () => {
    expect(pathLength([{ x: 5, y: 5 }])).toBe(0);
    expect(pathLength([])).toBe(0);
  });
});

describe('pointAtProgress', () => {
  const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

  it('returns the start at progress 0 and the end at progress 1', () => {
    expect(pointAtProgress(line, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAtProgress(line, 1)).toEqual({ x: 100, y: 0 });
  });

  it('interpolates linearly along a segment', () => {
    expect(pointAtProgress(line, 0.25)).toEqual({ x: 25, y: 0 });
  });

  it('walks across multiple segments by arc length, not by index', () => {
    // First segment is 3 long, second is 9 long -> total 12. Halfway (6) lands
    // 3 into the second segment.
    const bent = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 9 }];
    const p = pointAtProgress(bent, 0.5);
    expect(near(p.x, 3)).toBe(true);
    expect(near(p.y, 3)).toBe(true);
  });

  it('clamps out-of-range progress to the path ends', () => {
    expect(pointAtProgress(line, -1)).toEqual({ x: 0, y: 0 });
    expect(pointAtProgress(line, 5)).toEqual({ x: 100, y: 0 });
  });

  it('survives a zero-length path without dividing by zero', () => {
    const p = pointAtProgress([{ x: 7, y: 7 }, { x: 7, y: 7 }], 0.5);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});
