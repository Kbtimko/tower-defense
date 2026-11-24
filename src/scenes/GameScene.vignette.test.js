// The map vignette is a world-space overlay, not a camera postFX: the camera
// now spans a canvas with HUD rails, which skewed the postFX falloff.
vi.mock('phaser', () => ({
  default: { Scene: class { constructor(key) { this._key = key; } }, GameObjects: { Container: class {} } },
}));

import { describe, it, expect, vi } from 'vitest';
import GameScene from './GameScene.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';
import {
  VIGNETTE_RADIUS, VIGNETTE_DEPTH, VIGNETTE_MARGIN, VIGNETTE_TEXTURE_SCALE,
} from '../data/gradeSettings.js';
import { vignetteTextureKey, vignetteDarkness } from '../systems/vignette.js';

const CLEAR = 0x1a1a2e;
const map = { grade: { tint: [1, 1, 1], contrast: 1, saturation: 1, brightness: 1, vignette: 0.45 } };

function makeScene({ grade = true, existing = new Set() } = {}) {
  const image = { setDisplaySize: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis() };
  const ctx2d = {
    createImageData: vi.fn((w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })),
    putImageData: vi.fn(),
  };
  const canvasTex = { getContext: () => ctx2d, refresh: vi.fn() };
  const s = Object.create(GameScene.prototype);
  Object.assign(s, {
    game: { registry: { get: (k) => (k === 'mapGrade' ? grade : undefined) }, config: { backgroundColor: { color: CLEAR } } },
    cameras: { main: { postFX: { clear: vi.fn(), addVignette: vi.fn() } } },
    textures: { exists: (k) => existing.has(k), createCanvas: vi.fn(() => canvasTex) },
    add: { image: vi.fn(() => image) },
  });
  return { s, image, ctx2d, canvasTex };
}
const backdrop = () => ({ preFX: { addColorMatrix: () => ({ set: vi.fn() }) } });

describe('map vignette overlay', () => {
  it('draws a world-space overlay over the map plus margin, at the top world depth', () => {
    const { s, image } = makeScene();
    s._applyGrade(map, backdrop());
    const key = vignetteTextureKey(VIGNETTE_RADIUS, 0.45, CLEAR);
    expect(s.add.image).toHaveBeenCalledWith(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, key);
    expect(image.setDisplaySize).toHaveBeenCalledWith(WORLD_WIDTH + 2 * VIGNETTE_MARGIN, WORLD_HEIGHT + 2 * VIGNETTE_MARGIN);
    expect(image.setDepth).toHaveBeenCalledWith(VIGNETTE_DEPTH);
    expect(s.cameras.main.postFX.addVignette).not.toHaveBeenCalled();
    expect(s._vignette).toBe(image);
  });

  it('bakes the texture once at the scaled size, in the canvas clear colour, spanning the margin in map UV', () => {
    const { s, ctx2d, canvasTex } = makeScene();
    s._applyGrade(map, backdrop());
    const w = Math.round((WORLD_WIDTH + 2 * VIGNETTE_MARGIN) * VIGNETTE_TEXTURE_SCALE);
    const h = Math.round((WORLD_HEIGHT + 2 * VIGNETTE_MARGIN) * VIGNETTE_TEXTURE_SCALE);
    expect(s.textures.createCanvas).toHaveBeenCalledWith(vignetteTextureKey(VIGNETTE_RADIUS, 0.45, CLEAR), w, h);
    const img = ctx2d.putImageData.mock.calls[0][0];
    expect([img.data[0], img.data[1], img.data[2]]).toEqual([0x1a, 0x1a, 0x2e]);
    // The centre texel is clear; the corner texel (outside the map) is darkest.
    const centre = (Math.floor(h / 2) * w + Math.floor(w / 2)) * 4 + 3;
    expect(img.data[centre]).toBeLessThan(3);
    const u0 = -VIGNETTE_MARGIN / WORLD_WIDTH, u1 = 1 + VIGNETTE_MARGIN / WORLD_WIDTH;
    const v0 = -VIGNETTE_MARGIN / WORLD_HEIGHT, v1 = 1 + VIGNETTE_MARGIN / WORLD_HEIGHT;
    const corner = vignetteDarkness(u0 + (0.5 / w) * (u1 - u0), v0 + (0.5 / h) * (v1 - v0), VIGNETTE_RADIUS, 0.45);
    expect(img.data[3]).toBe(Math.round(corner * 255));
    expect(canvasTex.refresh).toHaveBeenCalled();
  });

  it('reuses a baked texture on replay', () => {
    const key = vignetteTextureKey(VIGNETTE_RADIUS, 0.45, CLEAR);
    const { s } = makeScene({ existing: new Set([key]) });
    s._applyGrade(map, backdrop());
    expect(s.textures.createCanvas).not.toHaveBeenCalled();
    expect(s.add.image).toHaveBeenCalledWith(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, key);
  });

  it('follows the grade gates: off setting, no preFX (Canvas), or no vignette add nothing', () => {
    for (const [opts, m, bd] of [
      [{ grade: false }, map, backdrop()],
      [{}, map, { preFX: null }],
      [{}, { grade: { ...map.grade, vignette: 0 } }, backdrop()],
    ]) {
      const { s } = makeScene(opts);
      s._vignette = { stale: true };
      s._applyGrade(m, bd);
      expect(s.add.image).not.toHaveBeenCalled();
      expect(s._vignette).toBeNull();
    }
  });
});
