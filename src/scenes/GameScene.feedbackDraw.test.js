vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class { constructor() {} add() {} setDepth() { return this; } } },
  },
}));

import { describe, it, expect } from 'vitest';
import GameScene from './GameScene.js';
import { RETICLE, SELECTION_RING, PAD_GLOW } from '../data/juice.js';

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
