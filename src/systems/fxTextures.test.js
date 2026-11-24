import { describe, it, expect, vi } from 'vitest';
import { FX_TEXTURES, generateFxTextures } from './fxTextures.js';

function stubCtx() {
  const noop = () => {};
  return {
    createRadialGradient: () => ({ addColorStop: noop }),
    beginPath: noop, arc: noop, fill: noop, stroke: noop, moveTo: noop,
    lineTo: noop, closePath: noop, fillRect: noop, save: noop, restore: noop,
    translate: noop, scale: noop, ellipse: noop,
    fillStyle: '', strokeStyle: '', lineWidth: 0, globalAlpha: 1,
    shadowBlur: 0, shadowColor: '',
  };
}

function stubScene(existing = []) {
  const made = [];
  const scene = {
    textures: {
      exists: key => existing.includes(key),
      createCanvas: vi.fn((key) => {
        const tex = { key, getContext: () => stubCtx(), refresh: vi.fn() };
        made.push(tex);
        return tex;
      }),
    },
  };
  return { scene, made };
}

describe('FX_TEXTURES', () => {
  it('has exactly the six spec keys, unique', () => {
    const keys = FX_TEXTURES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(
      ['fx-ember', 'fx-glow', 'fx-ring', 'fx-shard', 'fx-smoke', 'fx-spark']);
  });

  it.each(FX_TEXTURES.map(t => [t.key, t]))('%s draws on a 2D context without throwing', (_k, spec) => {
    expect(() => spec.draw(stubCtx(), spec.size)).not.toThrow();
  });
});

describe('generateFxTextures', () => {
  it('creates, draws and refreshes each texture once', () => {
    const { scene, made } = stubScene();
    const spies = FX_TEXTURES.map(t => vi.spyOn(t, 'draw'));
    generateFxTextures(scene);
    expect(scene.textures.createCanvas).toHaveBeenCalledTimes(FX_TEXTURES.length);
    FX_TEXTURES.forEach((t, i) => {
      expect(scene.textures.createCanvas).toHaveBeenCalledWith(t.key, t.size, t.size);
      expect(spies[i]).toHaveBeenCalledTimes(1);
    });
    made.forEach(tex => expect(tex.refresh).toHaveBeenCalledTimes(1));
    spies.forEach(s => s.mockRestore());
  });

  it('skips keys that already exist (idempotent)', () => {
    const existing = [FX_TEXTURES[0].key];
    const { scene } = stubScene(existing);
    generateFxTextures(scene);
    expect(scene.textures.createCanvas).toHaveBeenCalledTimes(FX_TEXTURES.length - 1);
    expect(scene.textures.createCanvas).not.toHaveBeenCalledWith(existing[0], expect.anything(), expect.anything());
  });
});
