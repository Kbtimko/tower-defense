import { describe, it, expect } from 'vitest';
import { raelOvercharge, raelAirstrike, raelEmp } from './heroAbilities.js';

const makeHero = (overrides = {}) => ({
  dead: false,
  overchargeActive: false,
  overchargeRemaining: 0,
  ...overrides,
});

describe('raelOvercharge', () => {
  it('sets active + remaining = 6 and returns kind:overcharge', () => {
    const h = makeHero();
    const r = raelOvercharge(h, {});
    expect(r).toEqual({ kind: 'overcharge' });
    expect(h.overchargeActive).toBe(true);
    expect(h.overchargeRemaining).toBe(6);
  });

  it('returns null when hero is dead', () => {
    const h = makeHero({ dead: true });
    expect(raelOvercharge(h, {})).toBeNull();
  });
});

describe('raelAirstrike', () => {
  it('returns hit zone with radius:70, damage:80, at clicked point', () => {
    const r = raelAirstrike(makeHero(), {}, { x: 100, y: 200 });
    expect(r).toEqual({ kind:'airstrike', x:100, y:200, radius:70, damage:80 });
  });

  it('returns null when hero is dead', () => {
    expect(raelAirstrike(makeHero({ dead: true }), {}, { x:0, y:0 })).toBeNull();
  });
});

describe('raelEmp', () => {
  it('returns kind:emp', () => {
    expect(raelEmp(makeHero(), {})).toEqual({ kind: 'emp' });
  });

  it('returns null when hero is dead', () => {
    expect(raelEmp(makeHero({ dead: true }), {})).toBeNull();
  });
});
