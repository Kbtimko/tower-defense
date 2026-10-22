vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class { add() {} setDepth() { return this; } } },
  },
}));

import { describe, it, expect, vi } from 'vitest';
import GameScene from './GameScene.js';

// _killReward is deliberately non-identity so a second call, or spawning with
// the raw enemy.reward, would be caught: the coin text must show what was earned.
function makeCtx() {
  return {
    enemies: [],
    hero: { update: vi.fn(), overchargeActive: false, _timers: { q: 0, w: 0, e: 0 }, xpProgress: () => ({}) },
    economy: { earn: vi.fn() },
    kills: 0,
    _coinFx: { spawn: vi.fn() },
    _updateHUD: vi.fn(),
    _killReward: vi.fn((r) => r * 2 + 1),
    _addParticle: vi.fn(),
    _heroOverchargeWasActive: false,
    _applyOvercharge: vi.fn(),
    _heroCooldownAccum: 0,
    game: { events: { emit: vi.fn() } },
  };
}

describe('kill sites spawn coins with the reward actually earned', () => {
  it('_dealDamage', () => {
    const ctx = makeCtx();
    const enemy = { x: 10, y: 20, reward: 5, dead: true, def: { color: 1, radius: 4 }, takeDamage: vi.fn() };
    GameScene.prototype._dealDamage.call(ctx, enemy, 3, false);
    expect(ctx._killReward).toHaveBeenCalledTimes(1);
    const earned = ctx.economy.earn.mock.calls[0][0];
    expect(earned).toBe(11);
    expect(ctx._coinFx.spawn).toHaveBeenCalledWith(10, 20, earned);
  });

  it('hero kill loop', () => {
    const ctx = makeCtx();
    const enemy = { x: 7, y: 8, reward: 5, dead: false };
    ctx.enemies = [enemy];
    ctx.hero.update = vi.fn(() => { enemy.dead = true; });
    GameScene.prototype._updateHero.call(ctx, 0.1);
    expect(ctx._killReward).toHaveBeenCalledTimes(1);
    const earned = ctx.economy.earn.mock.calls[0][0];
    expect(earned).toBe(11);
    expect(ctx._coinFx.spawn).toHaveBeenCalledWith(7, 8, earned);
  });

  it('does not spawn for a non-lethal hit', () => {
    const ctx = makeCtx();
    const enemy = { x: 1, y: 1, reward: 5, dead: false, takeDamage: vi.fn() };
    GameScene.prototype._dealDamage.call(ctx, enemy, 3, false);
    expect(ctx._coinFx.spawn).not.toHaveBeenCalled();
  });
});
