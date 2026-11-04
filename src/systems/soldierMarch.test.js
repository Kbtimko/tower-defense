import { describe, it, expect } from 'vitest';
import { marchStep, contactTest, isMarching, routeDots, travelDir } from './soldierMarch.js';
import { MELEE_RANGE } from './soldierCombat.js';
import { pointAtProgress, pathLength } from './pathGeometry.js';

const STRAIGHT = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
// 200 px east then 200 px south: total 400, corner at progress 0.5.
const L = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }];
const never = () => false;
const base = (path, over = {}) => ({
  progress: 0, target: 1, dt: 1, speed: 60, totalLength: pathLength(path),
  substepPx: 15, path, blocked: never, ...over,
});
const arc = (path, a, b) => Math.abs(b - a) * pathLength(path);

describe('marchStep', () => {
  it('walks speed*dt px of arc on a straight road', () => {
    const r = marchStep(base(STRAIGHT, { dt: 0.5 }));
    expect(r.progress * 400).toBeCloseTo(30, 6);
    expect(r.walkedPx).toBeCloseTo(30, 6);
    expect(r.arrived).toBe(false);
    expect(r.halted).toBe(false);
  });

  it('measures distance in arc length across a corner (L path)', () => {
    // start 20 px before the corner, walk 60 px: 20 east + 40 south
    const r = marchStep(base(L, { progress: 180 / 400, dt: 1 }));
    const p = pointAtProgress(L, r.progress);
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(40, 6);
    expect(r.walkedPx).toBeCloseTo(60, 6);
    expect(arc(L, 180 / 400, r.progress)).toBeCloseTo(60, 6);
  });

  it('E5: target within one step lands exactly with no overshoot', () => {
    const r = marchStep(base(STRAIGHT, { progress: 0.5, target: 0.5 + 10 / 400 }));
    expect(r.progress).toBe(0.5 + 10 / 400);
    expect(r.arrived).toBe(true);
    expect(r.walkedPx).toBeCloseTo(10, 6);
  });

  it('E6: target behind walks progress downward', () => {
    const r = marchStep(base(STRAIGHT, { progress: 0.5, target: 0 }));
    expect(r.progress * 400).toBeCloseTo(200 - 60, 6);
    expect(r.arrived).toBe(false);
  });

  it('E7: clamps progress to [0, 1]', () => {
    const hi = marchStep(base(STRAIGHT, { progress: 0.99, target: 5, dt: 10 }));
    expect(hi.progress).toBeLessThanOrEqual(1);
    const lo = marchStep(base(STRAIGHT, { progress: 0.01, target: -5, dt: 10 }));
    expect(lo.progress).toBeGreaterThanOrEqual(0);
  });

  it('no-op guards: dt<=0, progress===target, totalLength<=0', () => {
    const a = marchStep(base(STRAIGHT, { dt: 0, progress: 0.2 }));
    expect(a).toEqual({ progress: 0.2, arrived: false, halted: false, walkedPx: 0 });
    const b = marchStep(base(STRAIGHT, { progress: 0.4, target: 0.4 }));
    expect(b).toEqual({ progress: 0.4, arrived: true, halted: false, walkedPx: 0 });
    const c = marchStep(base(STRAIGHT, { progress: 0.2, totalLength: 0 }));
    expect(c).toEqual({ progress: 0.2, arrived: false, halted: false, walkedPx: 0 });
  });

  it('E13: a 0.4 s step into an enemy 20 px ahead halts inside MELEE_RANGE, never past it, in sub-steps', () => {
    const enemy = { x: 120, y: 0 };
    const calls = [];
    const blocked = (pt) => {
      calls.push(pt);
      return Math.hypot(pt.x - enemy.x, pt.y - enemy.y) < MELEE_RANGE;
    };
    // soldier at x=100, enemy 20 px ahead -> already in range? use x=60 (60 px away)
    const r = marchStep(base(STRAIGHT, { progress: 60 / 400, dt: 0.4, speed: 200, blocked }));
    const end = pointAtProgress(STRAIGHT, r.progress);
    expect(r.halted).toBe(true);
    expect(Math.hypot(end.x - enemy.x, end.y - enemy.y)).toBeLessThan(MELEE_RANGE);
    expect(end.x).toBeLessThanOrEqual(enemy.x);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    // first sub-step inside range: previous sub-step point (15 px back) was outside
    expect(end.x - 15).toBeLessThanOrEqual(enemy.x - MELEE_RANGE);
    expect(r.walkedPx).toBeCloseTo(arc(STRAIGHT, 60 / 400, r.progress), 6);
  });

  it('E13: substepPx is honoured (more sub-steps with a smaller substep)', () => {
    let n15 = 0, n5 = 0;
    marchStep(base(STRAIGHT, { dt: 1, blocked: () => { n15++; return false; } }));
    marchStep(base(STRAIGHT, { dt: 1, substepPx: 5, blocked: () => { n5++; return false; } }));
    expect(n5).toBeGreaterThan(n15);
    expect(n15).toBeGreaterThanOrEqual(4);
  });

  it('E14: enemy already in range -> no move, halted', () => {
    const r = marchStep(base(STRAIGHT, { progress: 0.3, blocked: () => true }));
    expect(r).toEqual({ progress: 0.3, arrived: false, halted: true, walkedPx: 0 });
  });

  it('E14b: a blocked that is always false walks straight through', () => {
    const r = marchStep(base(STRAIGHT, { dt: 1, blocked: never }));
    expect(r.halted).toBe(false);
    expect(r.walkedPx).toBeCloseTo(60, 6);
  });
});

