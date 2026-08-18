import { describe, it, expect } from 'vitest';
import { AmbientBackgroundLayer, resolveAmbientMotion } from './AmbientBackgroundLayer.js';

function makeGfx() {
  const calls = [];
  const gfx = {
    _calls: () => calls,
    setDepth() { return gfx; },
    setBlendMode() { return gfx; },
    clear() { calls.push('clear'); return gfx; },
    fillStyle() { calls.push('fillStyle'); return gfx; },
    fillCircle() { calls.push('fillCircle'); return gfx; },
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
});
