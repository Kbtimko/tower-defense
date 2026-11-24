import { describe, it, expect } from 'vitest';
import {
  T4_EFFECT_KEYS,
  isBossType,
  shotTargets,
  clusterPoints,
  resolveHit,
} from './towerShot.js';

const en = (x, y, wp = 0, type = 'drone', extra = {}) => ({
  x, y, waypointIndex: wp, dead: false, def: { type }, ...extra,
});
const isSlowed = (e) => !!e.slowed;
const isBoss = (e) => isBossType(e.def.type);
const proj = (o = {}) => ({
  target: null, targetX: 0, targetY: 0, damage: 100, splashRadius: 0,
  slowFactor: 0, slowDuration: 0, chain: null, cluster: null,
  slowedMult: 1, bossStun: 0, ...o,
});
const hit = (p, enemies) => resolveHit(p, enemies, { isSlowed, isBoss });

describe('T4_EFFECT_KEYS', () => {
  it('lists the five effect keys', () => {
    expect(T4_EFFECT_KEYS).toEqual(['shots', 'chain', 'cluster', 'slowedMult', 'bossStun']);
  });
});

describe('isBossType', () => {
  it('titan is a boss; drone and colossus are not', () => {
    expect(isBossType('titan')).toBe(true);
    expect(isBossType('drone')).toBe(false);
    expect(isBossType('colossus')).toBe(false);
  });
});

describe('shotTargets', () => {
  const p = en(0, 0, 1);
  it('one shot is just the primary', () => {
    expect(shotTargets(1, p, [p, en(1, 1, 9)])).toEqual([p]);
  });
  it('pads with primary when alone', () => {
    expect(shotTargets(2, p, [p])).toEqual([p, p]);
    expect(shotTargets(2, p, [])).toEqual([p, p]);
  });
  it('prefers furthest-along non-primary', () => {
    const a = en(0, 0, 3), b = en(0, 0, 7);
    const r = shotTargets(2, p, [a, p, b]);
    expect(r[0]).toBe(p);
    expect(r[1]).toBe(b);
    expect(r).toHaveLength(2);
  });
  it('ties keep array order', () => {
    const a = en(0, 0, 5), b = en(0, 0, 5);
    expect(shotTargets(3, p, [a, b])).toEqual([p, a, b]);
  });
});

describe('resolveHit single target', () => {
  it('returns one plain record', () => {
    const t = en(0, 0);
    const r = hit(proj({ target: t }), [t]);
    expect(r).toEqual([{ enemy: t, amount: 100, isAoe: false, hitMult: 1, slow: null, stun: null, chainFrom: null }]);
  });
  it('dead target fizzles, even with chain', () => {
    const t = en(0, 0, 0, 'drone', { dead: true });
    const n = en(10, 0);
    const r = hit(proj({ target: t, chain: { targets: 3, jumpRadius: 70, falloff: 0.75 } }), [t, n]);
    expect(r).toEqual([]);
  });
});

describe('resolveHit splash', () => {
  it('inclusive radius, skips dead', () => {
    const a = en(50, 0), b = en(49, 0), c = en(51, 0), d = en(10, 0, 0, 'drone', { dead: true });
    const r = hit(proj({ splashRadius: 50, targetX: 0, targetY: 0 }), [a, b, c, d]);
    expect(r.map((h) => h.enemy)).toEqual([a, b]);
    expect(r.every((h) => h.isAoe && h.amount === 100)).toBe(true);
  });
  it('splash + slow tags every record', () => {
    const a = en(0, 0), b = en(10, 0);
    const r = hit(proj({ splashRadius: 50, slowFactor: 0.7, slowDuration: 2 }), [a, b]);
    expect(r).toHaveLength(2);
    r.forEach((h) => expect(h.slow).toEqual({ duration: 2, factor: 0.7 }));
  });
});

