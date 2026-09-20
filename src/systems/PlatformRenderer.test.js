import { renderPlatforms, PLATFORM_STYLE_FOR_MAP } from './PlatformRenderer.js';

// Whitelist of methods that actually exist on Phaser.GameObjects.Graphics.
// The mock throws on anything outside the list so HTML-Canvas-API confusion
// (e.g. quadraticCurveTo) is caught at test time instead of in the browser.
const VALID_GFX_METHODS = new Set([
  'lineStyle', 'fillStyle',
  'beginPath', 'closePath', 'strokePath', 'fillPath',
  'moveTo', 'lineTo', 'lineBetween',
  'fillRect', 'strokeRect',
  'fillCircle', 'strokeCircle',
  'arc', 'setDepth', 'clear', 'destroy',
]);

function makeGfx() {
  const calls = [];
  const stored = {};
  const proxy = new Proxy(stored, {
    get(t, prop) {
      if (prop in t) return t[prop];  // expose _calls and other named members
      if (typeof prop === 'symbol') return undefined;
      if (!VALID_GFX_METHODS.has(prop)) {
        throw new TypeError(`Mock Graphics: '${prop}' is not a Phaser.GameObjects.Graphics method`);
      }
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

// A tower seated on a pad should read as seated on something, not floating —
// but the studs and the "+" build affordance are noise once the slot is taken.
describe('occupied pads', () => {
  const STUD_COUNT = 11;
  const slotAt = (occupied) => ({ cx: 100, cy: 100, radius: 22, occupied });

  it('an occupied slot draws no stud ring', () => {
    const gfx = makeGfx();
    renderPlatforms(gfx, [slotAt(true)], 0);
    const fills = gfx._calls().filter(c => c.method === 'fillCircle');
    // Shadow + platform disc only: the 22 stud fills (seam + cap each) are gone.
    expect(fills).toHaveLength(2);
  });

  it('an occupied slot draws no build marker', () => {
    const gfx = makeGfx();
    renderPlatforms(gfx, [slotAt(true)], 0);
    expect(gfx._calls().filter(c => c.method === 'lineBetween')).toHaveLength(0);
  });

  it('an occupied slot still draws a drop shadow, a platform disc and a rim', () => {
    const gfx = makeGfx();
    renderPlatforms(gfx, [slotAt(true)], 0);
    const calls = gfx._calls();
    const fills = calls.filter(c => c.method === 'fillCircle');
    expect(fills[0].args).toEqual([101, 102, 24]);           // shadow, offset + 2px
    expect(fills[1].args).toEqual([100, 100, 22 * 0.82]);    // cleared platform
    expect(calls.filter(c => c.method === 'strokeCircle')).toHaveLength(1);
  });

  it('an occupied slot rim is fainter than an empty slot rim', () => {
    const occupied = makeGfx();
    const empty = makeGfx();
    renderPlatforms(occupied, [slotAt(true)], 0);
    renderPlatforms(empty, [slotAt(false)], 0);
    const alphaOf = (gfx) => gfx._calls().filter(c => c.method === 'lineStyle')[0].args[2];
    expect(alphaOf(occupied)).toBeLessThan(alphaOf(empty));
  });

  it('an empty slot is unchanged — full stud ring and build marker', () => {
    const gfx = makeGfx();
    renderPlatforms(gfx, [slotAt(false)], 0);
    const calls = gfx._calls();
    // shadow + disc + 2 fills per stud
    expect(calls.filter(c => c.method === 'fillCircle')).toHaveLength(2 + STUD_COUNT * 2);
    expect(calls.filter(c => c.method === 'lineBetween')).toHaveLength(2);
  });
});
