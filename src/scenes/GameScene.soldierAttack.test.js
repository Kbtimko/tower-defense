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

import { describe, it, expect, vi } from 'vitest';

import GameScene from './GameScene.js';

// `barracks` needs level/branch: _dealDamage tags the hit via soldierSource(),
// which reads soldier.barracks.level and .branch.
const makeSoldier = (attackTimer) => ({
  damage: 5, attackRate: 1, attackTimer,
  barracks: { type: 'barracks', level: 1, branch: null },
  takeDamage: vi.fn(),
  _sprite: { setState: vi.fn() },
});
const makeEnemy = () => ({
  x: 0, y: 0, dead: false, waypointIndex: 0, currentSpeed: 0,
  statusEffects: { stun: { active: false } },
  update() {},
});
const makeCtx = (soldier, enemy) => ({
  enemies: [enemy],
  pathMgr: { path: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
  _checkSoldierBlock: () => soldier,
  _dealDamage: vi.fn(),
});

describe('GameScene soldier attack state', () => {
  it('enters the attack state on the beat the soldier deals damage', () => {
    const soldier = makeSoldier(0);
    GameScene.prototype._updateEnemies.call(makeCtx(soldier, makeEnemy()), 0.016);
    expect(soldier._sprite.setState).toHaveBeenCalledWith('attack');
  });

  it('does not re-enter the attack state while the swing is on cooldown', () => {
    const soldier = makeSoldier(0.5);
    GameScene.prototype._updateEnemies.call(makeCtx(soldier, makeEnemy()), 0.016);
    expect(soldier._sprite.setState).not.toHaveBeenCalled();
  });
});
