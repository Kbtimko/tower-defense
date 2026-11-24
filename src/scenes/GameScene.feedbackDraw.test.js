vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class { constructor() {} add() {} setDepth() { return this; } } },
  },
}));

import { describe, it, expect } from 'vitest';
import GameScene from './GameScene.js';
import { RETICLE, SELECTION_RING, PAD_GLOW } from '../data/juice.js';
import { PAD_BEACON } from '../data/ambient.js';
import { beaconAlpha } from '../systems/padBeacon.js';

const makeGfx = () => {
  const calls = [];
  const rec = (name) => (...args) => { calls.push([name, ...args]); };
  return {
    calls,
    clear: rec('clear'),
    lineStyle: rec('lineStyle'), strokeCircle: rec('strokeCircle'),
    fillStyle: rec('fillStyle'), fillCircle: rec('fillCircle'), lineBetween: rec('lineBetween'),
  };
};
const ctx = (o = {}) => Object.assign(Object.create(GameScene.prototype), {
  gfx: makeGfx(), _padGlow: makeGfx(), aimMode: false, _aimSlot: null, selectedTower: null, selectedType: null,
  repositionMode: false, _fxTime: 1, _buildCursorX: 100, _buildCursorY: 120,
  game: { registry: { get: () => true } },
  hero: { def: { abilities: { w: {} } } },
  economy: { gold: 0 },
  placementManager: { getZones: () => [], getNearestSlot: () => null },
}, o);

describe('_drawReticle', () => {
  it('draws nothing outside aim mode', () => {
    const c = ctx(); c._drawReticle();
    expect(c.gfx.calls).toEqual([]);
  });
  it('draws a circle at the cursor in the RETICLE colour plus ticks', () => {
    const c = ctx({ aimMode: true, _aimSlot: 'w' }); c._drawReticle();
    expect(c.gfx.calls.find(x => x[0] === 'strokeCircle').slice(1, 3)).toEqual([100, 120]);
    expect(c.gfx.calls.find(x => x[0] === 'lineStyle')[2]).toBe(RETICLE.color);
    expect(c.gfx.calls.filter(x => x[0] === 'lineBetween').length).toBe(4);
  });
  it('uses the ability radius when the def has one', () => {
    const c = ctx({ aimMode: true, _aimSlot: 'w', hero: { def: { abilities: { w: { radius: 33 } } } } });
    c._drawReticle();
    expect(c.gfx.calls.find(x => x[0] === 'strokeCircle')[3]).toBe(33);
  });
  it('does not spin under reduced motion', () => {
    const at = (t) => { const c = ctx({ aimMode: true, _aimSlot: 'w', _fxTime: t, game: { registry: { get: () => false } } }); c._drawReticle(); return c.gfx.calls.filter(x => x[0] === 'lineBetween'); };
    expect(at(0)).toEqual(at(2));
  });
});

describe('_drawSelectionRing', () => {
  it('draws nothing without a selected tower', () => {
    const c = ctx(); c._drawSelectionRing();
    expect(c.gfx.calls).toEqual([]);
  });
  it('draws a ring at the tower in SELECTION_RING colour', () => {
    const c = ctx({ selectedTower: { x: 50, y: 60 } }); c._drawSelectionRing();
    expect(c.gfx.calls.find(x => x[0] === 'lineStyle')[2]).toBe(SELECTION_RING.color);
    expect(c.gfx.calls.find(x => x[0] === 'strokeCircle').slice(1, 3)).toEqual([50, 60]);
  });
});

describe('_drawZones pad glow', () => {
  const zones = [{ occupied: false, cx: 1, cy: 2, radius: 10 }, { occupied: true, cx: 5, cy: 5, radius: 10 },
                 { occupied: false, cx: 3, cy: 4, radius: 10 }];
  const glowFills = (c) => c._padGlow.calls.filter(x => x[0] === 'fillStyle' && x[1] === PAD_GLOW.color);
  it('glows empty pads only when not building, on its own Graphics (not gfx)', () => {
    const c = ctx({ placementManager: { getZones: () => zones, getNearestSlot: () => null } });
    c._drawZones();
    const fills = glowFills(c);
    expect(fills.length).toBe(2);
    expect(c.gfx.calls.some(x => x[0] === 'fillStyle' && x[1] === PAD_GLOW.color)).toBe(false);
    const [lo, hi] = PAD_GLOW.alpha;
    for (const f of fills) { expect(f[2]).toBeGreaterThanOrEqual(lo); expect(f[2]).toBeLessThanOrEqual(hi); }
    expect(fills[0][2]).not.toBeCloseTo(fills[1][2]); // per-slot phase desyncs pads
  });
  it('clears the glow layer every frame, including in build mode', () => {
    const c = ctx({ selectedType: 'archer', economy: { gold: 99999 }, placementManager: { getZones: () => zones, getNearestSlot: () => null } });
    c._drawZones();
    expect(c._padGlow.calls[0]).toEqual(['clear']);
    expect(glowFills(c).length).toBe(0);
  });
  it('is static under reduced motion', () => {
    const run = (t) => { const c = ctx({ _fxTime: t, game: { registry: { get: () => false } }, placementManager: { getZones: () => zones, getNearestSlot: () => null } }); c._drawZones(); return c._padGlow.calls; };
    const calls = run(0);
    expect(calls.some(x => x[0] === 'fillStyle' && x[1] === PAD_GLOW.color && x[2] === PAD_GLOW.staticAlpha)).toBe(true);
    expect(calls).toEqual(run(1.3));
  });
  it('leaves build-mode drawing unchanged (no glow, same colours)', () => {
    const c = ctx({ selectedType: 'archer', economy: { gold: 99999 }, placementManager: { getZones: () => zones, getNearestSlot: () => null } });
    c._drawZones();
    expect(c.gfx.calls.some(x => x[0] === 'fillStyle' && x[1] === PAD_GLOW.color)).toBe(false);
    expect(c.gfx.calls[0]).toEqual(['lineStyle', 2, 0xffd700, 1]);
  });
});

