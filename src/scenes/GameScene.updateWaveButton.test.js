// Mock Phaser before any imports that touch it
vi.mock('phaser', () => ({
  default: {
    Scene: class {
      constructor(key) { this.key = key; }
    },
  },
}));

// Mock all heavy dependencies so GameScene can be imported without Phaser internals
vi.mock('../data/towers.js', () => ({ TOWER_DEFS: {} }));
vi.mock('../data/maps.js', () => ({ MAPS: {} }));
vi.mock('../data/waves.js', () => ({ MAP_WAVES: {} }));
vi.mock('../data/story.js', () => ({ STORY_PANELS: {} }));
vi.mock('../utils/display.js', () => ({ starsDisplay: () => '' }));
vi.mock('../systems/PathManager.js', () => ({ PathManager: class {} }));
vi.mock('../systems/WaveManager.js', () => ({ WaveManager: class {} }));
vi.mock('../systems/EconomyManager.js', () => ({ EconomyManager: class {} }));
vi.mock('../systems/TowerPlacementManager.js', () => ({ TowerPlacementManager: class {} }));
vi.mock('../systems/SaveManager.js', () => ({ SaveManager: class {} }));
vi.mock('../systems/UpgradeManager.js', () => ({ UpgradeManager: class {} }));
vi.mock('../systems/StoryManager.js', () => ({ StoryManager: class {} }));
vi.mock('../systems/DamageNumberOverlay.js', () => ({ DamageNumberOverlay: class {} }));
vi.mock('../systems/ShakeController.js', () => ({ ShakeController: class {} }));
vi.mock('../systems/ParticleSpawner.js', () => ({ ParticleSpawner: class {} }));
vi.mock('../entities/Tower.js', () => ({ Tower: class {} }));
vi.mock('../entities/Barracks.js', () => ({ Barracks: class {} }));
vi.mock('../entities/Enemy.js', () => ({ Enemy: class {} }));
vi.mock('../entities/Projectile.js', () => ({ Projectile: class {} }));
vi.mock('../entities/Hero.js', () => ({ Hero: class {} }));

import { describe, it, expect, beforeEach } from 'vitest';
import GameScene from './GameScene.js';

function setupBtn() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const btn = document.createElement('button');
  btn.id = 'wave-btn';
  document.body.appendChild(btn);
  return btn;
}

function makeScene({ done = false, active = false, isEarlyEligible = false, currentWave = 0, enemies = [] } = {}) {
  // Use prototype as base so _computeEarlyBonus is available when _updateWaveButton calls this._computeEarlyBonus()
  const scene = Object.create(GameScene.prototype);
  scene.waveMgr = { done, active, isEarlyEligible, currentWave };
  scene.enemies = enemies;
  return scene;
}

beforeEach(setupBtn);

describe('GameScene._updateWaveButton', () => {
  it('renders "All Waves Done" (disabled) when waveMgr.done', () => {
    const scene = makeScene({ done: true });
    GameScene.prototype._updateWaveButton.call(scene);
    const btn = document.getElementById('wave-btn');
    expect(btn.textContent).toBe('All Waves Done');
    expect(btn.disabled).toBe(true);
  });

  it('renders "Wave N in progress..." (disabled) while spawning', () => {
    const scene = makeScene({ active: true, isEarlyEligible: false, currentWave: 3 });
    GameScene.prototype._updateWaveButton.call(scene);
    const btn = document.getElementById('wave-btn');
    expect(btn.textContent).toBe('Wave 3 in progress...');
    expect(btn.disabled).toBe(true);
  });

  it('renders "▶ Send Wave N+1" (enabled, no bonus) when between waves', () => {
    const scene = makeScene({ active: false, currentWave: 2 });
    GameScene.prototype._updateWaveButton.call(scene);
    const btn = document.getElementById('wave-btn');
    expect(btn.textContent).toBe('▶ Send Wave 3');
    expect(btn.disabled).toBe(false);
  });

  it('renders "▶ Send Wave N+1 (+Xg)" (enabled) when isEarlyEligible with living enemies', () => {
    const enemies = [
      { def: { reward: 20 }, dead: false },
      { def: { reward: 55 }, dead: false },
    ];
    // floor(0.5 * (20+55)) = floor(37.5) = 37
    const scene = makeScene({ active: true, isEarlyEligible: true, currentWave: 1, enemies });
    GameScene.prototype._updateWaveButton.call(scene);
    const btn = document.getElementById('wave-btn');
    expect(btn.textContent).toBe('▶ Send Wave 2 (+37g)');
    expect(btn.disabled).toBe(false);
  });

  it('excludes dead enemies from the bonus sum', () => {
    const enemies = [
      { def: { reward: 100 }, dead: true },
      { def: { reward: 20 }, dead: false },
    ];
    // floor(0.5 * 20) = 10
    const scene = makeScene({ active: true, isEarlyEligible: true, currentWave: 1, enemies });
    GameScene.prototype._updateWaveButton.call(scene);
    expect(document.getElementById('wave-btn').textContent).toBe('▶ Send Wave 2 (+10g)');
  });

  it('omits the (+Xg) suffix when computed bonus is 0', () => {
    const enemies = [{ def: { reward: 0 }, dead: false }];
    const scene = makeScene({ active: true, isEarlyEligible: true, currentWave: 1, enemies });
    GameScene.prototype._updateWaveButton.call(scene);
    expect(document.getElementById('wave-btn').textContent).toBe('▶ Send Wave 2');
  });

  it('renders "▶ Send Wave N+1" when isEarlyEligible but enemies array is empty', () => {
    const scene = makeScene({ active: true, isEarlyEligible: true, currentWave: 1, enemies: [] });
    GameScene.prototype._updateWaveButton.call(scene);
    expect(document.getElementById('wave-btn').textContent).toBe('▶ Send Wave 2');
    expect(document.getElementById('wave-btn').disabled).toBe(false);
  });
});
