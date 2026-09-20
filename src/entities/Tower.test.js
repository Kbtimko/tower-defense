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
          states: {
            idle:   { path: 'x_idle.png',   frameWidth: 64, frameHeight: 64, frames: 1 },
            attack: { path: 'x_attack.png', frameWidth: 64, frameHeight: 64, frames: 5, frameRate: 14 },
          },
        }
      : null,
}));

import { TOWER_DEFS } from '../data/towers.js';
import { Tower } from './Tower.js';

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
                   'lineStyle', 'strokeCircle', 'strokeRect']) {
    g[m] = (...args) => { calls.push([m, ...args]); return g; };
  }
  return g;
};

const makeScene = (spriteKeys = []) => ({
  add: {
    graphics: () => makeGraphics(),
    text: () => ({ setOrigin: () => ({ visible: true, setVisible(v) { this.visible = v; return this; } }) }),
    sprite: () => ({
      setOrigin() { return this; }, setScale() { return this; },
      setFlipX() { return this; }, setTexture() {}, play() {}, on() {}, once() {},
      destroy() {},
    }),
    existing() {},
  },
  anims: { exists: () => false, create() {}, generateFrameNumbers: () => [] },
  game: { registry: { get: () => spriteKeys } },
});

// `_redraw` runs once in the constructor BEFORE `_sprite` exists (so it fills),
// then again after. `clear()` does not erase the recorded call log, so assert
// only on what was drawn after the last clear.
const sinceLastClear = g => g._calls.slice(g._calls.map(c => c[0]).lastIndexOf('clear'));
const strokeWidths = g => sinceLastClear(g).filter(c => c[0] === 'lineStyle').map(c => c[1]);

// `def` is required: the constructor reads def.damage/range/fireRate directly.
const makeTower = (scene) =>
  new Tower(scene, { type: 'archer', x: 0, y: 0, def: TOWER_DEFS.archer, zoneIndex: 0 });

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
