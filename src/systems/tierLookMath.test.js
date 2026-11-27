import { describe, it, expect } from 'vitest';
import {
  expectedTowerLook, pivotOffsetY, corePulse, emberPose, ringBreath, ellipseDashes,
} from './tierLookMath.js';
import { TIER_SCALE, TIER_CORE, TIER_EMBERS, TIER_RING } from '../data/tierLooks.js';

const ground = { footY: 20, width: 40, height: 50 };

describe('expectedTowerLook', () => {
  it.each([
    [1, null, { scale: 1, core: false, embers: 0, ring: null, pips: 1 }],
    [2, null, { scale: 1.12, core: true, embers: 0, ring: null, pips: 2 }],
    [3, null, { scale: 1.25, core: true, embers: 3, ring: null, pips: 3 }],
    [4, 'A', { scale: 1.4, core: true, embers: 3, ring: 'solid', pips: 'A' }],
    [4, 'B', { scale: 1.4, core: true, embers: 3, ring: 'dashed', pips: 'B' }],
  ])('level %s branch %s', (level, branch, want) => {
    expect(expectedTowerLook(level, branch)).toEqual(want);
  });
  it.each([
    [1, null, { scale: 1, core: false, embers: 0, ring: null, pips: 1 }],
    [2, null, { scale: 1.12, core: false, embers: 0, ring: null, pips: 2 }],
    [3, null, { scale: 1.25, core: false, embers: 3, ring: null, pips: 3 }],
    [4, 'A', { scale: 1.4, core: false, embers: 3, ring: 'solid', pips: 'A' }],
    [4, 'B', { scale: 1.4, core: false, embers: 3, ring: 'dashed', pips: 'B' }],
  ])('with art: level %s branch %s has no core, rest unchanged', (level, branch, want) => {
    expect(expectedTowerLook(level, branch, { art: true })).toEqual(want);
  });
  it('level 4 with no branch equals the T3 row', () => {
    expect(expectedTowerLook(4, null)).toEqual(expectedTowerLook(3, null));
  });
  it('reads scale from the table', () => {
    expect(expectedTowerLook(3, null).scale).toBe(TIER_SCALE.tower.t3);
  });
});

describe('pivotOffsetY', () => {
  it('keeps the foot planted', () => {
    expect(pivotOffsetY(41.2, 1.4)).toBeCloseTo(-16.48, 5);
    expect(pivotOffsetY(41.2, 1)).toBeCloseTo(0, 10);
  });
});

describe('corePulse', () => {
  it('stays within the alpha band and starts at rest', () => {
    const [lo, hi] = TIER_CORE.alpha;
    expect(corePulse(0, TIER_CORE, false)).toBeCloseTo(lo, 10);
    expect(corePulse(TIER_CORE.periodS / 2, TIER_CORE, false)).toBeCloseTo(hi, 10);
    for (let t = 0; t < 3; t += 0.05) {
      const a = corePulse(t, TIER_CORE, false);
      expect(a).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(a).toBeLessThanOrEqual(hi + 1e-9);
    }
  });
  it('is still when reduced', () => {
    expect(corePulse(0.37, TIER_CORE, true)).toBe(TIER_CORE.stillAlpha);
  });
});

