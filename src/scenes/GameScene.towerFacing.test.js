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

const makeTower = (x, y) => ({
  type: 'archer', branch: null, x, y, range: 200, damage: 10, fireRate: 1,
  cooldown: 0, level: 1, splashRadius: 0, pierce: 0, slow: 0,
  _sprite: { setFacing: vi.fn(), setState: vi.fn() },
});
const makeEnemy = (x, y, waypointIndex = 1) => ({ x, y, waypointIndex });
const makeCtx = (towers, enemies) => ({
  placementManager: { getTowers: () => towers },
  enemies,
  projectiles: [],
  particleSpawner: null,
  game: { registry: { get: () => null } },
});

describe('GameScene._updateTowers facing', () => {
  it('faces the tower right when the target is to its right', () => {
    const tower = makeTower(100, 100);
    GameScene.prototype._updateTowers.call(makeCtx([tower], [makeEnemy(180, 100)]), 1);
    expect(tower._sprite.setFacing).toHaveBeenCalledOnce();
    expect(tower._sprite.setFacing.mock.calls[0][0]).toBeGreaterThan(0);
  });

  it('faces the tower left when the target is to its left', () => {
    const tower = makeTower(100, 100);
    GameScene.prototype._updateTowers.call(makeCtx([tower], [makeEnemy(20, 100)]), 1);
    expect(tower._sprite.setFacing.mock.calls[0][0]).toBeLessThan(0);
  });

  it('faces before it plays the attack beat', () => {
    const order = [];
    const tower = makeTower(100, 100);
    tower._sprite.setFacing = vi.fn(() => order.push('face'));
    tower._sprite.setState  = vi.fn(() => order.push('attack'));
    GameScene.prototype._updateTowers.call(makeCtx([tower], [makeEnemy(180, 100)]), 1);
    expect(order).toEqual(['face', 'attack']);
  });

  it('does not touch facing when nothing is in range', () => {
    const tower = makeTower(100, 100);
    GameScene.prototype._updateTowers.call(makeCtx([tower], [makeEnemy(9000, 9000)]), 1);
    expect(tower._sprite.setFacing).not.toHaveBeenCalled();
    expect(tower._sprite.setState).not.toHaveBeenCalled();
  });
});
