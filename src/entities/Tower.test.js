import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        addAt() {}
        setDepth() { return this; }
        destroy() {}
      },
    },
  },
}));

// The real tower entries are registered in a later task. Mock the manifest so
// this test exercises the sprite-active path today and stays stable afterwards.
vi.mock('../data/sprites.js', () => ({
  SPRITE_MANIFEST: [],
  getSpriteConfig: (category, type) =>
    category === 'tower' && type === 'archer'
      ? {
          scale: 0.6, anchor: { x: 0.5, y: 0.5 }, baseFacing: 'right',
          ground: { footY: 41.2, width: 37.1 },
          states: {
            idle:   { path: 'x_idle.png',   frameWidth: 64, frameHeight: 64, frames: 1 },
            attack: { path: 'x_attack.png', frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
          },
        }
      : null,
}));

import { TOWER_DEFS } from '../data/towers.js';
import { Tower } from './Tower.js';
import { BUILD_POP, UPGRADE_POP } from '../data/juice.js';
import { popScale } from '../systems/juiceMath.js';
import { TIER_FALLBACK_GROUND } from '../data/tierLooks.js';

// Records the calls a Graphics object receives so the test can assert on what
// was drawn rather than on pixels.
const makeGraphics = () => {
  const calls = [];
  const g = {
    _calls: calls,
    visible: true,
    setVisible(v) { g.visible = v; return g; },
  };
  for (const m of ['clear', 'fillStyle', 'fillCircle', 'fillRect',
                   'lineStyle', 'strokeCircle', 'strokeRect',
                   'fillRoundedRect', 'strokeRoundedRect']) {
    g[m] = (...args) => { calls.push([m, ...args]); return g; };
  }
  return g;
};

// Chainable stub; records position, size and alpha so marks can be read back.
const makeImage = () => ({
  x: 0, y: 0, alpha: 1, visible: true,
  setTint() { return this; }, setBlendMode() { return this; },
  setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; },
  setPosition(x, y) { this.x = x; this.y = y; return this; },
  setAlpha(a) { this.alpha = a; return this; },
  setVisible(v) { this.visible = v; return this; },
  destroy() {},
});

const makeText = () => ({
  visible: true,
  setOrigin() { return this; }, setText() { return this; },
  setPosition() { return this; },
  setVisible(v) { this.visible = v; return this; },
  destroy() {},
});

// EntitySprite writes `sprite.y` directly for the foot pivot and the scale
// through setScale, so both are recorded for the assertions below.
const makeSprite = () => ({
  y: 0, scaleX: 1, scaleY: 1,
  setOrigin() { return this; },
  setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; },
  setFlipX() { return this; }, setTexture() {}, play() {}, on() {}, once() {},
  destroy() {},
});

const makeScene = (spriteKeys = []) => ({
  add: {
    graphics: () => makeGraphics(),
    text: () => makeText(),
    image: () => makeImage(),
    sprite: () => makeSprite(),
    existing() {},
  },
  anims: { exists: () => false, create() {}, generateFrameNumbers: () => [] },
  textures: { exists: () => true },
  game: { registry: { get: () => spriteKeys } },
});

// `_redraw` runs once in the constructor BEFORE `_sprite` exists (so it fills),
// then again after. `clear()` does not erase the recorded call log, so assert
// only on what was drawn after the last clear.
const sinceLastClear = g => g._calls.slice(g._calls.map(c => c[0]).lastIndexOf('clear'));
const strokeWidths = g => sinceLastClear(g).filter(c => c[0] === 'lineStyle').map(c => c[1]);

// `def` is required: the constructor reads def.damage/range/fireRate directly.
const makeTower = (scene, x = 0, y = 0) =>
  new Tower(scene, { type: 'archer', x, y, def: TOWER_DEFS.archer, zoneIndex: 0 });

describe('Tower tier ring with sprite art active', () => {
  const ARCHER_KEYS = ['sprite-tower-archer-idle', 'sprite-tower-archer-attack'];

  it('keeps the tier ring visible and drops the dark fill disc', () => {
    const t = makeTower(makeScene(ARCHER_KEYS));
    expect(t._sprite.active).toBe(true);
    expect(t._bg.visible).toBe(true);
    expect(sinceLastClear(t._bg).some(c => c[0] === 'fillCircle')).toBe(false);
    expect(sinceLastClear(t._bg).some(c => c[0] === 'strokeCircle')).toBe(true);
    expect(t._icon.visible).toBe(false);
  });

  it('thickens the tier ring as the tower upgrades', () => {
    const t = makeTower(makeScene(ARCHER_KEYS));
    expect(strokeWidths(t._bg)).toContain(1.5);   // tier 1
    t.upgrade(3);
    expect(strokeWidths(t._bg)).toContain(3);     // tier 3
  });

  it('still fills the disc when there is no sprite art (Graphics fallback)', () => {
    const t = makeTower(makeScene([]));
    expect(t._sprite.active).toBe(false);
    expect(sinceLastClear(t._bg).some(c => c[0] === 'fillCircle')).toBe(true);
    expect(t._icon.visible).toBe(true);
  });
});

