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

describe('FX_FAMILIES.embers', () => {
  const fam = FX_FAMILIES.embers;
  const W = 800, H = 600;

  it('init is deterministic for a given seed', () => {
    expect(fam.init(new SeededRandom(6391), W, H))
      .toEqual(fam.init(new SeededRandom(6391), W, H));
  });

  it('respects MAX_ELEMENTS', () => {
    const s = fam.init(new SeededRandom(6391), W, H);
    expect(s.embers.length).toBeLessThanOrEqual(MAX_ELEMENTS);
  });

  it('embers rise and respawn within vertical bounds', () => {
    const s = fam.init(new SeededRandom(6391), W, H);
    for (let i = 0; i < 2000; i++) fam.step(s, 16);
    for (const e of s.embers) {
      expect(e.y).toBeGreaterThanOrEqual(-10);
      expect(e.y).toBeLessThanOrEqual(H + 10);
    }
  });

  it('draw issues only whitelisted gfx calls', () => {
    const s = fam.init(new SeededRandom(6391), W, H);
    const gfx = makeGfx();
    expect(() => fam.draw(gfx, s)).not.toThrow();
    expect(gfx._calls().length).toBeGreaterThan(0);
  });
});

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

describe('FX_FAMILIES.stars', () => {
  const fam = FX_FAMILIES.stars;
  const W = 800, H = 600;

  it('init is deterministic for a given seed', () => {
    expect(fam.init(new SeededRandom(6453), W, H))
      .toEqual(fam.init(new SeededRandom(6453), W, H));
  });

  it('total points respect MAX_ELEMENTS', () => {
    const s = fam.init(new SeededRandom(6453), W, H);
    expect(s.far.length + s.near.length).toBeLessThanOrEqual(MAX_ELEMENTS);
  });

  it('drift keeps stars horizontally in bounds', () => {
    const s = fam.init(new SeededRandom(6453), W, H);
    for (let i = 0; i < 800; i++) fam.step(s, 16);
    for (const p of [...s.far, ...s.near]) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(W);
    }
  });

  it('draw issues only whitelisted gfx calls', () => {
    const s = fam.init(new SeededRandom(6453), W, H);
    const gfx = makeGfx();
    expect(() => fam.draw(gfx, s)).not.toThrow();
    expect(gfx._calls().length).toBeGreaterThan(0);
  });
});

describe('FX_FAMILIES.electrical', () => {
  const fam = FX_FAMILIES.electrical;
  const W = 800, H = 600;

  it('init is deterministic for a given seed', () => {
    expect(fam.init(new SeededRandom(9182), W, H))
      .toEqual(fam.init(new SeededRandom(9182), W, H));
  });

  it('respects MAX_ELEMENTS', () => {
    const s = fam.init(new SeededRandom(9182), W, H);
    expect(s.lights.length + s.conduits.length).toBeLessThanOrEqual(MAX_ELEMENTS);
  });

  it('step advances time', () => {
    const s = fam.init(new SeededRandom(9182), W, H);
    fam.step(s, 100);
    expect(s.t).toBe(100);
  });

  it('draw issues only whitelisted gfx calls', () => {
    const s = fam.init(new SeededRandom(9182), W, H);
    // Advance far enough that at least one conduit spark is firing.
    for (let i = 0; i < 200; i++) fam.step(s, 16);
    const gfx = makeGfx();
    expect(() => fam.draw(gfx, s)).not.toThrow();
    expect(gfx._calls().length).toBeGreaterThan(0);
  });
});

describe('FX_FAMILIES["bio-pulse"]', () => {
  const fam = FX_FAMILIES['bio-pulse'];
  const W = 800, H = 600;

  it('init is deterministic for a given seed', () => {
    expect(fam.init(new SeededRandom(4827), W, H))
      .toEqual(fam.init(new SeededRandom(4827), W, H));
  });

  it('respects MAX_ELEMENTS', () => {
    const s = fam.init(new SeededRandom(4827), W, H);
    expect(s.blobs.length).toBeLessThanOrEqual(MAX_ELEMENTS);
  });

  it('blobs drift horizontally in bounds', () => {
    const s = fam.init(new SeededRandom(4827), W, H);
    for (let i = 0; i < 1000; i++) fam.step(s, 16);
    for (const b of s.blobs) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(W);
    }
  });

  it('draw issues only whitelisted gfx calls', () => {
    const s = fam.init(new SeededRandom(4827), W, H);
    const gfx = makeGfx();
    expect(() => fam.draw(gfx, s)).not.toThrow();
    expect(gfx._calls().length).toBeGreaterThan(0);
  });
});
