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

const XP = { level: 2, progress: 0.4, current: 240, needed: 600, atMax: false };

function makeCtx() {
  const emit = vi.fn();
  return {
    emit,
    ctx: {
      enemies: [],
      hero: {
        hp: 90, maxHp: 150, level: 2,
        overchargeActive: false,
        _timers: { q: 0, w: 0, e: 0 },
        update: vi.fn(),
        xpProgress: () => XP,
      },
      economy: { earn: vi.fn() },
      kills: 0,
      _updateHUD: vi.fn(),
      _killReward: (r) => r,
      _heroOverchargeWasActive: false,
      _applyOvercharge: vi.fn(),
      _heroCooldownAccum: 0,
      game: { events: { emit } },
    },
  };
}

describe('GameScene hero:update carries XP progress', () => {
  it('includes the hero xpProgress() result in the payload', () => {
    const { emit, ctx } = makeCtx();
    GameScene.prototype._updateHero.call(ctx, 0.1);
    const call = emit.mock.calls.find(([name]) => name === 'hero:update');
    expect(call).toBeDefined();
    expect(call[1].xp).toEqual(XP);
  });

  it('still carries hp, maxHp and level (no regression)', () => {
    const { emit, ctx } = makeCtx();
    GameScene.prototype._updateHero.call(ctx, 0.1);
    const [, payload] = emit.mock.calls.find(([name]) => name === 'hero:update');
    expect(payload.hp).toBe(90);
    expect(payload.maxHp).toBe(150);
    expect(payload.level).toBe(2);
  });
});
