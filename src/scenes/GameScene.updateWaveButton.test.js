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
vi.mock('../entities/SentryTurret.js', () => ({ SentryTurret: class {} }));
vi.mock('../systems/AreaEffectsManager.js', () => ({ AreaEffectsManager: class { update() {} destroyAll() {} } }));

import { describe, it, expect, beforeEach } from 'vitest';
import GameScene from './GameScene.js';
import { WaveCountdown } from '../systems/waveCountdown.js';
import { WAVE_COUNTDOWN } from '../data/waveCountdown.js';

function setupBtn() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const btn = document.createElement('button');
  btn.id = 'wave-btn';
  document.body.appendChild(btn);
  return btn;
}

const TOTAL = WAVE_COUNTDOWN.defaultSec * 1000;
const bonusFor = (ms, rm = 1) => Math.floor((ms / 1000) * WAVE_COUNTDOWN.goldPerSecond * rm);

// countdownMs: a running countdown with that much left (null = none running).
function makeScene({ done = false, active = false, hasQueuedEnemies = false, currentWave = 0, enemies = [], rewardMult = 1, countdownMs = null } = {}) {
  const scene = Object.create(GameScene.prototype);
  scene.waveMgr = { done, active, hasQueuedEnemies, currentWave };
  scene._countdown = new WaveCountdown();
  if (countdownMs !== null) {
    scene._countdown.start(TOTAL, currentWave);
    scene._countdown.tick(TOTAL - countdownMs);
  }
  scene.enemies = enemies;
  scene.rewardMult = rewardMult;
  scene.game = { registry: { get: () => null } };
  return scene;
}

beforeEach(setupBtn);

// The (+Ng) suffix is the time bonus (spec C1). The old alive-enemy cases are
// rewritten on purpose — that behaviour was removed, not loosened.
describe('GameScene._updateWaveButton', () => {
  it('renders "All Waves Done" (disabled) when waveMgr.done', () => {
    const scene = makeScene({ done: true });
    GameScene.prototype._updateWaveButton.call(scene);
    const btn = document.getElementById('wave-btn');
    expect(btn.textContent).toBe('All Waves Done');
    expect(btn.disabled).toBe(true);
  });

  it('renders "Wave N in progress..." (disabled) while spawning', () => {
    const scene = makeScene({ active: true, hasQueuedEnemies: true, currentWave: 3 });
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
    expect(btn.classList.contains('cd-on')).toBe(false);
  });

  it('renders "▶ Send Wave N+1 (+Xg)" (enabled) with the ring while a countdown runs', () => {
    const scene = makeScene({ active: true, currentWave: 1, countdownMs: 12000 });
    GameScene.prototype._updateWaveButton.call(scene);
    const btn = document.getElementById('wave-btn');
    expect(btn.textContent).toBe(`▶ Send Wave 2 (+${bonusFor(12000)}g)`);
    expect(btn.disabled).toBe(false);
    expect(btn.classList.contains('cd-on')).toBe(true);
    expect(btn.dataset.secs).toBe('12');
  });

  it('scales the shown bonus by rewardMult', () => {
    const scene = makeScene({ active: true, currentWave: 1, countdownMs: 12000, rewardMult: 0.4 });
    GameScene.prototype._updateWaveButton.call(scene);
    expect(document.getElementById('wave-btn').textContent).toBe(`▶ Send Wave 2 (+${bonusFor(12000, 0.4)}g)`);
  });

  it('omits the (+Xg) suffix when the bonus floors to 0', () => {
    const scene = makeScene({ active: true, currentWave: 1, countdownMs: 100 });
    expect(bonusFor(100)).toBe(0);
    GameScene.prototype._updateWaveButton.call(scene);
    expect(document.getElementById('wave-btn').textContent).toBe('▶ Send Wave 2');
  });

  it('live enemies alone add no suffix (no countdown running)', () => {
    const enemies = [{ def: { reward: 100 }, dead: false }];
    const scene = makeScene({ active: true, currentWave: 1, enemies });
    GameScene.prototype._updateWaveButton.call(scene);
    expect(document.getElementById('wave-btn').textContent).toBe('▶ Send Wave 2');
    expect(document.getElementById('wave-btn').disabled).toBe(false);
  });
});
