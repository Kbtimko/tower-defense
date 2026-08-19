import BootScene from './BootScene.js';
import { MAPS } from '../data/maps.js';
import { STORY_SPEAKERS } from '../data/story.js';
import { portraitPath, REGISTERED_PORTRAITS, registerPortraits } from '../systems/portraitFallback.js';

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

  it('preloads one image per story speaker portrait', () => {
    const scene = new BootScene();
    const loaded = [];
    scene.game = { registry: { set() {} }, events: { on() {} } };
    scene.load = { image: (key, path) => loaded.push({ key, path }), spritesheet() {} };
    scene.preload();

    for (const sp of Object.values(STORY_SPEAKERS)) {
      const found = loaded.find(l => l.key === sp.portraitKey);
      expect(found).toBeDefined();
      expect(found.path).toBe(portraitPath(sp.portraitKey));
    }
  });
});

describe('BootScene portrait registration', () => {
  function makeScene(existingTextures) {
    const scene = new BootScene();
    scene.game = { registry: { set() {} }, events: { on() {} } };
    scene.load = { image() {}, spritesheet() {} };
    scene.textures = { exists: key => existingTextures.includes(key) };
    scene.scene = { start() {} };
    return scene;
  }

  beforeEach(() => registerPortraits([]));

  it('registers nothing when no portrait art has landed yet (today)', () => {
    makeScene([]).create();
    expect(REGISTERED_PORTRAITS.size).toBe(0);
  });

  it('registers only the portraits whose texture actually loaded', () => {
    makeScene(['portrait-rael']).create();
    expect([...REGISTERED_PORTRAITS]).toEqual(['portrait-rael']);
  });

  it('registers every portrait once all the art exists', () => {
    const all = Object.values(STORY_SPEAKERS).map(sp => sp.portraitKey);
    makeScene(all).create();
    expect(new Set(REGISTERED_PORTRAITS)).toEqual(new Set(all));
  });
});