describe('contactTest', () => {
  const soldier = { x: 0, y: 0, dead: false };
  const near = { x: 10, y: 0, dead: false, def: {} };
  it('true when a live blockable enemy is within MELEE_RANGE', () => {
    expect(contactTest(soldier, [near])({ x: 0, y: 0 })).toBe(true);
  });
  it('false when the enemy is at or beyond MELEE_RANGE', () => {
    expect(contactTest(soldier, [near])({ x: -MELEE_RANGE + 10, y: 0 })).toBe(false);
  });
  it('E15: flyer vs non-flyer squad -> false', () => {
    const fly = { x: 10, y: 0, dead: false, def: { flying: true } };
    expect(contactTest(soldier, [fly])({ x: 0, y: 0 })).toBe(false);
  });
  it('E16: flyer vs canBlockFlyers squad -> true', () => {
    const fly = { x: 10, y: 0, dead: false, def: { flying: true } };
    expect(contactTest({ ...soldier, canBlockFlyers: true }, [fly])({ x: 0, y: 0 })).toBe(true);
  });
  it('E17: dead enemy ignored', () => {
    expect(contactTest(soldier, [{ ...near, dead: true }])({ x: 0, y: 0 })).toBe(false);
  });
  it('disengaging soldier -> false', () => {
    expect(contactTest({ ...soldier, disengageLeftPx: 30 }, [near])({ x: 0, y: 0 })).toBe(false);
  });
});

describe('isMarching', () => {
  it('true when alive and not at target', () => {
    expect(isMarching({ dead: false, pathProgress: 0.2 }, 0.5)).toBe(true);
  });
  it('false at target or when dead', () => {
    expect(isMarching({ dead: false, pathProgress: 0.5 }, 0.5)).toBe(false);
    expect(isMarching({ dead: true, pathProgress: 0.2 }, 0.5)).toBe(false);
  });
});

describe('routeDots', () => {
  it('first at from, last at to, spacing within 1px (straight)', () => {
    const d = routeDots(STRAIGHT, 0.1, 0.9, 10);
    expect(d[0]).toEqual(pointAtProgress(STRAIGHT, 0.1));
    expect(d[d.length - 1].x).toBeCloseTo(360, 6);
    for (let i = 1; i < d.length; i++) {
      expect(Math.abs(Math.hypot(d[i].x - d[i - 1].x, d[i].y - d[i - 1].y) - 10)).toBeLessThanOrEqual(1);
    }
  });
  it('follows the road around a corner, not the chord', () => {
    const d = routeDots(L, 0.25, 0.75, 10);
    // some dot must sit near the corner (200,0); chord from (100,0) to (200,100) would not
    expect(d.some(p => Math.hypot(p.x - 200, p.y) < 6)).toBe(true);
    // every dot lies on the road (east leg y=0, or south leg x=200)
    expect(d.every(p => Math.abs(p.y) < 1e-6 || Math.abs(p.x - 200) < 1e-6)).toBe(true);
    // arc spacing (not chord) is ~10 px, so ~20 dots for 200 px of road
    expect(d.length).toBeGreaterThanOrEqual(20);
  });
  it('reversed when to < from', () => {
    const d = routeDots(STRAIGHT, 0.9, 0.1, 10);
    expect(d[0].x).toBeCloseTo(360, 6);
    expect(d[d.length - 1].x).toBeCloseTo(40, 6);
    expect(d[1].x).toBeLessThan(d[0].x);
  });
  it('from === to gives one point', () => {
    expect(routeDots(STRAIGHT, 0.4, 0.4, 10)).toHaveLength(1);
  });
});

describe('travelDir', () => {
  it('unit tangent toward a higher target', () => {
    expect(travelDir(L, 0.1, 0.9)).toEqual({ x: 1, y: 0 });
    const d = travelDir(L, 0.8, 0.9);
    expect(d.x).toBeCloseTo(0, 6); expect(d.y).toBeCloseTo(1, 6);
  });
  it('reversed toward a lower target', () => {
    const d = travelDir(STRAIGHT, 0.5, 0.1);
    expect(d.x).toBeCloseTo(-1, 6); expect(d.y).toBeCloseTo(0, 6);
  });
  it('equal -> upstream tangent', () => {
    const d = travelDir(L, 0.8, 0.8);
    expect(d.x).toBeCloseTo(0, 6); expect(d.y).toBeCloseTo(-1, 6);
  });
  it('degenerate path -> {-1, 0}', () => {
    expect(travelDir([{ x: 5, y: 5 }], 0.3, 0.6)).toEqual({ x: -1, y: 0 });
  });
});
