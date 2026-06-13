import BootScene from './BootScene.js';
import { MAPS } from '../data/maps.js';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor() {} } },
}));
vi.mock('../systems/SaveManager.js', () => ({
  SaveManager: class { getSettings() { return { ambientMotion: null }; } },
}));
vi.mock('../systems/AudioManager.js', () => ({ getOrCreateAudioManager: () => ({ loadAssets() {} }) }));
vi.mock('../systems/AmbientBackgroundLayer.js', () => ({ resolveAmbientMotion: (saved, _) => saved ?? true }));

describe('BootScene', () => {
  it('preloads one image per map in MAPS', () => {
    const scene = new BootScene();
    const loaded = [];
    scene.game = { registry: { set() {} }, events: { on() {} } };
    scene.load = {
      image: (key, path) => loaded.push({ key, path }),
    };
    scene.preload();

    for (const m of MAPS) {
      const expectedKey = `bg_map_${m.id}`;
      const expectedPath = `assets/backgrounds/${m.backgroundImage}`;
      const found = loaded.find(l => l.key === expectedKey);
      expect(found).toBeDefined();
      expect(found.path).toBe(expectedPath);
    }
  });

  it('still preloads the spark particle texture', () => {
    const scene = new BootScene();
    const loaded = [];
    scene.game = { registry: { set() {} }, events: { on() {} } };
    scene.load = { image: (key, path) => loaded.push({ key, path }) };
    scene.preload();
    expect(loaded.find(l => l.key === 'spark')).toBeDefined();
  });
});
