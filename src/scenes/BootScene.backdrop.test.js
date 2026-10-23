import { describe, it, expect, vi } from 'vitest';
import BootScene from './BootScene.js';

// The deferred slot filled (spec 4.4): dropping art in is setting BACKDROP_ART.
// vi.hoisted: vi.mock factories run before module-level consts initialize.
const { ART } = vi.hoisted(() => ({ ART: 'assets/worldmap/vista.webp' }));
vi.mock('../data/worldMap.js', async (importOriginal) => ({ ...(await importOriginal()), BACKDROP_ART: ART }));
vi.mock('phaser', () => ({
  default: { Scene: class { constructor() {} } },
}));
vi.mock('../systems/SaveManager.js', () => ({
  SaveManager: class { getSettings() { return { ambientMotion: null }; } },
}));
vi.mock('../systems/fxTextures.js', () => ({ generateFxTextures() {} }));
vi.mock('../ui/loadingBar.js', () => ({ attachLoadingBar() {} }));
vi.mock('../systems/AudioManager.js', () => ({ getOrCreateAudioManager: () => ({ loadAssets() {} }) }));
vi.mock('../systems/AmbientBackgroundLayer.js', () => ({ resolveAmbientMotion: (saved, _) => saved ?? true }));

function run(existingTextures) {
  const scene = new BootScene();
  const set = new Map();
  const loaded = [];
  scene.game = { registry: { set: (k, v) => set.set(k, v) }, events: { on() {} } };
  scene.load = { image: (key, path) => loaded.push({ key, path }), spritesheet() {} };
  scene.textures = { exists: key => existingTextures.includes(key) };
  scene.scene = { start() {} };
  scene.preload();
  scene.create();
  return { set, loaded };
}

describe('BootScene world-map backdrop with the slot filled', () => {
  it('queues the art load', () => {
    expect(run([]).loaded.filter(l => l.path === ART)).toHaveLength(1);
  });

  it('registers false if the file 404s, so the vista stays procedural', () => {
    expect(run([]).set.get('worldBackdrop')).toBe(false);
  });

  it('registers the URL once the art loads', () => {
    const key = run([]).loaded.find(l => l.path === ART).key;
    expect(run([key]).set.get('worldBackdrop')).toBe(ART);
  });
});
