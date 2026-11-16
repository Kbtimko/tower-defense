import { describe, it, expect } from 'vitest';
import { marchStep, contactTest, isEngaged, isMarching, routeDots, travelDir, stepFlagFade } from './soldierMarch.js';
import { MELEE_RANGE } from './soldierCombat.js';
import { pointAtProgress, pathLength } from './pathGeometry.js';

const STRAIGHT = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
// 100 px east then 300 px south: total 400, corner at progress 0.25. Unequal legs
// so a point-index stepper (corner at 0.5) disagrees with arc length.
const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 300 }];
const BENT = [{ x: 0, y: 0 }, { x: 130, y: 47 }, { x: 210, y: 190 }, { x: 333, y: 251 }];
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
    const r = marchStep(base(L, { progress: 80 / 400, dt: 1 }));
    const p = pointAtProgress(L, r.progress);
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(40, 6);
    expect(r.walkedPx).toBeCloseTo(60, 6);
    expect(arc(L, 80 / 400, r.progress)).toBeCloseTo(60, 6);
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

  it('E7: exact landing on the road ends (target 1 and target 0)', () => {
    const end = marchStep(base(STRAIGHT, { progress: 0.99, target: 1 }));
    expect(end.progress).toBe(1);
    expect(end.arrived).toBe(true);
    const start = marchStep(base(STRAIGHT, { progress: 0.01, target: 0 }));
    expect(start.progress).toBe(0);
    expect(start.arrived).toBe(true);
  });

  it('out-of-range target can still arrive at the clamped end', () => {
    const r = marchStep(base(STRAIGHT, { progress: 0.99, target: 5, dt: 10 }));
    expect(r.progress).toBe(1);
    expect(r.arrived).toBe(true);
  });

  it('landing exactly on a blocked target point keeps progress === target (no float drift)', () => {
    const total = pathLength(BENT);
    const target = 0.0055;
    const tp = pointAtProgress(BENT, target);
    const blocked = (pt) => Math.hypot(pt.x - tp.x, pt.y - tp.y) < 1e-6;
    const r = marchStep({ progress: 0, target, dt: 1, speed: 1e4, totalLength: total, substepPx: 15, path: BENT, blocked });
    expect(r.halted).toBe(true);
    expect(r.progress).toBe(target);
    expect(r.arrived).toBe(true);
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

describe('isEngaged', () => {
  const near = { x: 10, y: 0, dead: false, def: {} };
  it('judges contact as if no disengage window were open, without touching the soldier', () => {
    const s = { x: 0, y: 0, dead: false, disengageLeftPx: 30 };
    expect(isEngaged(s, [near])).toBe(true);
    expect(s.disengageLeftPx).toBe(30);
    expect(Object.keys(s)).toEqual(['x', 'y', 'dead', 'disengageLeftPx']);
  });
  it('false out of range, when dead, or against a flyer it cannot block', () => {
    expect(isEngaged({ x: 100, y: 0, dead: false }, [near])).toBe(false);
    expect(isEngaged({ x: 0, y: 0, dead: true }, [near])).toBe(false);
    const fly = { ...near, def: { flying: true } };
    expect(isEngaged({ x: 0, y: 0, dead: false }, [fly])).toBe(false);
    expect(isEngaged({ x: 0, y: 0, dead: false, canBlockFlyers: true }, [fly])).toBe(true);
  });
  it('reads blocking fields through the prototype (a Phaser Container), not just own properties', () => {
    // A copy of own properties would drop canBlockFlyers and miss this flyer.
    class Unit { get canBlockFlyers() { return true; } }
    const u = Object.assign(new Unit(), { x: 0, y: 0, dead: false, disengageLeftPx: 60 });
    expect(isEngaged(u, [{ ...near, def: { flying: true } }])).toBe(true);
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
    const d = routeDots(L, 0.1, 0.9, 10);
    // some dot must sit near the corner (100,0); a chord would cut across it
    expect(d.some(p => Math.hypot(p.x - 100, p.y) < 6)).toBe(true);
    // every dot lies on the road (east leg y=0, or south leg x=100)
    expect(d.every(p => Math.abs(p.y) < 1e-6 || Math.abs(p.x - 100) < 1e-6)).toBe(true);
    // arc spacing (not chord) is ~10 px, so ~32 dots for 320 px of road
    expect(d.length).toBeGreaterThanOrEqual(32);
  });
  it('short route: evenly spaced, first = from, last = to', () => {
    // 25 px at spacing 10 -> round(2.5) = 3 gaps of 25/3 (the +-1 px rule is for routes >= 5 spacings)
    const d = routeDots(STRAIGHT, 0.1, 0.1 + 25 / 400, 10);
    expect(d[0].x).toBeCloseTo(40, 6);
    expect(d[d.length - 1].x).toBeCloseTo(65, 6);
    const gaps = d.slice(1).map((p, i) => Math.hypot(p.x - d[i].x, p.y - d[i].y));
    for (const g of gaps) expect(Math.abs(g - gaps[0])).toBeLessThan(1e-6);
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

  it('matches pointAtProgress for every dot on a long multi-point road, both ways', () => {
    // 300 vertices of uneven length, with a repeated vertex (a zero-length segment).
    const road = [];
    for (let i = 0; i < 300; i++) road.push({ x: i * 7 + (i % 5) * 3, y: 100 + 40 * Math.sin(i / 9) });
    road.splice(150, 0, { ...road[150] });
    const total = pathLength(road);
    for (const [from, to, spacing] of [[0.03, 0.97, 10], [0.97, 0.03, 10], [0, 1, 4], [0.5, 0.2, 13], [0.49, 0.51, 10]]) {
      const d = routeDots(road, from, to, spacing);
      const n = d.length - 1;
      expect(n).toBe(Math.max(1, Math.round((Math.abs(to - from) * total) / spacing)));
      d.forEach((p, i) => {
        const want = pointAtProgress(road, i === n ? to : from + ((to - from) * i) / n);
        expect(Math.abs(p.x - want.x)).toBeLessThan(1e-9);
        expect(Math.abs(p.y - want.y)).toBeLessThan(1e-9);
      });
    }
  });
});

describe('travelDir', () => {
  it('unit tangent toward a higher target', () => {
    expect(travelDir(L, 0.1, 0.9)).toEqual({ x: 1, y: 0 });
    const d = travelDir(L, 0.8, 0.9);
    expect(d.x).toBeCloseTo(0, 6); expect(d.y).toBeCloseTo(1, 6);
  });
  it('road ends: upstream/downstream unit vectors on the L fixture', () => {
    const near = (d, x, y) => { expect(d.x).toBeCloseTo(x, 6); expect(d.y).toBeCloseTo(y, 6); };
    near(travelDir(L, 0, 0), -1, 0);   // upstream of the start = west
    near(travelDir(L, 1, 1), 0, -1);   // upstream of the end = north
    near(travelDir(L, 0, 1), 1, 0);    // start heading downstream = east
    near(travelDir(L, 1, 0), 0, -1);   // end heading upstream = north
    // start of a south-bound road: upstream is north, not the degenerate {-1, 0}
    const SOUTH = [{ x: 5, y: 0 }, { x: 5, y: 100 }];
    near(travelDir(SOUTH, 0, 0), 0, -1);
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

describe('stepFlagFade', () => {
  const opts = (over = {}) => ({ arrived: true, dtMs: 100, fadeMs: 900, reducedMotion: false, ...over });
  const planted = () => ({ progress: 0.4, fadeLeftMs: null });

  it('leaves a flag alone while the squad is still marching', () => {
    const f = planted();
    expect(stepFlagFade(f, opts({ arrived: false }))).toBe(f);
    const fading = { progress: 0.4, fadeLeftMs: 300 };
    expect(stepFlagFade(fading, opts({ arrived: false }))).toBe(fading);
  });

  it('starts the fade at fadeMs on the first arrived frame, without counting that frame', () => {
    expect(stepFlagFade(planted(), opts())).toEqual({ progress: 0.4, fadeLeftMs: 900 });
  });

  it('does not mutate the flag it was given', () => {
    const f = planted();
    stepFlagFade(f, opts());
    expect(f).toEqual({ progress: 0.4, fadeLeftMs: null });
  });

  it('counts down by dtMs after that', () => {
    expect(stepFlagFade({ progress: 0.4, fadeLeftMs: 900 }, opts({ dtMs: 250 }))).toEqual({ progress: 0.4, fadeLeftMs: 650 });
  });

  it('removes the flag once the fade reaches zero or below', () => {
    expect(stepFlagFade({ progress: 0.4, fadeLeftMs: 100 }, opts({ dtMs: 100 }))).toBeNull();
    expect(stepFlagFade({ progress: 0.4, fadeLeftMs: 50 }, opts({ dtMs: 100 }))).toBeNull();
    expect(stepFlagFade({ progress: 0.4, fadeLeftMs: 101 }, opts({ dtMs: 100 }))).toEqual({ progress: 0.4, fadeLeftMs: 1 });
  });

  it('under reduced motion removes the flag on the arrival frame', () => {
    expect(stepFlagFade(planted(), opts({ reducedMotion: true }))).toBeNull();
  });

  it('with fadeMs 0 removes the flag on the arrival frame', () => {
    expect(stepFlagFade(planted(), opts({ fadeMs: 0 }))).toBeNull();
  });
});
