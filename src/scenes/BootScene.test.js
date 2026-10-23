import BootScene from './BootScene.js';
import { MAPS } from '../data/maps.js';
import { STORY_SPEAKERS } from '../data/story.js';
import { portraitPath, REGISTERED_PORTRAITS, registerPortraits } from '../systems/portraitFallback.js';
import { SPRITE_MANIFEST } from '../data/sprites.js';
import { spriteTextureKey } from '../systems/spriteKeys.js';
import { backgroundUrl } from '../systems/backgroundAsset.js';
import { BACKGROUND_VARIANTS } from '../data/backgroundAssets.js';
import { BACKDROP_ART } from '../data/worldMap.js';

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

describe('BootScene', () => {
  it('preloads one image per map in MAPS', () => {
    const scene = new BootScene();
    const loaded = [];
    scene.game = { registry: { set() {} }, events: { on() {} } };
    scene.load = {
      image: (key, path) => loaded.push({ key, path }),
      spritesheet() {},
    };
    scene.preload();

    for (const m of MAPS) {
      const expectedKey = `bg_map_${m.id}`;
      // No canvas to measure in the test, so the picker falls back to full size.
      const expectedPath = backgroundUrl(m.backgroundImage, BACKGROUND_VARIANTS[0]);
      const found = loaded.find(l => l.key === expectedKey);
      expect(found).toBeDefined();
      expect(found.path).toBe(expectedPath);
    }
  });

  it('picks the backdrop variant by the MAP width, not the wider canvas', () => {
    const scene = new BootScene();
    const loaded = [];
    // 1000 CSS px of canvas would need full size; its map share (~784 px) is
    // covered by the half variant (829.5 px) at DPR 1.
    scene.game = { registry: { set() {} }, events: { on() {} }, canvas: { getBoundingClientRect: () => ({ width: 1000 }) } };
    scene.load = { image: (key, path) => loaded.push({ key, path }), spritesheet() {} };
    const dpr = window.devicePixelRatio;
    window.devicePixelRatio = 1;
    scene.preload();
    window.devicePixelRatio = dpr;
    const m = MAPS[0];
    expect(loaded.find(l => l.key === `bg_map_${m.id}`).path).toBe(backgroundUrl(m.backgroundImage, BACKGROUND_VARIANTS[1]));
  });

  it('still preloads the spark particle texture', () => {
    const scene = new BootScene();
    const loaded = [];
    scene.game = { registry: { set() {} }, events: { on() {} } };
    scene.load = { image: (key, path) => loaded.push({ key, path }), spritesheet() {} };
    scene.preload();
    expect(loaded.find(l => l.key === 'spark')).toBeDefined();
  });

  it('loads each manifest sprite state by frame count: spritesheet when animated, image when static', () => {
    const scene = new BootScene();
    const sheets = [];
    const images = [];
    scene.game = { registry: { set() {} }, events: { on() {} } };
    scene.load = {
      image: (key, path) => images.push({ key, path }),
      spritesheet: (key, path, cfg) => sheets.push({ key, path, cfg }),
    };
    scene.preload();

    for (const entry of SPRITE_MANIFEST) {
      for (const [state, def] of Object.entries(entry.states ?? {})) {
        const key = spriteTextureKey(entry.category, entry.type, state);
        if (def.frames && def.frames > 1) {
          const found = sheets.find(s => s.key === key);
          expect(found, `${key} should load as a spritesheet`).toBeDefined();
          expect(found.path).toBe(def.path);
          expect(found.cfg).toEqual({ frameWidth: def.frameWidth, frameHeight: def.frameHeight });
        } else {
          expect(images.find(i => i.key === key), `${key} should load as an image`).toBeDefined();
        }
      }
    }
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

  it("hands off to TitleScene with an object (never bare: Phaser would keep stale data)", () => {
    const scene = makeScene([]);
    const start = vi.fn();
    scene.scene = { start };
    scene.create();
    expect(start).toHaveBeenCalledWith('TitleScene', {});
  });

  it('registers every portrait once all the art exists', () => {
    const all = Object.values(STORY_SPEAKERS).map(sp => sp.portraitKey);
    makeScene(all).create();
    expect(new Set(REGISTERED_PORTRAITS)).toEqual(new Set(all));
  });
});

describe('BootScene world-map backdrop probe (deferred asset, spec 4.4)', () => {
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

  it('probes BACKDROP_ART in preload', () => {
    const { loaded } = run([]);
    expect(loaded.some(l => l.path === BACKDROP_ART)).toBe(true);
  });

  it('registers false when the art 404s (today), so the vista stays procedural', () => {
    expect(run([]).set.get('worldBackdrop')).toBe(false);
  });

  it('registers the URL once the art loads', () => {
    const { loaded } = run([]);
    const key = loaded.find(l => l.path === BACKDROP_ART).key;
    expect(run([key]).set.get('worldBackdrop')).toBe(BACKDROP_ART);
  });
});
