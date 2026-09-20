// The build pads live on the one-shot static layer, so a change in slot
// occupancy is invisible until that layer is repainted. These tests pin the
// three places occupancy can change.
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

const makeCtx = (overrides = {}) => ({
  aimMode: false,
  repositionMode: false,
  repositioningBarracks: null,
  selectedType: 'archer',
  selectedTower: null,
  placementManager: {
    getTowers: () => [],
    getNearestSlot: () => ({ slotIndex: 1, x: 400, y: 300 }),
    placeTower: vi.fn(() => ({ type: 'archer' })),
    sellTower: vi.fn(),
    getZones: () => [{ occupied: false }, { occupied: false }],
  },
  inspector: { tryClickInspect: () => false },
  hero: { dead: false, moveToProgress: vi.fn() },
  pathMgr: {
    isOnPath: () => true,
    getNearestPathProgress: () => 0.5,
    getPathPoints: () => [],
  },
  _repaintStaticLayers: vi.fn(),
  _closeTowerPanel: vi.fn(),
  _openTowerPanel: vi.fn(),
  _deselectButtons: vi.fn(),
  _toast: vi.fn(),
  ...overrides,
});

describe('GameScene static pad repaint', () => {
  it('repaints the static layer after a tower is placed', () => {
    const ctx = makeCtx();
    GameScene.prototype._onPointerDown.call(ctx, { x: 400, y: 300 });
    expect(ctx.placementManager.placeTower).toHaveBeenCalled();
    expect(ctx._repaintStaticLayers).toHaveBeenCalledTimes(1);
  });

  it('does not repaint when placement fails for want of gold', () => {
    const ctx = makeCtx();
    ctx.placementManager.placeTower = vi.fn(() => null);
    GameScene.prototype._onPointerDown.call(ctx, { x: 400, y: 300 });
    expect(ctx._repaintStaticLayers).not.toHaveBeenCalled();
  });

  it('repaints the static layer after a tower is sold', () => {
    const ctx = makeCtx({ selectedTower: { zoneIndex: 1 } });
    GameScene.prototype._sellSelectedTower.call(ctx);
    expect(ctx.placementManager.sellTower).toHaveBeenCalled();
    expect(ctx._repaintStaticLayers).toHaveBeenCalledTimes(1);
  });

  it('does not repaint when the sell button fires with nothing selected', () => {
    const ctx = makeCtx({ selectedTower: null });
    GameScene.prototype._sellSelectedTower.call(ctx);
    expect(ctx._repaintStaticLayers).not.toHaveBeenCalled();
  });

  it('repaints after a barracks reposition frees one slot and occupies another', () => {
    const zones = [{ occupied: true }, { occupied: false }];
    const barracks = { zoneIndex: 0, setPosition: vi.fn() };
    const ctx = makeCtx({
      repositionMode: true,
      repositioningBarracks: barracks,
      placementManager: {
        getTowers: () => [],
        getNearestSlot: () => ({ slotIndex: 1, x: 400, y: 300 }),
        placeTower: vi.fn(),
        sellTower: vi.fn(),
        getZones: () => zones,
      },
    });
    GameScene.prototype._onPointerDown.call(ctx, { x: 400, y: 300 });
    expect(zones[0].occupied).toBe(false);
    expect(zones[1].occupied).toBe(true);
    expect(ctx._repaintStaticLayers).toHaveBeenCalledTimes(1);
  });

  it('does not repaint when a reposition is cancelled by clicking no slot', () => {
    const barracks = { zoneIndex: 0, setPosition: vi.fn() };
    const ctx = makeCtx({
      repositionMode: true,
      repositioningBarracks: barracks,
      placementManager: {
        getTowers: () => [],
        getNearestSlot: () => null,
        placeTower: vi.fn(),
        sellTower: vi.fn(),
        getZones: () => [],
      },
    });
    GameScene.prototype._onPointerDown.call(ctx, { x: 400, y: 300 });
    expect(ctx._repaintStaticLayers).not.toHaveBeenCalled();
  });
});

describe('GameScene._repaintStaticLayers', () => {
  it('re-runs the static layer paint', () => {
    const ctx = { mapId: 0, _staticLayers: {}, _renderStaticLayers: vi.fn() };
    GameScene.prototype._repaintStaticLayers.call(ctx);
    expect(ctx._renderStaticLayers).toHaveBeenCalledTimes(1);
  });

  it('is a no-op after shutdown has dropped the static layer', () => {
    const ctx = { mapId: 0, _staticLayers: null, _renderStaticLayers: vi.fn() };
    expect(() => GameScene.prototype._repaintStaticLayers.call(ctx)).not.toThrow();
    expect(ctx._renderStaticLayers).not.toHaveBeenCalled();
  });
});
