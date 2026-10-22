import { describe, it, expect, vi } from 'vitest';
import { AmbientBackgroundLayer, resolveAmbientMotion } from './AmbientBackgroundLayer.js';
import { AMBIENT_LAYERS } from '../data/ambient.js';
import { FX_FAMILIES, MAX_ELEMENTS } from './ambientFxFamilies.js';
import { SeededRandom } from './SeededRandom.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';

function makeGfx() {
  const calls = [];
  const gfx = {
    _calls: () => calls,
    depth: null,
    alpha: null,
    setDepth(d) { gfx.depth = d; return gfx; },
    setAlpha(a) { gfx.alpha = a; return gfx; },
    setBlendMode() { return gfx; },
    clear() { calls.push('clear'); return gfx; },
    fillStyle() { calls.push('fillStyle'); return gfx; },
    fillCircle(x, y, r) { calls.push('fillCircle'); gfx.circles.push([x, y, r]); return gfx; },
    circles: [],
    lineStyle() { calls.push('lineStyle'); return gfx; },
    lineBetween() { calls.push('lineBetween'); return gfx; },
    destroy() { calls.push('destroy'); return gfx; },
  };
  return gfx;
}
function makeScene(gfx, enabled) {
  return {
    scale: { width: 800, height: 600 },
    add: { graphics: () => gfx },
    registry: { get: (k) => (k === 'ambientMotion' ? enabled : undefined) },
  };
}

function makeMultiScene(enabled) {
  const gfxs = [];
  const scene = {
    scale: { width: 800, height: 600 },
    add: { graphics: () => { const g = makeGfx(); gfxs.push(g); return g; } },
    registry: { get: (k) => (k === 'ambientMotion' ? enabled : undefined) },
  };
  return { scene, gfxs };
}

describe('resolveAmbientMotion', () => {
  it('returns the saved boolean when set', () => {
    expect(resolveAmbientMotion(true, true)).toBe(true);
    expect(resolveAmbientMotion(false, false)).toBe(false);
  });
  it('falls back to the inverse of prefers-reduced-motion when unset', () => {
    expect(resolveAmbientMotion(null, true)).toBe(false);
    expect(resolveAmbientMotion(null, false)).toBe(true);
    expect(resolveAmbientMotion(undefined, true)).toBe(false);
  });
});