describe('Tower build/upgrade pop', () => {
  const popTower = () => {
    const t = makeTower(makeScene(['sprite-tower-archer-idle', 'sprite-tower-archer-attack']));
    t._sprite.setSquash = vi.fn();
    return t;
  };

  it('is idle until startPop: updatePop leaves the sprite alone', () => {
    const t = popTower();
    t.updatePop(0.1);
    expect(t._sprite.setSquash).not.toHaveBeenCalled();
  });

  it('scales uniformly toward the build peak, then restores exactly to 1', () => {
    const t = popTower();
    t.startPop(BUILD_POP);
    t.updatePop(BUILD_POP.duration * 0.3);
    const [x, y] = t._sprite.setSquash.mock.calls.at(-1);
    expect(x).toBe(y);
    expect(x).toBeCloseTo(BUILD_POP.peak, 5);
    t.updatePop(BUILD_POP.duration);
    expect(t._sprite.setSquash).toHaveBeenLastCalledWith(1, 1);
    const n = t._sprite.setSquash.mock.calls.length;
    t.updatePop(0.1);
    expect(t._sprite.setSquash.mock.calls.length).toBe(n); // finished: no more writes
  });

  it('upgrade pop uses the upgrade peak', () => {
    const t = popTower();
    t.startPop(UPGRADE_POP);
    t.updatePop(UPGRADE_POP.duration * 0.3);
    expect(t._sprite.setSquash.mock.calls.at(-1)[0]).toBeCloseTo(UPGRADE_POP.peak, 5);
  });

  it('restarting mid-pop begins from the start', () => {
    const t = popTower();
    t.startPop(BUILD_POP);
    t.updatePop(BUILD_POP.duration * 0.9);
    t.startPop(UPGRADE_POP);
    t.updatePop(UPGRADE_POP.duration * 0.3);
    expect(t._sprite.setSquash.mock.calls.at(-1)[0]).toBeCloseTo(UPGRADE_POP.peak, 5);
  });

  it('is safe with no sprite art (fallback disc)', () => {
    const t = makeTower(makeScene([]));
    t.startPop(BUILD_POP);
    expect(() => t.updatePop(0.1)).not.toThrow();
  });
});

describe('Tower tier look (#49)', () => {
  const ARCHER_KEYS = ['sprite-tower-archer-idle', 'sprite-tower-archer-attack'];
  const FOOT_Y = 41.2; // the mocked manifest's ground.footY
  const artTower = () => makeTower(makeScene(ARCHER_KEYS), 100, 200);

  it('a T1 tower is built with its tier pips and no tier scale', () => {
    const t = artTower();
    expect(t._sprite.sprite.scaleX).toBeCloseTo(0.6, 9);
    expect(t.lookSnapshot()).toMatchObject({ type: 'archer', level: 1, branch: null, pips: 1, core: false, scale: 1 });
  });

  it('upgrade applies the tier scale and marks; the foot stays on the pad', () => {
    const t = artTower();
    t.upgrade(2);
    expect(t._sprite.sprite.scaleX).toBeCloseTo(0.6 * 1.12, 9);
    expect(t._sprite.sprite.scaleY).toBeCloseTo(0.6 * 1.12, 9);
    expect(t.lookSnapshot()).toMatchObject({ level: 2, core: false, pips: 2, scale: 1.12 });
    expect(t.lookSnapshot().footDriftPx).toBeCloseTo(0, 9);

    t.upgrade(4, 'B');
    expect(t._sprite.sprite.scaleX).toBeCloseTo(0.6 * 1.4, 9);
    expect(t.footY()).toBe(FOOT_Y);
    expect(t.muzzlePoint().x).toBe(100);
    expect(t.muzzlePoint().y).toBeCloseTo(200 + (1 - 1.4) * FOOT_Y, 9);
    expect(t.lookSnapshot()).toMatchObject({ level: 4, branch: 'B', core: false, embers: 3, pips: 'B', scale: 1.4 });
    expect(t.lookSnapshot().footDriftPx).toBeCloseTo(0, 9);
    // Real art carries its own glow, so no core object exists (#73a).
    expect(t._look._glow).toBeNull();
  });

  it('footDriftPx reads the live sprite, so a sprite off its foot pivot shows drift', () => {
    const t = artTower();
    t.upgrade(3);
    t._sprite.sprite.y = 0; // a centre pivot instead of the foot pivot
    expect(t.lookSnapshot().footDriftPx).toBeCloseTo(FOOT_Y * 1.25 - FOOT_Y, 9);
  });

  it('E7: a pop after an upgrade squashes on top of the new tier scale', () => {
    const t = artTower();
    t.upgrade(3);
    t.startPop(UPGRADE_POP);
    t.updatePop(0.05);
    const pop = popScale(0.05, UPGRADE_POP.duration, UPGRADE_POP.peak);
    expect(pop).not.toBe(1);
    expect(t._sprite.sprite.scaleX).toBeCloseTo(0.6 * 1.25 * pop, 9);
  });

  it('E8: the pop ends on the tier scale, not the manifest scale', () => {
    const t = artTower();
    t.upgrade(3);
    t.startPop(UPGRADE_POP);
    t.updatePop(0.05);
    t.updatePop(1);
    expect(t._sprite.sprite.scaleX).toBeCloseTo(0.6 * 1.25, 9);
    expect(t._sprite.sprite.scaleY).toBeCloseTo(0.6 * 1.25, 9);
  });

  it('E28: with no art a T4 tower measures from the fallback foot and still shows its marks', () => {
    const t = makeTower(makeScene([]), 100, 200);
    t.upgrade(2); t.upgrade(3); t.upgrade(4, 'A');
    expect(t._sprite.active).toBe(false);
    expect(t.footY()).toBe(TIER_FALLBACK_GROUND.footY);
    expect(t.footY()).toBe(18);
    expect(t.muzzlePoint()).toEqual({ x: 100, y: 200 });
    expect(t.lookSnapshot()).toMatchObject({ core: true, embers: 3, pips: 'A', footDriftPx: 0 });
  });

  it('updateLook forwards the real clock and reduced flag to the look', () => {
    const t = artTower();
    t._look.updateLook = vi.fn();
    t.updateLook(1.5, true);
    expect(t._look.updateLook).toHaveBeenCalledWith(1.5, true);
  });
});
