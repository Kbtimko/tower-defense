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
function makeGfx() {
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
    fam.step(s, 100);
    const gfx = makeGfx();
    expect(() => fam.draw(gfx, s)).not.toThrow();
    expect(gfx._calls().length).toBeGreaterThan(0);
  });

  it('draw emits a conduit arc (lineBetween) when a conduit is sparking', () => {
    const s = fam.init(new SeededRandom(9182), W, H);
    // Force a guaranteed spark: at t=0, sin(0 + PI/2) = 1.0 > 0.9 threshold.
    s.conduits.push({ x1: 10, y1: 10, x2: 50, y2: 50, period: 1000, phase: Math.PI / 2 });
    s.t = 0;
    const gfx = makeGfx();
    fam.draw(gfx, s);
    expect(gfx._calls().some((c) => c.method === 'lineBetween')).toBe(true);
  });
});

describe('FX_FAMILIES["bio-pulse"]', () => {
  const fam = FX_FAMILIES['bio-pulse'];

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

describe('FX_FAMILIES draw sizeMult', () => {
  const SIZE = 2;
  for (const [name, fam] of Object.entries(FX_FAMILIES)) {
    it(`${name}: sizeMult scales radii/widths and leaves positions unchanged`, () => {
      const a = fam.init(new SeededRandom(99), W, H);
      const b = fam.init(new SeededRandom(99), W, H);
      let circles = 0;
      for (let i = 0; i < 60; i++) {
        fam.step(a, 100); fam.step(b, 100);
        const g1 = makeGfx(), g2 = makeGfx();
        fam.draw(g1, a);
        fam.draw(g2, b, { sizeMult: SIZE });
        const c1 = g1._calls(), c2 = g2._calls();
        expect(c2.length).toBe(c1.length);
        c1.forEach((c, j) => {
          expect(c2[j].method).toBe(c.method);
          if (c.method === 'fillCircle') {
            circles++;
            expect(c2[j].args[0]).toBe(c.args[0]);
            expect(c2[j].args[1]).toBe(c.args[1]);
            expect(c2[j].args[2]).toBeCloseTo(c.args[2] * SIZE, 9);
          } else if (c.method === 'lineStyle') {
            expect(c2[j].args[0]).toBeCloseTo(c.args[0] * SIZE, 9);
          } else if (c.method === 'lineBetween') {
            expect(c2[j].args).toEqual(c.args);
          }
        });
      }
      expect(circles).toBeGreaterThan(0);
    });
  }

  it('electrical: spark line width is exercised and scaled', () => {
    const fam = FX_FAMILIES.electrical;
    const s = fam.init(new SeededRandom(99), W, H);
    let lines = 0;
    for (let i = 0; i < 200; i++) {
      fam.step(s, 100);
      const g = makeGfx();
      fam.draw(g, s, { sizeMult: SIZE });
      lines += g._calls().filter((c) => c.method === 'lineStyle' && c.args[0] === 2 * SIZE).length;
    }
    expect(lines).toBeGreaterThan(0);
  });
});
