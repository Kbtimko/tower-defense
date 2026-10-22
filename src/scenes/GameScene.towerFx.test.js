vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class { constructor() {} add() {} setDepth() { return this; } } },
  },
}));
vi.mock('../entities/Projectile.js', () => ({
  Projectile: class { constructor(scene, opts) { Object.assign(this, opts); } },
}));

import { describe, it, expect, vi } from 'vitest';
import GameScene from './GameScene.js';
import { BUILD_POP, UPGRADE_POP, SELL_FX } from '../data/juice.js';

const proto = GameScene.prototype;
const makeFxCtx = (ambient = true) => ({
  game: { registry: { get: (k) => (k === 'ambientMotion' ? ambient : undefined) } },
  particleSpawner: { spawnImpact: vi.fn() },
  _coinFx: { spawn: vi.fn() },
});

describe('GameScene._playTowerPop', () => {
  const tower = () => ({ x: 10, y: 20, startPop: vi.fn() });

  it('bursts at the tower and pops (build)', () => {
    const ctx = makeFxCtx(); const t = tower();
    proto._playTowerPop.call(ctx, t, BUILD_POP);
    expect(ctx.particleSpawner.spawnImpact).toHaveBeenCalledWith(BUILD_POP.burstEffect, 10, 20);
    expect(t.startPop).toHaveBeenCalledWith(BUILD_POP);
  });

  it('upgrade reads its burst key from UPGRADE_POP', () => {
    const ctx = makeFxCtx(); const t = tower();
    proto._playTowerPop.call(ctx, t, UPGRADE_POP);
    expect(ctx.particleSpawner.spawnImpact).toHaveBeenCalledWith(UPGRADE_POP.burstEffect, 10, 20);
    expect(t.startPop).toHaveBeenCalledWith(UPGRADE_POP);
  });

  it('reduced motion keeps the burst but skips the scale pop', () => {
    const ctx = makeFxCtx(false); const t = tower();
    proto._playTowerPop.call(ctx, t, BUILD_POP);
    expect(ctx.particleSpawner.spawnImpact).toHaveBeenCalledTimes(1);
    expect(t.startPop).not.toHaveBeenCalled();
  });

  it('tolerates a missing particle spawner (post-shutdown)', () => {
    const ctx = makeFxCtx(); ctx.particleSpawner = null; const t = tower();
    expect(() => proto._playTowerPop.call(ctx, t, BUILD_POP)).not.toThrow();
  });
});

describe('GameScene._playSellFx', () => {
  it('bursts and spawns coins with the refund actually paid', () => {
    const ctx = makeFxCtx();
    proto._playSellFx.call(ctx, 5, 6, 36);
    expect(ctx.particleSpawner.spawnImpact).toHaveBeenCalledWith(SELL_FX.burstEffect, 5, 6);
    expect(ctx.particleSpawner.spawnImpact).toHaveBeenCalledWith(SELL_FX.smokeEffect, 5, 6);
    expect(ctx._coinFx.spawn).toHaveBeenCalledWith(5, 6, 36);
  });
});

describe('GameScene tower hooks', () => {
  it('_sellSelectedTower plays sell fx with sellTower\'s return value and still removes immediately', () => {
    const tower = { x: 1, y: 2 };
    const ctx = {
      selectedTower: tower,
      placementManager: { sellTower: vi.fn(() => 36) },
      _playSellFx: vi.fn(), _repaintStaticLayers: vi.fn(), _closeTowerPanel: vi.fn(),
    };
    proto._sellSelectedTower.call(ctx);
    expect(ctx.placementManager.sellTower).toHaveBeenCalledWith(tower);
    expect(ctx._playSellFx).toHaveBeenCalledWith(1, 2, 36);
    expect(ctx.selectedTower).toBeNull();
  });

  it('_updateTowers advances every tower pop, even ones that do not fire', () => {
    const a = { updatePop: vi.fn(), fireRate: 0 };
    const b = { updatePop: vi.fn(), fireRate: 1, cooldown: 5 };
    const ctx = { placementManager: { getTowers: () => [a, b] }, enemies: [] };
    proto._updateTowers.call(ctx, 0.016);
    expect(a.updatePop).toHaveBeenCalledWith(0.016);
    expect(b.updatePop).toHaveBeenCalledWith(0.016);
  });
});

describe('GameScene._upgradeSelectedTower', () => {
  it('plays the upgrade pop only after a successful upgrade', () => {
    const tower = { level: 1, type: 'archer', x: 0, y: 0 };
    const ctx = {
      selectedTower: tower, mapId: 0, _panelAnchor: { x: 1, y: 2 },
      placementManager: { upgradeTower: vi.fn(() => true) },
      _playTowerPop: vi.fn(), _openTowerPanel: vi.fn(), _toast: vi.fn(),
    };
    proto._upgradeSelectedTower.call(ctx);
    expect(ctx._playTowerPop).toHaveBeenCalledWith(tower, UPGRADE_POP);

    ctx._playTowerPop.mockClear();
    ctx.placementManager.upgradeTower = vi.fn(() => false);
    proto._upgradeSelectedTower.call(ctx);
    expect(ctx._playTowerPop).not.toHaveBeenCalled();
  });
});
