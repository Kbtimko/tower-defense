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
import { GROUND_FX_DEPTH } from '../data/roads.js';

function makeCtx() {
  // Chaining spy: every method returns the graphics object, so any call sequence works.
  const g = {};
  for (const m of ['setDepth', 'lineStyle', 'lineBetween', 'fillStyle', 'beginPath',
    'moveTo', 'lineTo', 'closePath', 'fillPath', 'destroy']) {
    g[m] = vi.fn(() => g);
  }
  return {
    g,
    add: { graphics: vi.fn(() => g) },
    enemies: [],
    time: { delayedCall: vi.fn() },
    game: { registry: { get: () => null } },
  };
}

describe('hero ground FX depth', () => {
  it('flame wave draws at GROUND_FX_DEPTH', () => {
    const ctx = makeCtx();
    GameScene.prototype._handleFlameWave.call(ctx, {
      x: 0, y: 0, facingX: 1, length: 100, halfAngle: 0.5, damage: 1, burn: { duration: 1, dps: 1 },
    });
    expect(ctx.g.setDepth).toHaveBeenCalledWith(GROUND_FX_DEPTH);
  });

  it('volley draws at GROUND_FX_DEPTH', () => {
    const ctx = makeCtx();
    GameScene.prototype._handleVolley.call(ctx, { x: 0, y: 0, range: 100, maxTargets: 3, damage: 1 });
    expect(ctx.g.setDepth).toHaveBeenCalledWith(GROUND_FX_DEPTH);
  });
});
