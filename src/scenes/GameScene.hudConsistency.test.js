vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class { add() {} setDepth() { return this; } } },
  },
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
import GameScene from './GameScene.js';
import { MAPS } from '../data/maps.js';

beforeEach(() => { document.body.innerHTML = ''; });

describe('GameScene._updateHUD wave total', () => {
  it("the wave stat's total is the spawning wave table, not the map table", () => {
    document.body.innerHTML =
      '<span id="stat-lives"></span><span id="stat-gold"></span>' +
      '<span id="stat-wave"></span><span id="stat-kills"></span>';
    expect(MAPS[0].waveCount).not.toBe(2); // fixture must differ from the map table
    const ctx = {
      mapId: 0,
      economy: { lives: 20, gold: 100 },
      kills: 0,
      waveMgr: { currentWave: 1, waves: [[], []] },
      _refreshRadial() {},
    };
    GameScene.prototype._updateHUD.call(ctx);
    expect(document.getElementById('stat-wave').textContent).toBe('1/2');
  });
});

describe('GameScene._resetHudPulses', () => {
  it('strips only the pulse classes, only inside #hud-layer', () => {
    document.body.innerHTML =
      '<div id="game" class="life-lost-frame"></div>' +
      '<div class="hud-stat life-lost-pulse" id="outside"></div>' +
      '<div id="hud-layer">' +
      '<div class="hud-stat life-lost-pulse" id="a"></div>' +
      '<div class="hud-stat gold-gain-pulse" id="b"></div>' +
      '<button id="wave-btn" class="ui-btn cd-on cd-warn cd-tick"></button>' +
      '</div>';
    GameScene.prototype._resetHudPulses.call({});
    const a = document.getElementById('a').classList;
    const b = document.getElementById('b').classList;
    const w = document.getElementById('wave-btn').classList;
    expect(a.contains('life-lost-pulse')).toBe(false);
    expect(b.contains('gold-gain-pulse')).toBe(false);
    expect(w.contains('cd-tick')).toBe(false);
    expect(a.contains('hud-stat')).toBe(true);
    expect(b.contains('hud-stat')).toBe(true);
    for (const c of ['ui-btn', 'cd-on', 'cd-warn']) expect(w.contains(c)).toBe(true);
    expect(document.getElementById('game').classList.contains('life-lost-frame')).toBe(true);
    expect(document.getElementById('outside').classList.contains('life-lost-pulse')).toBe(true);
  });

  it('is a no-op without #hud-layer', () => {
    expect(() => GameScene.prototype._resetHudPulses.call({})).not.toThrow();
  });
});