describe('resolveHit chain', () => {
  const chain = { targets: 3, jumpRadius: 70, falloff: 0.75 };
  it('falloff amounts and chainFrom links', () => {
    const t = en(0, 0), a = en(50, 0), b = en(100, 0), c = en(150, 0);
    const r = hit(proj({ target: t, damage: 120, chain }), [t, a, b, c]);
    expect(r.map((h) => h.amount)).toEqual([120, 90, 67.5]);
    expect(r[0].chainFrom).toBeNull();
    expect(r[1].chainFrom).toBe(t);
    expect(r[2].chainFrom).toBe(a);
    expect(r.every((h) => h.isAoe === false)).toBe(true);
  });
  it('jump radius is inclusive', () => {
    const t = en(0, 0), n70 = en(70, 0);
    expect(hit(proj({ target: t, chain }), [t, n70])).toHaveLength(2);
    const n71 = en(71, 0);
    expect(hit(proj({ target: t, chain }), [t, n71])).toHaveLength(1);
  });
  it('never repeats an enemy', () => {
    const t = en(0, 0), a = en(10, 0);
    const r = hit(proj({ target: t, chain }), [t, a]);
    expect(r.map((h) => h.enemy)).toEqual([t, a]);
  });
  it('no neighbours gives one record', () => {
    const t = en(0, 0);
    expect(hit(proj({ target: t, chain }), [t])).toHaveLength(1);
  });
  it('nearest wins over array-earlier farther', () => {
    const t = en(0, 0), far = en(60, 0), near = en(20, 0);
    const r = hit(proj({ target: t, chain: { ...chain, targets: 2 } }), [t, far, near]);
    expect(r[1].enemy).toBe(near);
  });
  it('skips dead candidates', () => {
    const t = en(0, 0), d = en(5, 0, 0, 'drone', { dead: true }), a = en(30, 0);
    expect(hit(proj({ target: t, chain: { ...chain, targets: 2 } }), [t, d, a])[1].enemy).toBe(a);
  });
  it('is skipped on splash shots', () => {
    const t = en(0, 0), a = en(30, 0);
    const r = hit(proj({ target: t, splashRadius: 5, chain }), [t, a]);
    expect(r).toHaveLength(1);
  });
});

describe('clusterPoints', () => {
  it('spreads shells evenly from angle 0', () => {
    const pts = clusterPoints({ targetX: 0, targetY: 0, cluster: { shells: 3, spread: 40 } });
    expect(pts).toHaveLength(3);
    [0, 120, 240].forEach((deg, i) => {
      const rad = (deg * Math.PI) / 180;
      expect(pts[i].x).toBeCloseTo(40 * Math.cos(rad), 9);
      expect(pts[i].y).toBeCloseTo(40 * Math.sin(rad), 9);
    });
  });
});

describe('resolveHit cluster', () => {
  const cluster = { shells: 3, spread: 40, radius: 35, damageFrac: 0.4 };
  it('adds bomblet records on top of the main splash', () => {
    const e = en(140, 100);
    const r = hit(proj({ targetX: 100, targetY: 100, damage: 150, splashRadius: 50, cluster }), [e]);
    expect(r.map((h) => h.amount)).toEqual([150, 60]);
    expect(r.every((h) => h.isAoe)).toBe(true);
  });
  it('no enemies gives []', () => {
    expect(hit(proj({ targetX: 100, targetY: 100, splashRadius: 50, cluster }), [])).toEqual([]);
  });
});

describe('resolveHit shatter and stun', () => {
  it('slowedMult applies only to slowed enemies', () => {
    const s = en(0, 0, 0, 'drone', { slowed: true }), u = en(1, 0);
    const r = hit(proj({ splashRadius: 50, slowedMult: 2 }), [s, u]);
    expect(r.find((h) => h.enemy === s).hitMult).toBe(2);
    expect(r.find((h) => h.enemy === u).hitMult).toBe(1);
  });
  it('slowedMult 1 is always 1', () => {
    const s = en(0, 0, 0, 'drone', { slowed: true });
    expect(hit(proj({ target: s, slowedMult: 1 }), [s])[0].hitMult).toBe(1);
  });
  it('bossStun hits bosses only', () => {
    const t = en(0, 0, 0, 'titan'), d = en(1, 0);
    const r = hit(proj({ splashRadius: 50, bossStun: 1 }), [t, d]);
    expect(r.find((h) => h.enemy === t).stun).toEqual({ duration: 1 });
    expect(r.find((h) => h.enemy === d).stun).toBeNull();
  });
});

describe('purity', () => {
  it('does not mutate inputs', () => {
    const t = en(0, 0), a = en(30, 0, 0, 'drone', { slowed: true });
    const p = proj({ target: t, chain: { targets: 3, jumpRadius: 70, falloff: 0.75 },
      cluster: { shells: 3, spread: 40, radius: 35, damageFrac: 0.4 }, slowedMult: 2, bossStun: 1 });
    const before = structuredClone([p, [t, a]].map((x) => JSON.parse(JSON.stringify(x))));
    hit(p, [t, a]);
    expect(JSON.parse(JSON.stringify([p, [t, a]]))).toEqual(before);
  });
});
