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

// Already standing on the last waypoint, so this pass runs the leak branch.
const atBase = (over = {}) => ({
  x: 10, y: 0, waypointIndex: 1, currentSpeed: 0, dead: false,
  statusEffects: { stun: { active: false } }, update: vi.fn(), def: {}, ...over,
});

const makeCtx = (enemies) => {
  const audio = { playSfx: vi.fn(), setCombatActive: vi.fn() };
  return {
    audio,
    hero: null,
    enemies,
    _enemiesOnPath: enemies.length,
    pathMgr: { path: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    _checkSoldierBlock: () => null,
    _dealDamage: vi.fn(),
    _fadeOutDeadEnemy: vi.fn(),
    _updateWaveButton: vi.fn(),
    game: { registry: { get: (k) => (k === 'audio' ? audio : undefined) } },
    economy: { loseLife: vi.fn() },
  };
};

describe('GameScene leak at the base (#38)', () => {
  it('costs a life when a live enemy reaches the base', () => {
    const ctx = makeCtx([atBase()]);
    GameScene.prototype._updateEnemies.call(ctx, 0.016);
    expect(ctx.economy.loseLife).toHaveBeenCalledOnce();
    expect(ctx.audio.playSfx).toHaveBeenCalledWith('life-lost');
  });

  it('costs no life and plays no life-lost sound for a tower-killed corpse at the base', () => {
    // The player already got the kill; the simulator sweeps its dead before
    // moving, so it never charged this life either.
    const ctx = makeCtx([atBase({ dead: true })]);
    GameScene.prototype._updateEnemies.call(ctx, 0.016);
    expect(ctx.economy.loseLife).not.toHaveBeenCalled();
    expect(ctx.audio.playSfx).not.toHaveBeenCalledWith('life-lost');
    expect(ctx.enemies).toEqual([]); // still swept with the other dead
  });

  it('charges one life when a live enemy and a corpse reach the base together', () => {
    const ctx = makeCtx([atBase({ dead: true }), atBase()]);
    GameScene.prototype._updateEnemies.call(ctx, 0.016);
    expect(ctx.economy.loseLife).toHaveBeenCalledOnce();
  });
});
