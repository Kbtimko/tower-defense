import { describe, it, expect, vi } from 'vitest';
import { createStaticBake } from './staticLayerBake.js';

// A minimal fake scene that records the calls the bake makes.
function fakeScene() {
  const surface = { scale: 1, setScale: vi.fn(function (k) { this.scale = k; return this; }), destroy: vi.fn() };
  const image = {
    depth: 0, displayWidth: 0, displayHeight: 0, calls: [],
    setOrigin: vi.fn().mockReturnThis(),
    setDepth(d) { this.depth = d; return this; },
    setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; },
    clear() { this.calls.push('clear'); return this; },
    draw(...a) { this.calls.push(['draw', ...a]); return this; },
    destroy: vi.fn(),
  };
  return { make: { graphics: vi.fn(() => surface) }, add: { renderTexture: vi.fn(() => image) } };
}

describe('createStaticBake', () => {
  it('surface is off the display list and scaled by k; image is k× and shown at world size', () => {
    const s = fakeScene();
    const b = createStaticBake(s, { width: 1280, height: 720, resolution: 2, depth: 10 });
    expect(s.make.graphics).toHaveBeenCalledWith({}, false);
    expect(b.surface.scale).toBe(2);
    expect(s.add.renderTexture).toHaveBeenCalledWith(0, 0, 2560, 1440);
    expect(b.image.depth).toBe(10);
    expect(b.image.displayWidth).toBe(1280);
    expect(b.image.displayHeight).toBe(720);
    expect(b.image.setOrigin).toHaveBeenCalledWith(0, 0);
  });

  it('rebake clears then draws the surface', () => {
    const b = createStaticBake(fakeScene(), { width: 1280, height: 720, resolution: 1, depth: 10 });
    b.rebake();
    expect(b.image.calls).toEqual(['clear', ['draw', b.surface, 0, 0]]);
  });

  it('destroy destroys surface and image', () => {
    const b = createStaticBake(fakeScene(), { width: 1280, height: 720, resolution: 1, depth: 10 });
    b.destroy();
    expect(b.surface.destroy).toHaveBeenCalledTimes(1);
    expect(b.image.destroy).toHaveBeenCalledTimes(1);
  });
});
