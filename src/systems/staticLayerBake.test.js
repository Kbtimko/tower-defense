import { describe, it, expect, vi } from 'vitest';
import { createStaticBake } from './staticLayerBake.js';

// A minimal fake scene that records the calls the bake makes.
function fakeScene() {
  const calls = [];
  const existing = new Set();
  const texture = { clear: vi.fn((...a) => calls.push(['clear', ...a])) };
  const surface = {
    scale: 1,
    setScale: vi.fn(function (k) { this.scale = k; return this; }),
    generateTexture: vi.fn((...a) => calls.push(['generate', ...a])),
    destroy: vi.fn(),
  };
  const image = {
    depth: 0, displayWidth: 0, displayHeight: 0,
    setOrigin: vi.fn().mockReturnThis(),
    setDepth(d) { this.depth = d; return this; },
    setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; },
    destroy: vi.fn(),
  };
  return {
    calls, texture,
    make: { graphics: vi.fn(() => surface) },
    add: { image: vi.fn(() => image) },
    textures: {
      exists: vi.fn((k) => existing.has(k)),
      createCanvas: vi.fn((k) => { existing.add(k); return texture; }),
      remove: vi.fn((k) => existing.delete(k)),
    },
  };
}

describe('createStaticBake', () => {
  it('surface is off the display list and scaled by k; image is a k× canvas shown at world size', () => {
    const s = fakeScene();
    const b = createStaticBake(s, { width: 1280, height: 720, resolution: 2, depth: 10 });
    expect(s.make.graphics).toHaveBeenCalledWith({}, false);
    expect(b.surface.scale).toBe(2);
    expect(s.textures.createCanvas).toHaveBeenCalledWith('static_layer@2', 2560, 1440);
    expect(s.add.image).toHaveBeenCalledWith(0, 0, 'static_layer@2');
    expect(b.image.depth).toBe(10);
    expect(b.image.displayWidth).toBe(1280);
    expect(b.image.displayHeight).toBe(720);
    expect(b.image.setOrigin).toHaveBeenCalledWith(0, 0);
  });

  it('rebake clears the canvas, then generates the texture from the surface at pixel size', () => {
    const s = fakeScene();
    const b = createStaticBake(s, { width: 1280, height: 720, resolution: 2, depth: 10 });
    b.rebake();
    // update=false: clear() would otherwise getImageData the whole canvas (14.7 MB at k=2)
    // and upload it, only for generateTexture to upload again.
    expect(s.calls).toEqual([['clear', 0, 0, 2560, 1440, false], ['generate', 'static_layer@2', 2560, 1440]]);
  });

  it('destroy destroys surface and image and removes the texture', () => {
    const s = fakeScene();
    const b = createStaticBake(s, { width: 1280, height: 720, resolution: 1, depth: 10 });
    b.destroy();
    expect(b.surface.destroy).toHaveBeenCalledTimes(1);
    expect(b.image.destroy).toHaveBeenCalledTimes(1);
    expect(s.textures.remove).toHaveBeenCalledWith('static_layer@1');
  });

  it('a leftover texture under the same key is replaced, not reused', () => {
    const s = fakeScene();
    createStaticBake(s, { width: 100, height: 50, resolution: 1, depth: 10 });
    createStaticBake(s, { width: 100, height: 50, resolution: 1, depth: 10 });
    expect(s.textures.remove).toHaveBeenCalledWith('static_layer@1');
    expect(s.textures.createCanvas).toHaveBeenCalledTimes(2);
  });
});
