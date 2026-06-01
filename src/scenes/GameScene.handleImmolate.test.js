import { describe, it, expect, vi } from 'vitest';

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

import GameScene from './GameScene.js';

function makeCtx({ areaAdd }) {
  const delayed = [];
  return {
    delayed,
    hero: { heroId: 'pyro', _attackDamageMult: 1.0, _attackDmgRevertEvt: null },
    _areaEffects: { add: areaAdd },
    time: {
      delayedCall: vi.fn((ms, cb) => {
        const evt = { ms, cb, remove: vi.fn() };
        delayed.push(evt);
        return evt;
      }),
    },
  };
}

describe('GameScene._handleImmolate', () => {
  it('stores the revert TimerEvent on the hero so death can cancel it', () => {
    const ctx = makeCtx({ areaAdd: vi.fn() });
    GameScene.prototype._handleImmolate.call(ctx, {
      attackDamageMult: 1.5, radius: 60, duration: 8, dps: 10,
    });
    expect(ctx.hero._attackDamageMult).toBe(1.5);
    expect(ctx.hero._attackDmgRevertEvt).toBe(ctx.delayed[0]);
    expect(ctx.delayed[0].ms).toBe(8000);
  });

  it('cancels any prior pending revert before scheduling a new one', () => {
    const ctx = makeCtx({ areaAdd: vi.fn() });
    GameScene.prototype._handleImmolate.call(ctx, {
      attackDamageMult: 1.5, radius: 60, duration: 8, dps: 10,
    });
    const firstEvt = ctx.delayed[0];
    GameScene.prototype._handleImmolate.call(ctx, {
      attackDamageMult: 1.5, radius: 60, duration: 8, dps: 10,
    });
    expect(firstEvt.remove).toHaveBeenCalledWith(false);
    expect(ctx.hero._attackDmgRevertEvt).toBe(ctx.delayed[1]);
  });

  it('revert callback clears _attackDmgRevertEvt and resets multiplier to 1.0', () => {
    const ctx = makeCtx({ areaAdd: vi.fn() });
    GameScene.prototype._handleImmolate.call(ctx, {
      attackDamageMult: 1.5, radius: 60, duration: 8, dps: 10,
    });
    // Simulate the timer firing.
    ctx.delayed[0].cb();
    expect(ctx.hero._attackDamageMult).toBe(1.0);
    expect(ctx.hero._attackDmgRevertEvt).toBeNull();
  });
});
