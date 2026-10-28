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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import GameScene from './GameScene.js';
import { WaveCountdown } from '../systems/waveCountdown.js';
import { WAVE_COUNTDOWN } from '../data/waveCountdown.js';

function setupBtn() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const btn = document.createElement('button');
  btn.id = 'wave-btn';
  document.body.appendChild(btn);
}

const bonusFor = (ms, rm = 1) => Math.floor((ms / 1000) * WAVE_COUNTDOWN.goldPerSecond * rm);

// countdownMs: a running countdown with that much left (null = none running).
function makeScene({ active = false, hasQueuedEnemies = false, currentWave = 1, enemies = [], rewardMult = 1, countdownMs = null } = {}) {
  const startWaveSpy = vi.fn();
  const scene = Object.create(GameScene.prototype);
  scene.waveMgr = {
    done: false,
    active,
    hasQueuedEnemies,
    currentWave,
    startWave: startWaveSpy,
  };
  scene._countdown = new WaveCountdown();
  if (countdownMs !== null) {
    scene._countdown.start(WAVE_COUNTDOWN.defaultSec * 1000, currentWave);
    scene._countdown.tick(WAVE_COUNTDOWN.defaultSec * 1000 - countdownMs);
  }
  scene.storyMgr = { hideBanner: vi.fn() };
  scene.enemies = enemies;
  scene.rewardMult = rewardMult;
  scene.economy = { earn: vi.fn() };
  scene.game = { registry: { get: () => null } };
  scene._toast = vi.fn();
  scene._updateWaveButton = vi.fn();
  scene._updateHUD = vi.fn();
  return scene;
}

beforeEach(setupBtn);

// The early bonus is time-based (spec C1): seconds left on the countdown, not
// the rewards of enemies still alive. The old alive-enemy cases are rewritten
// on purpose — that behaviour was removed, not loosened.
describe('GameScene._startWave', () => {
  it('awards the time bonus and toasts when a countdown is running', () => {
    const scene = makeScene({ active: true, countdownMs: 12000 });
    const expected = bonusFor(12000);
    expect(expected).toBeGreaterThan(0);
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).toHaveBeenCalledWith(expected);
    expect(scene._toast).toHaveBeenCalledWith(`+${expected}g`);
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
    expect(scene._countdown.running).toBe(false);
  });

  it('does not award a bonus with no countdown running (wave 1, or after a clear)', () => {
    const scene = makeScene({ active: false });
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).not.toHaveBeenCalled();
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
  });

  it('does NOT toast or earn when the bonus floors to zero', () => {
    const scene = makeScene({ active: true, countdownMs: 100 });
    expect(bonusFor(100)).toBe(0);
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).not.toHaveBeenCalled();
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
  });

  it('does NOT toast or earn for live enemies alone (no countdown running)', () => {
    const enemies = [
      { def: { reward: 100 }, dead: false },
      { def: { reward: 50 },  dead: false },
    ];
    const scene = makeScene({ active: true, enemies });
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).not.toHaveBeenCalled();
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
  });

  it('an auto-send pays nothing even with time left', () => {
    const scene = makeScene({ active: true, countdownMs: 12000 });
    GameScene.prototype._startWave.call(scene, { auto: true });
    expect(scene.economy.earn).not.toHaveBeenCalled();
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the current wave is still spawning', () => {
    const playSfx = vi.fn();
    const scene = makeScene({ active: true, hasQueuedEnemies: true });
    scene.game.registry.get = () => ({ playSfx });
    GameScene.prototype._startWave.call(scene);
    expect(scene.waveMgr.startWave).not.toHaveBeenCalled();
    expect(playSfx).not.toHaveBeenCalled();
    expect(scene._updateHUD).not.toHaveBeenCalled();
  });

  it('passes through to waveMgr.startWave between waves', () => {
    const scene = makeScene({ active: false });
    GameScene.prototype._startWave.call(scene);
    expect(scene.waveMgr.startWave).toHaveBeenCalled();
  });

  it('plays wave-start SFX when audio manager is present', () => {
    const playSfx = vi.fn();
    const scene = makeScene({ active: false });
    scene.game.registry.get = () => ({ playSfx });
    GameScene.prototype._startWave.call(scene);
    expect(playSfx).toHaveBeenCalledWith('wave-start');
  });

  it('scales the time bonus by rewardMult', () => {
    const scene = makeScene({ active: true, countdownMs: 12000, rewardMult: 0.4 });
    const expected = bonusFor(12000, 0.4);
    expect(expected).not.toBe(bonusFor(12000));
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).toHaveBeenCalledWith(expected);
    expect(scene._toast).toHaveBeenCalledWith(`+${expected}g`);
  });

  // The wave counter used to lag at the previous wave until the next kill:
  // nothing refreshed the HUD on a wave start that earned no gold.
  it('refreshes the HUD after advancing the wave', () => {
    const scene = makeScene({ active: false });
    const order = [];
    scene.waveMgr.startWave = () => order.push('startWave');
    scene._updateHUD = () => order.push('hud');
    GameScene.prototype._startWave.call(scene);
    expect(order).toEqual(['startWave', 'hud']);
  });
});
