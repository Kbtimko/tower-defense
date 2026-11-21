import BootScene from './BootScene.js';
import { MAPS } from '../data/maps.js';
import { STORY_SPEAKERS } from '../data/story.js';
import { portraitPath, REGISTERED_PORTRAITS, registerPortraits } from '../systems/portraitFallback.js';
import { SPRITE_MANIFEST } from '../data/sprites.js';
import { spriteTextureKey } from '../systems/spriteKeys.js';
import { backgroundUrl } from '../systems/backgroundAsset.js';
import { BACKGROUND_VARIANTS } from '../data/backgroundAssets.js';
import { BACKDROP_ART } from '../data/worldMap.js';
import { SOLDIER_RECOLOR } from '../data/tierLooks.js';
import { setRenderScale } from '../systems/renderScale.js';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor() {} } },
}));
// The live spriteVariants.js fills up as `npm run art:apply` declares tier art, and
// this suite is part of apply's gate; every variant here is declared by the test.
vi.mock('../data/spriteVariants.js', () => ({ SPRITE_VARIANTS: {} }));
const savedSettings = vi.hoisted(() => ({ value: { ambientMotion: null } }));
vi.mock('../systems/SaveManager.js', () => ({
  SaveManager: class { getSettings() { return { ...savedSettings.value }; } },
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

describe('BootScene sprite loading by render scale', () => {
  afterEach(() => setRenderScale(1));

  function preloadSprites() {
    const scene = new BootScene();
    const sheets = [];
    const images = [];
    scene.game = { registry: { set() {} }, events: { on() {} } };
    scene.load = {
      image: (key, path) => images.push({ key, path }),
      spritesheet: (key, path, cfg) => sheets.push({ key, path, cfg }),
    };
    scene.preload();
    return { sheets, images };
  }

  it('at k=2 queues @2x sheets with doubled frames, and keeps the drone at 1x', () => {
    setRenderScale(2);
    const { sheets, images } = preloadSprites();
    // Archer idle is a single frame, so it loads as an image; attack is the sheet.
    const attack = sheets.find(s => s.key === spriteTextureKey('tower', 'archer', 'attack'));
    expect(attack.path).toBe('assets/sprites/towers/archer_attack@2x.png');
    expect(attack.cfg).toEqual({ frameWidth: 192, frameHeight: 192 });
    expect(images.find(i => i.key === spriteTextureKey('tower', 'archer', 'idle')).path)
      .toBe('assets/sprites/towers/archer_idle@2x.png');
    const drone = sheets.find(s => s.key === spriteTextureKey('enemy', 'drone', 'move'));
    const drone1x = SPRITE_MANIFEST.find(e => e.category === 'enemy' && e.type === 'drone').states.move;
    expect(drone.path).toBe(drone1x.path);
    expect(drone.cfg).toEqual({ frameWidth: drone1x.frameWidth, frameHeight: drone1x.frameHeight });
  });

  it('at k=1 queues no @2x url', () => {
    setRenderScale(1);
    const { sheets, images } = preloadSprites();
    const urls = [...sheets, ...images].map(l => l.path);
    expect(urls.filter(u => u.includes('@2x'))).toEqual([]);
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

  // The slot is empty today: queueing a load for a missing file logs
  // "Failed to process file" on every boot (the matrix fails on console errors).
  it('queues no backdrop load while the slot is empty, and registers false', () => {
    expect(BACKDROP_ART).toBeNull();
    const { loaded, set } = run([]);
    expect(loaded.some(l => l.key === 'wm_backdrop' || l.path == null)).toBe(false);
    expect(set.get('worldBackdrop')).toBe(false);
  });
});
// A filled slot (art dropped in): BootScene.backdrop.test.js.

describe('BootScene autoSend registry seed (#51)', () => {
  function seed(settings) {
    savedSettings.value = settings;
    const scene = new BootScene();
    const set = new Map();
    scene.game = { registry: { set: (k, v) => set.set(k, v) }, events: { on() {} } };
    scene.load = { image() {}, spritesheet() {} };
    try { scene.preload(); } finally { savedSettings.value = { ambientMotion: null }; }
    return set.get('autoSend');
  }

  it('a save without the key seeds autoSend true', () => {
    expect(seed({ ambientMotion: null })).toBe(true);
  });

  it('an explicit false seeds autoSend false', () => {
    expect(seed({ ambientMotion: null, autoSend: false })).toBe(false);
  });
});

describe('BootScene soldier tier textures (#49 R2, R15)', () => {
  const SOLDIER = SPRITE_MANIFEST.find(e => e.category === 'soldier' && e.type === 'default');
  const TIER_SUFFIX = /-t(1|2|3|4a|4b)$/;

  function run(existing, { variants, failGet = false } = {}) {
    const scene = new BootScene();
    const set = new Map();
    const loaded = [];
    const keys = new Set(existing);
    scene.game = { registry: { set: (k, v) => set.set(k, v) }, events: { on() {} } };
    scene.load = {
      image: (key, path) => loaded.push({ key, path }),
      spritesheet: (key, path, cfg) => loaded.push({ key, path, cfg }),
    };
    scene.textures = {
      exists: key => keys.has(key),
      get: () => {
        if (failGet) throw new Error('no source');
        return { getSourceImage: () => ({ width: 96, height: 48 }) };
      },
      createCanvas: (key, w, h) => {
        keys.add(key);
        return { draw() {}, getData: () => ({ data: new Uint8ClampedArray(w * h * 4) }), putData() {}, refresh() {} };
      },
      addSpriteSheet() {},
      remove: key => keys.delete(key),
    };
    scene.scene = { start() {} };
    if (variants) SOLDIER.variants = variants;
    try {
      scene.preload();
      scene.create();
    } finally {
      delete SOLDIER.variants;
    }
    return { set, loaded };
  }

  const baseKeys = () => SPRITE_MANIFEST.flatMap(e =>
    Object.keys(e.states ?? {}).map(st => spriteTextureKey(e.category, e.type, st)));

  it('queues no variant load while the manifest declares none (no boot 404)', () => {
    const { loaded } = run([]);
    expect(loaded.filter(l => TIER_SUFFIX.test(l.key))).toEqual([]);
  });

  it('appends the generated soldier keys AFTER the scanned manifest keys', () => {
    const scanned = baseKeys();
    const { set } = run(scanned);
    const keys = set.get('spriteKeys');
    expect(keys.slice(0, scanned.length)).toEqual(scanned);
    const generated = keys.slice(scanned.length);
    expect(generated.length).toBe(Object.keys(SOLDIER_RECOLOR).length * Object.keys(SOLDIER.states).length);
    expect(generated.every(k => k.startsWith('sprite-soldier-default-') && TIER_SUFFIX.test(k))).toBe(true);
    expect(set.get('soldierTierFailed')).toEqual([]);
  });

  it('surfaces a failed generation in the registry and keeps only the scanned keys', () => {
    const scanned = baseKeys();
    const { set } = run(scanned, { failGet: true });
    expect(set.get('spriteKeys')).toEqual(scanned);
    expect(set.get('soldierTierFailed')).toHaveLength(Object.keys(SOLDIER_RECOLOR).length * Object.keys(SOLDIER.states).length);
  });

  it('loads a declared variant state under its variant key and records it when it loaded (E14: no generated copy)', () => {
    const def = { path: 'assets/sprites/soldiers/default_idle_t4a.png', frameWidth: 48, frameHeight: 48, frames: 6, frameRate: 8 };
    const vKey = 'sprite-soldier-default-idle-t4a';
    const scanned = baseKeys();
    const { loaded, set } = run([...scanned, vKey], { variants: { t4a: { states: { idle: def } } } });

    expect(loaded.find(l => l.key === vKey)).toEqual({ key: vKey, path: def.path, cfg: { frameWidth: 48, frameHeight: 48 } });
    const keys = set.get('spriteKeys');
    expect(keys.filter(k => k === vKey)).toHaveLength(1);
    expect(keys.indexOf(vKey)).toBeLessThan(scanned.length + 1);
  });

  it('E15: a declared variant that failed to load is filled by generation', () => {
    const def = { path: 'assets/sprites/soldiers/missing.png', frameWidth: 48, frameHeight: 48, frames: 6 };
    const vKey = 'sprite-soldier-default-idle-t4a';
    const scanned = baseKeys();
    const { set } = run(scanned, { variants: { t4a: { states: { idle: def } } } });
    const keys = set.get('spriteKeys');
    expect(keys.indexOf(vKey)).toBeGreaterThanOrEqual(scanned.length);
  });
});
