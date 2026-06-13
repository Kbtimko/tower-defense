import { renderPlatforms, PLATFORM_STYLE_FOR_MAP } from './PlatformRenderer.js';

function makeGfx() {
  const calls = [];
  const stored = {};
  const proxy = new Proxy(stored, {
    get(t, prop) {
      if (prop in t) return t[prop];  // expose _calls and other named members
      return (...args) => { calls.push({ method: prop, args }); return proxy; };
    },
  });
  proxy._calls = () => calls;
  return proxy;
}

describe('PlatformRenderer', () => {
  it('PLATFORM_STYLE_FOR_MAP returns a string for every map id 0..9', () => {
    for (let id = 0; id <= 9; id++) {
      expect(typeof PLATFORM_STYLE_FOR_MAP(id)).toBe('string');
    }
  });

  it('renderPlatforms paints once per slot', () => {
    const gfx = makeGfx();
    const slots = [
      { cx: 100, cy: 100, radius: 22, occupied: false },
      { cx: 200, cy: 200, radius: 22, occupied: true  },
      { cx: 300, cy: 100, radius: 22, occupied: false },
    ];
    renderPlatforms(gfx, slots, 0);
    const fillCircleCalls = gfx._calls().filter(c => c.method === 'fillCircle');
    // At least one fillCircle per slot (base disc).
    expect(fillCircleCalls.length).toBeGreaterThanOrEqual(slots.length);
  });

  it('renderPlatforms is a no-op for an empty slot list', () => {
    const gfx = makeGfx();
    renderPlatforms(gfx, [], 0);
    expect(gfx._calls()).toHaveLength(0);
  });
});
