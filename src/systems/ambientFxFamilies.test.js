import { describe, it, expect } from 'vitest';
import { FX_FAMILIES, MAX_ELEMENTS } from './ambientFxFamilies.js';
import { SeededRandom } from './SeededRandom.js';

// Mirrors the gfx-proxy mock in PathRenderer.test.js: any method NOT in the
// whitelist throws, catching Canvas-API confusion that real Phaser would reject.
const VALID_GFX_METHODS = new Set([
  'lineStyle', 'fillStyle', 'beginPath', 'closePath', 'strokePath', 'fillPath',
  'moveTo', 'lineTo', 'lineBetween', 'fillRect', 'strokeRect',
  'fillCircle', 'strokeCircle', 'arc', 'setDepth', 'setBlendMode', 'clear', 'destroy',
]);
export function makeGfx() {
  const calls = [];
  const stored = {};
  const proxy = new Proxy(stored, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop === 'symbol') return undefined;
      if (!VALID_GFX_METHODS.has(prop)) {
        throw new TypeError(`Mock Graphics: '${String(prop)}' is not a Graphics method`);
      }
      return (...args) => { calls.push({ method: prop, args }); return proxy; };
    },
  });
  proxy._calls = () => calls;
  return proxy;
}

const W = 800, H = 600;

describe('FX_FAMILIES.dust', () => {
  const fam = FX_FAMILIES.dust;

  it('init is deterministic for a given seed', () => {
    const a = fam.init(new SeededRandom(7341), W, H);
    const b = fam.init(new SeededRandom(7341), W, H);
    expect(a).toEqual(b);
  });

  it('produces no more than MAX_ELEMENTS drawables', () => {
    const s = fam.init(new SeededRandom(7341), W, H);
    expect(s.motes.length).toBeLessThanOrEqual(MAX_ELEMENTS);
  });

  it('step advances time and keeps motes in bounds', () => {
    const s = fam.init(new SeededRandom(7341), W, H);
    for (let i = 0; i < 500; i++) fam.step(s, 16);
    expect(s.t).toBeGreaterThan(0);
    for (const m of s.motes) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThanOrEqual(W);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeLessThanOrEqual(H);
    }
  });

  it('draw issues only whitelisted gfx calls', () => {
    const s = fam.init(new SeededRandom(7341), W, H);
    const gfx = makeGfx();
    expect(() => fam.draw(gfx, s)).not.toThrow();
    expect(gfx._calls().length).toBeGreaterThan(0);
  });
});
