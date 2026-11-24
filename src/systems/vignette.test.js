import { describe, it, expect } from 'vitest';
import { vignetteDarkness, fillVignette, vignetteTextureKey } from './vignette.js';
import { VIGNETTE_RADIUS, VIGNETTE_DEPTH, VIGNETTE_MARGIN } from '../data/gradeSettings.js';
import { COIN_FLY, GOLD_POP } from '../data/juice.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';
import { SHAKES } from './ShakeController.js';

// Phaser's FXVignette.frag: g = sin(d / radius * 3.14 * strength)^3 inside the
// radius, 1 outside; d is measured in UV of the surface (old: the 1280x720 map).
const shader = (u, v, r, s) => {
  const d = Math.hypot(u - 0.5, v - 0.5);
  return d <= r ? Math.sin((d / r) * 3.14 * s) ** 3 : 1;
};

describe('vignetteDarkness', () => {
  it('is zero at the centre', () => {
    expect(vignetteDarkness(0.5, 0.5, VIGNETTE_RADIUS, 0.45)).toBe(0);
  });

  it('matches the Phaser shader at the map edges and corners', () => {
    for (const [u, v] of [[0, 0.5], [1, 0.5], [0.5, 0], [0, 0], [1, 1], [0.25, 0.8]]) {
      for (const s of [0.2, 0.25, 0.45]) {
        expect(vignetteDarkness(u, v, VIGNETTE_RADIUS, s)).toBeCloseTo(shader(u, v, VIGNETTE_RADIUS, s), 10);
      }
    }
  });

  it('measures distance in map UV: the left edge darkens as much as the top edge', () => {
    expect(vignetteDarkness(0, 0.5, 0.8, 0.45)).toBeCloseTo(vignetteDarkness(0.5, 0, 0.8, 0.45), 10);
    // Old map mid-side edge at strength 0.45: ~46 % darkness, not the ~26 % the
    // 1632-wide camera postFX produced.
    expect(vignetteDarkness(0, 0.5, 0.8, 0.45)).toBeCloseTo(0.4614, 3);
  });

  it('is fully dark beyond the radius', () => {
    expect(vignetteDarkness(-0.5, 0.5, 0.8, 0.45)).toBe(1);
  });
});

describe('fillVignette', () => {
  const opts = { radius: 0.8, strength: 0.45, color: 0x1a1a2e };

  it('writes the colour in RGB and the darkness as alpha at texel centres', () => {
    const w = 4, h = 2;
    const data = new Uint8ClampedArray(w * h * 4);
    fillVignette(data, w, h, { ...opts, u0: 0, u1: 1, v0: 0, v1: 1 });
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4;
        expect([data[k], data[k + 1], data[k + 2]]).toEqual([0x1a, 0x1a, 0x2e]);
        const a = shader((i + 0.5) / w, (j + 0.5) / h, 0.8, 0.45);
        expect(data[k + 3]).toBe(Math.round(a * 255));
      }
    }
  });

  it('extends the UV range past the map so a margin keeps the same falloff', () => {
    const w = 3, h = 1;
    const data = new Uint8ClampedArray(w * h * 4);
    fillVignette(data, w, h, { ...opts, u0: -0.5, u1: 1.5, v0: 0.5, v1: 0.5 });
    // Texel centres at u = -1/6, 0.5, 7/6 (v = 0.5).
    expect(data[3]).toBe(Math.round(shader(-1 / 6, 0.5, 0.8, 0.45) * 255));
    expect(data[7]).toBe(0);
    expect(data[11]).toBe(data[3]);
  });
});

describe('vignetteTextureKey', () => {
  it('is distinct per strength and colour, stable otherwise', () => {
    const k = vignetteTextureKey(0.8, 0.45, 0x1a1a2e);
    expect(vignetteTextureKey(0.8, 0.45, 0x1a1a2e)).toBe(k);
    expect(vignetteTextureKey(0.8, 0.4, 0x1a1a2e)).not.toBe(k);
    expect(vignetteTextureKey(0.8, 0.45, 0)).not.toBe(k);
  });
});

describe('vignette data contract', () => {
  it('sits above every world layer, like the camera postFX it replaces', () => {
    // 100 = DamageNumberOverlay, the topmost world text.
    expect(VIGNETTE_DEPTH).toBeGreaterThan(Math.max(100, COIN_FLY.depth, GOLD_POP.depth));
  });

  // The overlay shakes with the world; Phaser offsets by up to intensity x size.
  it('margin covers the strongest camera shake offset', () => {
    const worst = Math.max(...Object.values(SHAKES).map((s) => s.intensity));
    expect(VIGNETTE_MARGIN).toBeGreaterThanOrEqual(worst * Math.max(WORLD_WIDTH, WORLD_HEIGHT));
  });
});
