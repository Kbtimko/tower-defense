vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class { add() {} setDepth() { return this; } } },
  },
}));

import { describe, it, expect, vi } from 'vitest';
import GameScene from './GameScene.js';
import { BOSS_WARNING } from '../data/juice.js';

describe('GameScene wave banner wiring', () => {
  it('wires and unwires wave:start as an exact pair', () => {
    const on = vi.fn(); const off = vi.fn();
    const ctx = { events: { on, off } };
    GameScene.prototype._wireSceneEvents.call(ctx);
    GameScene.prototype._unwireSceneEvents.call(ctx);
    const onCall = on.mock.calls.find((c) => c[0] === 'wave:start');
    const offCall = off.mock.calls.find((c) => c[0] === 'wave:start');
    expect(onCall).toBeTruthy();
    expect(offCall).toEqual(onCall);
  });

  it('_onWaveStart passes wave number, real map wave count and boss type', () => {
    const boss = BOSS_WARNING.types[0];
    const show = vi.fn();
    const ctx = {
      mapId: 1,
      _waveBanner: { show },
      waveMgr: { waves: [[{ type: 'x' }], [{ type: boss }]] },
    };
    GameScene.prototype._onWaveStart.call(ctx, { waveNum: 2 });
    expect(show).toHaveBeenCalledTimes(1);
    const arg = show.mock.calls[0][0];
    expect(arg.waveNum).toBe(2);
    expect(arg.waveCount).toBe(2); // waveMgr.waves.length, not the map table
    expect(arg.bossType).toBe(boss);
  });

  it('_onWaveStart reports no boss for an ordinary wave', () => {
    const show = vi.fn();
    const ctx = { mapId: 1, _waveBanner: { show }, waveMgr: { waves: [[{ type: 'x' }]] } };
    GameScene.prototype._onWaveStart.call(ctx, { waveNum: 1 });
    expect(show.mock.calls[0][0].bossType).toBeNull();
  });
});
