vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
      },
    },
  },
}));

vi.mock('../entities/Projectile.js', () => ({
  Projectile: class { constructor(scene, opts) { Object.assign(this, opts); } },
}));

import { describe, it, expect, vi } from 'vitest';
import GameScene from './GameScene.js';

// A click on the path, with a tower type armed, that lands nowhere near a build
// slot. This is the state a new player reaches by clicking a tower button to see
// what it does and then clicking the map.
const makeCtx = (overrides = {}) => ({
  aimMode: false,
  repositionMode: false,
  repositioningBarracks: null,
  selectedType: 'archer',
  placementManager: {
    getTowers: () => [],
    getNearestSlot: () => null,   // no slot under the cursor
    placeTower: vi.fn(),
    getZones: () => [],
  },
  inspector: { inspectableAt: () => null, tryClickInspect: () => false },
  hero: { dead: false, moveToProgress: vi.fn() },
  pathMgr: {
    isOnPath: () => true,
    getNearestPathProgress: () => 0.5,
    getPathPoints: () => [],
  },
  _repaintStaticLayers: vi.fn(),
  _playTowerPop: vi.fn(),
  _closeTowerPanel: vi.fn(),
  _openTowerPanel: vi.fn(),
  _deselectButtons: vi.fn(),
  _toast: vi.fn(),
  ...overrides,
});

// The canvas tap entry point (InputController calls it on release). The ctx
// inherits the real prototype so the tap pipeline's own helpers run.
const tap = (ctx) => GameScene.prototype._onTap.call(Object.setPrototypeOf(ctx, GameScene.prototype), 400, 300);

describe('armed tower must not silently freeze the hero', () => {
  it('does not leave the tower armed after a click that hits no slot', () => {
    const ctx = makeCtx();
    tap(ctx);
    // Regression: selectedType stayed 'archer', so every later click was also
    // swallowed by tower placement and the hero could never be moved again.
    expect(ctx.selectedType).toBeNull();
  });

  it('tells the player why nothing was built', () => {
    const ctx = makeCtx();
    tap(ctx);
    expect(ctx._toast).toHaveBeenCalled();
  });

  it('still places a tower when the click does hit a slot', () => {
    const placed = { type: 'archer' };
    const ctx = makeCtx({
      placementManager: {
        getTowers: () => [],
        getNearestSlot: () => ({ slotIndex: 2, x: 400, y: 300 }),
        placeTower: vi.fn(() => placed),
        getZones: () => [],
      },
    });
    tap(ctx);
    expect(ctx.placementManager.placeTower).toHaveBeenCalled();
    expect(ctx.hero.moveToProgress).not.toHaveBeenCalled();
  });

  it('moves the hero on a path click when nothing is armed', () => {
    const ctx = makeCtx({ selectedType: null });
    tap(ctx);
    expect(ctx.hero.moveToProgress).toHaveBeenCalledWith(0.5);
  });
});
