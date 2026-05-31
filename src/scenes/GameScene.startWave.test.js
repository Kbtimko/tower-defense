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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import GameScene from './GameScene.js';

function setupBtn() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const btn = document.createElement('button');
  btn.id = 'wave-btn';
  document.body.appendChild(btn);
}

function makeScene({ isEarlyEligible = false, active = false, currentWave = 1, enemies = [] } = {}) {
  const startWaveSpy = vi.fn();
  const scene = Object.create(GameScene.prototype);
  scene.waveMgr = {
    done: false,
    active,
    isEarlyEligible,
    currentWave,
    startWave: startWaveSpy,
  };
  scene.enemies = enemies;
  scene.economy = { earn: vi.fn() };
  scene.game = { registry: { get: () => null } };
  scene._toast = vi.fn();
  scene._updateWaveButton = vi.fn();
  return scene;
}

beforeEach(setupBtn);

describe('GameScene._startWave', () => {
  it('awards the bonus and toasts when isEarlyEligible with living enemies', () => {
    const enemies = [
      { def: { reward: 20 }, dead: false },
      { def: { reward: 55 }, dead: false },
    ];
    const scene = makeScene({ isEarlyEligible: true, active: true, enemies });
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).toHaveBeenCalledWith(37);
    expect(scene._toast).toHaveBeenCalledWith('+37g');
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
  });

  it('does not award a bonus when not earlyEligible (normal between-wave click)', () => {
    const scene = makeScene({ isEarlyEligible: false, active: false });
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).not.toHaveBeenCalled();
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
  });

  it('does NOT toast or earn when bonus would be zero (no living enemies)', () => {
    const scene = makeScene({ isEarlyEligible: true, active: true, enemies: [] });
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).not.toHaveBeenCalled();
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
  });

  it('does NOT toast or earn when only dead enemies remain (sum = 0)', () => {
    const enemies = [
      { def: { reward: 100 }, dead: true },
      { def: { reward: 50 },  dead: true },
    ];
    const scene = makeScene({ isEarlyEligible: true, active: true, enemies });
    GameScene.prototype._startWave.call(scene);
    expect(scene.economy.earn).not.toHaveBeenCalled();
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.startWave).toHaveBeenCalledTimes(1);
  });

  it('passes through to waveMgr.startWave even when between waves (no early)', () => {
    const scene = makeScene({ isEarlyEligible: false, active: false });
    GameScene.prototype._startWave.call(scene);
    expect(scene.waveMgr.startWave).toHaveBeenCalled();
  });

  it('plays wave-start SFX when audio manager is present', () => {
    const playSfx = vi.fn();
    const scene = makeScene({ isEarlyEligible: false, active: false });
    scene.game.registry.get = () => ({ playSfx });
    GameScene.prototype._startWave.call(scene);
    expect(playSfx).toHaveBeenCalledWith('wave-start');
  });
});