describe('AmbientBackgroundLayer', () => {
  // scale is the CANVAS (world + HUD rails); ambient motion fills the world only.
  it('seeds every layer over the world size, not the canvas size', () => {
    const init = vi.spyOn(FX_FAMILIES.dust, 'init');
    const { scene } = makeMultiScene(true);
    new AmbientBackgroundLayer(scene, { family: 'dust', seed: 7341 });
    expect(init).toHaveBeenCalledTimes(AMBIENT_LAYERS.length);
    for (const call of init.mock.calls) expect(call.slice(1)).toEqual([WORLD_WIDTH, WORLD_HEIGHT]);
    init.mockRestore();
  });

  it('throws on an unknown family', () => {
    expect(() => new AmbientBackgroundLayer(makeScene(makeGfx(), true), { family: 'nope', seed: 1 }))
      .toThrow(/unknown family/);
  });

  it('draws fills when motion is enabled', () => {
    const gfx = makeGfx();
    const layer = new AmbientBackgroundLayer(makeScene(gfx, true), { family: 'dust', seed: 7341 });
    layer.update(16);
    expect(gfx._calls()).toContain('fillCircle');
  });

  it('clears but does not draw when motion is disabled', () => {
    const gfx = makeGfx();
    const layer = new AmbientBackgroundLayer(makeScene(gfx, false), { family: 'dust', seed: 7341 });
    layer.update(16);
    expect(gfx._calls()).toContain('clear');
    expect(gfx._calls()).not.toContain('fillCircle');
  });

  it('destroy() destroys the gfx', () => {
    const gfx = makeGfx();
    const layer = new AmbientBackgroundLayer(makeScene(gfx, true), { family: 'dust', seed: 7341 });
    layer.destroy();
    expect(gfx._calls()).toContain('destroy');
  });

  it('creates one Graphics per layer at the data depths and alphas', () => {
    const { scene, gfxs } = makeMultiScene(true);
    new AmbientBackgroundLayer(scene, { family: 'dust', seed: 7341 });
    expect(gfxs.map((g) => g.depth)).toEqual(AMBIENT_LAYERS.map((l) => l.depth));
    expect(gfxs.map((g) => g.alpha)).toEqual(AMBIENT_LAYERS.map((l) => l.alpha));
  });

  it('seeds each layer differently', () => {
    const { scene, gfxs } = makeMultiScene(true);
    const layer = new AmbientBackgroundLayer(scene, { family: 'dust', seed: 7341 });
    layer.update(0);
    expect(gfxs[0].circles[0].slice(0, 2)).not.toEqual(gfxs[1].circles[0].slice(0, 2));
  });

  it('near layer advances faster than far for the same dt', () => {
    const { scene, gfxs } = makeMultiScene(true);
    const layer = new AmbientBackgroundLayer(scene, { family: 'dust', seed: 7341 });
    expect(layer._layers.map((l) => l.state.t)).toEqual([0, 0]);
    layer.update(100);
    const [far, near] = layer._layers.map((l) => l.state.t);
    expect(far).toBe(100 * AMBIENT_LAYERS[0].speed);
    expect(near).toBe(100 * AMBIENT_LAYERS[1].speed);
    expect(near).toBeGreaterThan(far);
    expect(gfxs).toHaveLength(2);
  });

  it('far layer draws exactly like the bare family; near scales radii by its size', () => {
    const { scene, gfxs } = makeMultiScene(true);
    new AmbientBackgroundLayer(scene, { family: 'dust', seed: 7341 }).update(50);
    const [far, near] = AMBIENT_LAYERS;
    const expected = (layer) => {
      const st = FX_FAMILIES.dust.init(new SeededRandom(7341 + layer.seedOffset), WORLD_WIDTH, WORLD_HEIGHT);
      FX_FAMILIES.dust.step(st, 50 * layer.speed);
      const g = makeGfx();
      FX_FAMILIES.dust.draw(g, st);
      return g.circles;
    };
    expect(gfxs[0].circles).toEqual(expected(far));
    const nearRef = expected(near);
    expect(gfxs[1].circles.map((c) => c[2])).toEqual(nearRef.map((c) => c[2] * near.size));
  });

  it('reduced motion clears every layer and draws nothing', () => {
    const { scene, gfxs } = makeMultiScene(false);
    new AmbientBackgroundLayer(scene, { family: 'dust', seed: 7341 }).update(16);
    for (const g of gfxs) {
      expect(g._calls()).toContain('clear');
      expect(g._calls()).not.toContain('fillCircle');
    }
  });

  it('destroy() destroys every layer Graphics', () => {
    const { scene, gfxs } = makeMultiScene(true);
    new AmbientBackgroundLayer(scene, { family: 'dust', seed: 7341 }).destroy();
    for (const g of gfxs) expect(g._calls()).toContain('destroy');
  });

  it('keeps every layer within MAX_ELEMENTS for every family', () => {
    for (const family of Object.keys(FX_FAMILIES)) {
      const { scene } = makeMultiScene(true);
      const layer = new AmbientBackgroundLayer(scene, { family, seed: 5 });
      for (const { state } of layer._layers) {
        const count = Object.values(state)
          .filter(Array.isArray)
          .reduce((n, arr) => n + arr.length, 0);
        expect(count).toBeLessThanOrEqual(MAX_ELEMENTS);
      }
    }
  });

  it('layers per the data: far depth 5, near 8.5 with alpha <= 0.6', () => {
    expect(AMBIENT_LAYERS[0].depth).toBe(5);
    expect(AMBIENT_LAYERS[1].depth).toBe(8.5);
    expect(AMBIENT_LAYERS[1].alpha).toBeLessThanOrEqual(0.6);
  });
});