describe('emberPose', () => {
  const P = TIER_EMBERS.periodS;
  it('is periodic', () => {
    const a = emberPose(0.4, 1, TIER_EMBERS, ground, false);
    const b = emberPose(0.4 + P, 1, TIER_EMBERS, ground, false);
    expect(b.dy).toBeCloseTo(a.dy, 8);
    expect(b.alpha).toBeCloseTo(a.alpha, 8);
  });
  it('staggers embers by 1/count of a period', () => {
    const a = emberPose(0.2, 1, TIER_EMBERS, ground, false);
    const b = emberPose(0.2 + P / 3, 0, TIER_EMBERS, ground, false);
    expect(a.dy).toBeCloseTo(b.dy, 8);
    expect(emberPose(0.2, 0, TIER_EMBERS, ground, false).dy).not.toBeCloseTo(a.dy, 3);
  });
  it('is invisible at phase 0 and 1 and continuous across the seam', () => {
    expect(emberPose(0, 0, TIER_EMBERS, ground, false).alpha).toBe(0);
    const eps = 1e-4;
    const early = emberPose(eps, 0, TIER_EMBERS, ground, false).alpha;
    const late = emberPose(P - eps, 0, TIER_EMBERS, ground, false).alpha;
    expect(Math.abs(early - late)).toBeLessThan(0.05);
  });
  it('peaks at fadeInFrac and starts above the foot', () => {
    const peak = emberPose(TIER_EMBERS.fadeInFrac * P, 0, TIER_EMBERS, ground, false);
    expect(peak.alpha).toBeCloseTo(1, 8);
    const start = emberPose(0, 0, TIER_EMBERS, ground, false);
    expect(start.dy).toBeCloseTo(ground.footY - TIER_EMBERS.startFrac * ground.height, 8);
    expect(start.dx).toBeCloseTo(TIER_EMBERS.xFrac[0] * ground.width, 8);
  });
  it('rises with ease-out and ends riseFrac higher', () => {
    const mid = emberPose(0.5 * P, 0, TIER_EMBERS, ground, false);
    const top = emberPose(P - 1e-9, 0, TIER_EMBERS, ground, false);
    const base = ground.footY - TIER_EMBERS.startFrac * ground.height;
    expect(base - top.dy).toBeCloseTo(TIER_EMBERS.riseFrac * ground.height, 3);
    expect(base - mid.dy).toBeGreaterThan(0.5 * TIER_EMBERS.riseFrac * ground.height);
  });
  it('holds a still pose when reduced, whatever t is', () => {
    const a = emberPose(0, 2, TIER_EMBERS, ground, true);
    const b = emberPose(9.9, 2, TIER_EMBERS, ground, true);
    expect(a).toEqual(b);
    expect(a.alpha).toBe(TIER_EMBERS.stillAlpha);
    const p = TIER_EMBERS.stillRiseFrac;
    const eased = 1 - (1 - p) * (1 - p);
    expect(a.dy).toBeCloseTo(
      ground.footY - TIER_EMBERS.startFrac * ground.height - eased * TIER_EMBERS.riseFrac * ground.height, 8);
  });
  // #69(d): each division sits behind the branch that keeps its divisor non-zero.
  it('stays finite and in [0, 1] at fadeInFrac 0 and 1', () => {
    for (const fadeInFrac of [0, 1]) {
      const cfg = { ...TIER_EMBERS, fadeInFrac };
      for (let k = 0; k <= 1000; k++) {
        for (let i = 0; i < cfg.count; i++) {
          const { alpha } = emberPose((k / 1000) * P * (1 - 1e-9), i, cfg, ground, false);
          expect(Number.isFinite(alpha)).toBe(true);
          expect(alpha).toBeGreaterThanOrEqual(0);
          expect(alpha).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(emberPose(0, 0, { ...TIER_EMBERS, fadeInFrac: 0 }, ground, false).alpha).toBe(1);
    expect(emberPose(0, 0, { ...TIER_EMBERS, fadeInFrac: 1 }, ground, false).alpha).toBe(0);
  });
});

describe('ringBreath', () => {
  it('is rest-state when reduced', () => {
    expect(ringBreath(0.9, TIER_RING, true)).toEqual({ k: 1, alpha: TIER_RING.alpha });
  });
  it('breathes between rest and the scale, alpha in step', () => {
    const { periodS, scale, alphaLow } = TIER_RING.breathe;
    const rest = ringBreath(0, TIER_RING, false);
    expect(rest.k).toBeCloseTo(1, 10);
    expect(rest.alpha).toBeCloseTo(TIER_RING.alpha, 10);
    const peak = ringBreath(periodS / 2, TIER_RING, false);
    expect(peak.k).toBeCloseTo(scale, 10);
    expect(peak.alpha).toBeCloseTo(alphaLow, 10);
    for (let t = 0; t < 3; t += 0.05) {
      const { k } = ringBreath(t, TIER_RING, false);
      expect(k).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(k).toBeLessThanOrEqual(scale + 1e-9);
    }
  });
});

describe('ellipseDashes', () => {
  const base = { rx: TIER_RING.rx, ry: TIER_RING.ry, dashes: 12, duty: 0.55, phase: 0 };
  it('returns dashes arcs of segPerDash+1 points on the ellipse', () => {
    const d = ellipseDashes(base);
    expect(d).toHaveLength(12);
    for (const arc of d) {
      expect(arc).toHaveLength(5);
      for (const { x, y } of arc) {
        expect((x / base.rx) ** 2 + (y / base.ry) ** 2).toBeCloseTo(1, 8);
      }
    }
  });
  it('honours segPerDash and the centre', () => {
    const d = ellipseDashes({ ...base, segPerDash: 2, cx: 10, cy: -5 });
    expect(d[0]).toHaveLength(3);
    expect(d[0][0].x).toBeCloseTo(10 + base.rx, 8);
    expect(d[0][0].y).toBeCloseTo(-5, 8);
  });
  it('wraps: phase p and p+1 are identical', () => {
    expect(ellipseDashes({ ...base, phase: 1 })).toEqual(ellipseDashes({ ...base, phase: 0 }));
    expect(ellipseDashes({ ...base, phase: 1.25 })).toEqual(ellipseDashes({ ...base, phase: 0.25 }));
  });
  it('phase shifts the start angle by a fraction of a dash slot', () => {
    const p = ellipseDashes({ ...base, phase: 0.5 / 12 });
    const first = p[0][0];
    const ang = Math.atan2(first.y / base.ry, first.x / base.rx);
    expect(ang).toBeCloseTo((2 * Math.PI * 0.5) / 12, 8);
  });
  it('phase 1/dashes advances the pattern by one slot', () => {
    const a = ellipseDashes({ ...base, phase: 1 / 12 });
    const b = ellipseDashes(base);
    for (let j = 0; j < 11; j++) {
      expect(a[j][0].x).toBeCloseTo(b[j + 1][0].x, 8);
      expect(a[j][0].y).toBeCloseTo(b[j + 1][0].y, 8);
    }
  });
  it('each dash spans duty/dashes of a turn', () => {
    const arc = ellipseDashes(base)[0];
    const last = arc[arc.length - 1];
    expect(Math.atan2(last.y / base.ry, last.x / base.rx)).toBeCloseTo(2 * Math.PI * 0.55 / 12, 8);
  });
});