describe('_drawZones pad beacon', () => {
  const zones = [{ occupied: false, cx: 10, cy: 20, radius: 22 }, { occupied: true, cx: 5, cy: 5, radius: 22 },
                 { occupied: false, cx: 30, cy: 40, radius: 22 }];
  const reduced = { game: { registry: { get: () => false } } };
  const run = (o) => { const c = ctx({ placementManager: { getZones: () => zones, getNearestSlot: () => null }, ...o }); c._drawZones(); return c; };
  const { halo, outline } = PAD_BEACON;
  const cx0 = 10 + PAD_BEACON.offset.x, cy0 = 20 + PAD_BEACON.offset.y;
  const cx2 = 30 + PAD_BEACON.offset.x, cy2 = 40 + PAD_BEACON.offset.y;
  // Pair each fillCircle with the fillStyle that preceded it.
  const draws = (c) => {
    const out = []; let style = null;
    for (const x of c._padGlow.calls) {
      if (x[0] === 'fillStyle') style = x;
      else if (x[0] === 'fillCircle') out.push({ x: x[1], y: x[2], r: x[3], color: style[1], alpha: style[2] });
    }
    return out;
  };
  const at = (c, cx, cy) => draws(c).filter(d => d.x === cx && d.y === cy);
  const core = (c, cx, cy) => at(c, cx, cy).find(d => d.r === PAD_BEACON.radius);

  it('draws halo, socket, core at the offset on empty pads only, on _padGlow', () => {
    const c = run();
    expect(at(c, cx0, cy0).map(d => d.r)).toEqual([halo.radius, PAD_BEACON.radius + outline.width, PAD_BEACON.radius]);
    expect(at(c, cx2, cy2).map(d => d.r)).toEqual([halo.radius, PAD_BEACON.radius + outline.width, PAD_BEACON.radius]);
    expect(draws(c).filter(d => d.r === PAD_BEACON.radius)).toHaveLength(2);
    expect(c.gfx.calls.some(x => x[0] === 'fillStyle' && x[1] === PAD_BEACON.color)).toBe(false);
  });
  it('draws the dark socket in outline.color, opaque, before the core', () => {
    const [, socket, c0] = at(run(), cx0, cy0);
    expect(socket.color).toBe(outline.color);
    expect(socket.alpha).toBe(1);
    expect(c0.color).toBe(PAD_BEACON.color);
  });
  it('core alpha follows beaconAlpha by zone index (not empty-pad index)', () => {
    // t=0.7: zone 2 is mid-window (peak), zone 0 and "empty index 1" are at the floor.
    const c = run({ _fxTime: 0.7 });
    expect(core(c, cx0, cy0).alpha).toBeCloseTo(beaconAlpha(0.7, 0, PAD_BEACON));
    expect(core(c, cx2, cy2).alpha).toBeCloseTo(beaconAlpha(0.7, 2, PAD_BEACON));
    expect(core(c, cx2, cy2).alpha).toBeCloseTo(PAD_BEACON.alpha[1]);
    expect(core(c, cx0, cy0).alpha).toBeCloseTo(PAD_BEACON.alpha[0]);
    expect(core(c, cx2, cy2).alpha).not.toBeCloseTo(beaconAlpha(0.7, 1, PAD_BEACON));
  });
  it('halo is invisible off-window and at halo.alpha at peak', () => {
    const haloOf = (c, cx, cy) => at(c, cx, cy)[0];
    const c = run({ _fxTime: 0.7 });
    expect(haloOf(c, cx0, cy0).color).toBe(PAD_BEACON.color);
    expect(haloOf(c, cx0, cy0).alpha).toBe(0);
    expect(haloOf(c, cx2, cy2).alpha).toBeCloseTo(halo.alpha);
  });
  it('is steady at staticAlpha (core) and halo.staticAlpha under reduced motion', () => {
    const f = (t) => { const c = run({ _fxTime: t, ...reduced }); return [at(c, cx0, cy0).map(d => d.alpha), at(c, cx2, cy2).map(d => d.alpha)]; };
    expect(f(0.1)).toEqual([[halo.staticAlpha, 1, PAD_BEACON.staticAlpha], [halo.staticAlpha, 1, PAD_BEACON.staticAlpha]]);
    expect(f(0.7)).toEqual(f(0.1));
    expect(f(1.3)).toEqual(f(0.1));
  });
  it('draws no beacon in build mode', () => {
    const c = run({ selectedType: 'archer', economy: { gold: 99999 } });
    expect(draws(c).filter(d => d.r === PAD_BEACON.radius)).toEqual([]);
  });
});
