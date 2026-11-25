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

vi.mock('../entities/Hero.js', async () => {
  const { HEROES } = await import('../data/heroes.js');
  return {
    Hero: class {
      constructor(scene, { x, y, heroId }) {
        Object.assign(this, { x, y, heroId, def: HEROES[heroId], level: 1, dead: false });
      }
      update() {}
      destroy() {}
    },
  };
});
vi.mock('../entities/Enemy.js', () => ({
  Enemy: class { constructor(scene, opts) { Object.assign(this, opts, { dead: false }); } },
}));
vi.mock('../systems/AmbientBackgroundLayer.js', () => ({
  AmbientBackgroundLayer: class { update() {} destroy() {} },
}));

import { loadShippedDOM, liveScene, startLevel } from './gameSceneHarness.js';

describe('GameScene.create() HUD pulse reset (#40)', () => {
  it('starting a level clears pulse classes left by the previous one', () => {
    loadShippedDOM();
    const lives = document.getElementById('stat-lives').parentElement;
    const gold = document.getElementById('stat-gold').parentElement;
    const wave = document.getElementById('wave-btn');
    lives.classList.add('life-lost-pulse');
    gold.classList.add('gold-gain-pulse');
    wave.classList.add('cd-tick');

    startLevel(liveScene(), { mapId: 0, heroId: 'rael' });

    expect(lives.classList.contains('life-lost-pulse')).toBe(false);
    expect(gold.classList.contains('gold-gain-pulse')).toBe(false);
    expect(wave.classList.contains('cd-tick')).toBe(false);
    expect(lives.classList.contains('hud-stat')).toBe(true);
    expect(gold.classList.contains('hud-stat')).toBe(true);
  });
});
