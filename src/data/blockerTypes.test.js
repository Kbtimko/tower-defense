import { BLOCKER_TYPES } from './blockerTypes.js';

// Mock Phaser Graphics call recorder — never imports Phaser directly.
// The stored target holds named properties (like _calls) so the get trap
// can distinguish them from Graphics method intercepts.
function makeGfx() {
  const calls = [];
  const stored = {};
  const proxy = new Proxy(stored, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return (...args) => { calls.push({ method: prop, args }); return proxy; };
    },
  });
  proxy._calls = () => calls;
  return proxy;
}

describe('BLOCKER_TYPES', () => {
  const EXPECTED = ['crater', 'rocks', 'metal_bulkhead', 'asteroid', 'organic_spire', 'glowing_pool'];

  it('exports all 6 expected types', () => {
    for (const key of EXPECTED) expect(BLOCKER_TYPES).toHaveProperty(key);
  });

  for (const key of EXPECTED) {
    it(`${key} exposes draw(gfx, x, y, scale, tint)`, () => {
      const t = BLOCKER_TYPES[key];
      expect(typeof t.draw).toBe('function');
      expect(typeof t.defaultTint).toBe('function');
    });

    it(`${key}.draw issues fill/stroke graphics calls`, () => {
      const gfx = makeGfx();
      BLOCKER_TYPES[key].draw(gfx, 200, 200, 1, 0xffffff);
      const calls = gfx._calls();
      const methods = new Set(calls.map(c => c.method));
      // Every blocker must paint something (at least one fill or stroke op).
      const drewSomething = methods.has('fillStyle') || methods.has('lineStyle') ||
                            methods.has('fillCircle') || methods.has('fillPath') ||
                            methods.has('strokePath');
      expect(drewSomething).toBe(true);
    });

    it(`${key}.defaultTint(mapId) returns a string palette key`, () => {
      const t = BLOCKER_TYPES[key];
      expect(typeof t.defaultTint(0)).toBe('string');
    });
  }
});
