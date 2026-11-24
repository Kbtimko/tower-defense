import { generateSoldierTierTextures } from './soldierTierTextures.js';
import { SOLDIER_RECOLOR } from '../data/tierLooks.js';
import { SPRITE_MANIFEST } from '../data/sprites.js';
import { spriteTextureKey, variantTextureKey } from './spriteKeys.js';
import { filterStages, applyColorStages } from './colorMatrix.js';
import { setRenderScale } from './renderScale.js';

const SOLDIER = SPRITE_MANIFEST.find(e => e.category === 'soldier' && e.type === 'default');
const VARIANTS = Object.keys(SOLDIER_RECOLOR);
const base = (state) => spriteTextureKey('soldier', 'default', state);
const vKey = (state, v) => variantTextureKey('soldier', 'default', state, v);

// A texture manager stand-in: createCanvas registers the key, so `exists`
// answers the way Phaser's does after a first pass.
function makeScene({ existing = [], getData } = {}) {
  const keys = new Set(existing);
  const log = [];
  const textures = {
    exists: vi.fn(key => keys.has(key)),
    get: vi.fn(() => ({ getSourceImage: () => ({ width: 96, height: 48 }) })),
    createCanvas: vi.fn((key, w, h) => {
      keys.add(key);
      return {
        key,
        draw: vi.fn(() => log.push('draw')),
        getData: vi.fn(() => {
          log.push('getData');
          return getData ? getData() : { data: new Uint8ClampedArray(w * h * 4) };
        }),
        putData: vi.fn(() => log.push('putData')),
        refresh: vi.fn(() => log.push('refresh')),
      };
    }),
    addSpriteSheet: vi.fn(() => log.push('addSpriteSheet')),
    remove: vi.fn(key => keys.delete(key)),
  };
  return { scene: { textures }, log };
}

describe('generateSoldierTierTextures', () => {
  it('adds every variant for each registered soldier state, as a spritesheet over the canvas texture', () => {
    const { scene } = makeScene();
    const { added, failed } = generateSoldierTierTextures(scene, [base('idle'), base('attack')]);

    expect(added).toHaveLength(VARIANTS.length * 2);
    expect(new Set(added)).toEqual(new Set(VARIANTS.flatMap(v => [vKey('idle', v), vKey('attack', v)])));
    expect(failed).toEqual([]);
    for (const [i, call] of scene.textures.addSpriteSheet.mock.calls.entries()) {
      const ct = scene.textures.createCanvas.mock.results[i].value;
      const state = ct.key.includes('-idle-') ? 'idle' : 'attack';
      expect(call).toEqual(['', ct, {
        frameWidth: SOLDIER.states[state].frameWidth, frameHeight: SOLDIER.states[state].frameHeight,
      }]);
    }
  });

  it('runs draw -> getData -> putData -> refresh -> addSpriteSheet, recolouring with that variant\'s params', () => {
    const pixel = [120, 90, 60, 255];
    const { scene, log } = makeScene({
      getData: () => ({ data: new Uint8ClampedArray([...pixel, 0, 0, 0, 0]) }),
    });
    generateSoldierTierTextures(scene, [base('idle')]);

    expect(log.slice(0, 5)).toEqual(['draw', 'getData', 'putData', 'refresh', 'addSpriteSheet']);
    for (const ct of scene.textures.createCanvas.mock.results.map(r => r.value)) {
      const v = ct.key.split('-').pop();
      const expected = applyColorStages(new Uint8ClampedArray([...pixel, 0, 0, 0, 0]), filterStages(SOLDIER_RECOLOR[v]));
      expect([...ct.putData.mock.calls[0][0].data]).toEqual([...expected]);
      expect(ct.getData).toHaveBeenCalledWith(0, 0, 96, 48);
    }
  });

  it('E13: only the states that loaded get variants', () => {
    const { scene } = makeScene();
    const { added } = generateSoldierTierTextures(scene, [base('idle')]);
    expect(new Set(added)).toEqual(new Set(VARIANTS.map(v => vKey('idle', v))));
  });

  it('E14: a variant key that already exists (real art) is skipped', () => {
    const { scene } = makeScene({ existing: [vKey('idle', 't4a')] });
    // Loaded real art is in the boot scan's list already, so it is not re-reported.
    const { added } = generateSoldierTierTextures(scene, [base('idle'), vKey('idle', 't4a')]);
    expect(added).not.toContain(vKey('idle', 't4a'));
    expect(added).toHaveLength(VARIANTS.length - 1);
    expect(scene.textures.createCanvas).not.toHaveBeenCalledWith(vKey('idle', 't4a'), expect.anything(), expect.anything());
  });

  // The boot scan does not find generated keys, so a second pass must re-report
  // them or spriteKeys would lose them and soldiers fall back to base art.
  it('E11: a second call (RETRY / re-entry) re-reports the keys but makes no canvas', () => {
    const { scene } = makeScene();
    const first = generateSoldierTierTextures(scene, [base('idle'), base('attack')]);
    const made = scene.textures.createCanvas.mock.calls.length;
    const second = generateSoldierTierTextures(scene, [base('idle'), base('attack')]);
    expect(second).toEqual({ added: first.added, failed: [] });
    expect(second.added).toHaveLength(VARIANTS.length * 2);
    expect(scene.textures.createCanvas.mock.calls.length).toBe(made);
  });

  it('a throw mid-pipeline removes the half-made texture, logs nothing, and the other variants still land', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = vKey('idle', 't3');
    const { scene } = makeScene();
    const createCanvas = scene.textures.createCanvas;
    scene.textures.createCanvas = vi.fn((key, w, h) => {
      const ct = createCanvas(key, w, h);
      if (key === bad) ct.getData = () => { throw new Error('tainted canvas'); };
      return ct;
    });
    try {
      const { added, failed } = generateSoldierTierTextures(scene, [base('idle')]);
      expect(failed).toEqual([bad]);
      expect(scene.textures.remove).toHaveBeenCalledWith(bad);
      expect(scene.textures.exists(bad)).toBe(false);
      expect(added).toHaveLength(VARIANTS.length - 1);
      expect(added).not.toContain(bad);
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it('a throw before any canvas exists removes nothing', () => {
    const { scene } = makeScene();
    scene.textures.get = () => { throw new Error('no base'); };
    const { added, failed } = generateSoldierTierTextures(scene, [base('idle')]);
    expect(added).toEqual([]);
    expect(failed).toHaveLength(VARIANTS.length);
    expect(scene.textures.remove).not.toHaveBeenCalled();
  });

  it('makes nothing when no soldier sheet is registered', () => {
    const { scene } = makeScene();
    expect(generateSoldierTierTextures(scene, [])).toEqual({ added: [], failed: [] });
    expect(scene.textures.createCanvas).not.toHaveBeenCalled();
  });
});

describe('generateSoldierTierTextures at render scale 2', () => {
  afterEach(() => setRenderScale(1));

  it('soldier tier textures use the resolved frame size', () => {
    setRenderScale(2);
    const { scene } = makeScene();
    generateSoldierTierTextures(scene, [base('idle')]);

    const sizes = scene.textures.addSpriteSheet.mock.calls.map(c => [c[2].frameWidth, c[2].frameHeight]);
    expect(sizes.length).toBeGreaterThan(0);
    for (const [w, h] of sizes) {
      expect(w).toBe(SOLDIER.states.idle.frameWidth * 2);
      expect(h).toBe(SOLDIER.states.idle.frameHeight * 2);
    }
  });
});
