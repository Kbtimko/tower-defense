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

import { describe, it, expect, vi } from 'vitest';
import GameScene from './GameScene.js';

function makeScene({ killGoldMult = 1, rewardMult = 1 } = {}) {
  const scene = Object.create(GameScene.prototype);
  scene.killGoldMult = killGoldMult;
  scene.rewardMult = rewardMult;
  return scene;
}

describe('GameScene._killReward', () => {
  it('returns reward unchanged when both multipliers are 1', () => {
    const scene = makeScene();
    expect(GameScene.prototype._killReward.call(scene, 22)).toBe(22);
  });

  it('scales by rewardMult and rounds', () => {
    const scene = makeScene({ rewardMult: 0.3 });
    // 100 * 1 * 0.3 = 30
    expect(GameScene.prototype._killReward.call(scene, 100)).toBe(30);
  });

  it('composes killGoldMult and rewardMult by multiplication, rounded', () => {
    const scene = makeScene({ killGoldMult: 1.5, rewardMult: 0.4 });
    // 22 * 1.5 * 0.4 = 13.2 -> 13
    expect(GameScene.prototype._killReward.call(scene, 22)).toBe(13);
  });
});
