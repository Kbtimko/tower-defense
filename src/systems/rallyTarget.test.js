import { describe, it, expect } from 'vitest';
import { PathManager } from './PathManager.js';
import { pointAtProgress } from './pathGeometry.js';
import { resolveRallyTarget } from './rallyTarget.js';

// Straight horizontal road y=100, x 0..400, so every number is exact.
const pathMgr = new PathManager([[0, 0.25], [1, 0.25]], [], 400, 400);
const centre = { x: 200, y: 100 };
const base = { pathMgr, centre, range: 100, tapRadius: 30 };

describe('resolveRallyTarget', () => {
  it('E1: snapped point exactly `range` from the barracks is valid', () => {
    const r = resolveRallyTarget({ ...base, x: 300, y: 120 });
    expect(r.point.x).toBeCloseTo(300, 6);
    expect(r.point.y).toBeCloseTo(100, 6);
    expect(r.inRange).toBe(true);
    expect(r.valid).toBe(true);
  });

  it('E2: a hair past `range` is out of range and invalid', () => {
    const r = resolveRallyTarget({ ...base, x: 300.01, y: 100 });
    expect(r.onRoad).toBe(true);
    expect(r.inRange).toBe(false);
    expect(r.valid).toBe(false);
  });

  it('E3: pointer exactly `tapRadius` off the road is NOT on the road', () => {
    const r = resolveRallyTarget({ ...base, x: 200, y: 130 });
    expect(r.onRoad).toBe(false);
    expect(r.valid).toBe(false);
    const inside = resolveRallyTarget({ ...base, x: 200, y: 129.99 });
    expect(inside.onRoad).toBe(true);
  });

  it('takes range from the argument', () => {
    const near = resolveRallyTarget({ ...base, range: 50, x: 300, y: 100 });
    const far = resolveRallyTarget({ ...base, range: 200, x: 300, y: 100 });
    expect(near.valid).toBe(false);
    expect(far.valid).toBe(true);
  });

  it('point equals pointAtProgress(path, progress)', () => {
    const r = resolveRallyTarget({ ...base, x: 260, y: 110 });
    expect(r.point).toEqual(pointAtProgress(pathMgr.getPathPoints(), r.progress));
    expect(r.progress).toBeCloseTo(0.65, 6);
  });

  it('E7: pointer beyond the path end clamps to progress 1', () => {
    const r = resolveRallyTarget({ ...base, range: 500, x: 450, y: 100 });
    expect(r.progress).toBe(1);
    expect(r.point.x).toBeCloseTo(400, 6);
    expect(r.valid).toBe(false); // 50px past the end, tapRadius 30
    const onEnd = resolveRallyTarget({ ...base, range: 500, x: 420, y: 100 });
    expect(onEnd.progress).toBe(1);
    expect(onEnd.onRoad).toBe(true);
    expect(onEnd.valid).toBe(true);
  });

  it('E7: pointer before the path start clamps to progress 0', () => {
    const r = resolveRallyTarget({ ...base, centre: { x: 0, y: 100 }, x: -50, y: 100 });
    expect(r.progress).toBe(0);
    expect(r.point.x).toBeCloseTo(0, 6);
    expect(r.point.y).toBeCloseTo(100, 6);
    expect(r.valid).toBe(false); // 50px before the start, tapRadius 30
    const onStart = resolveRallyTarget({ ...base, centre: { x: 0, y: 100 }, x: -20, y: 100 });
    expect(onStart.progress).toBe(0);
    expect(onStart.onRoad).toBe(true);
    expect(onStart.valid).toBe(true);
  });
});
