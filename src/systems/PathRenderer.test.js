import { renderPath, PATH_STYLES } from './PathRenderer.js';

// Whitelist of methods that actually exist on Phaser.GameObjects.Graphics.
// If a renderer calls a method NOT in here, the mock throws — this catches
// HTML-Canvas-API confusion (e.g. quadraticCurveTo) that real Phaser would
// also reject at runtime but our prior any-method-passes mock silently ignored.
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

const PATH = [
  { x: 0,   y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 200 },
];

describe('PathRenderer', () => {
  it('exports a non-empty list of string style names including the base styles', () => {
    expect(Array.isArray(PATH_STYLES)).toBe(true);
    expect(PATH_STYLES.every((s) => typeof s === 'string')).toBe(true);
    for (const base of ['planet-dust', 'station-strip', 'space-nav', 'organic-glow', 'planet-road']) {
      expect(PATH_STYLES).toContain(base);
    }
  });

  // Every registered style must render without throwing (auto-covers new styles).
  for (const style of PATH_STYLES) {
    it(`renderPath(gfx, path, '${style}') issues drawing calls without throwing`, () => {
      const gfx = makeGfx();
      expect(() => renderPath(gfx, PATH, style)).not.toThrow();
      const methods = gfx._calls().map(c => c.method);
      // Must call lineStyle and at least one path-drawing primitive.
      expect(methods).toContain('lineStyle');
      const drew = methods.some(m => m === 'strokePath' || m === 'lineBetween' || m === 'beginPath');
      expect(drew).toBe(true);
    });
  }

  const PATH3 = [
    { x: 0,   y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 200 },
  ];
  const lineStyleCount = (gfx) => gfx._calls().filter((c) => c.method === 'lineStyle').length;

  it('planet-road draws more stroke layers than planet-dust (road layers present)', () => {
    const road = makeGfx();
    const dust = makeGfx();
    renderPath(road, PATH3, 'planet-road');
    renderPath(dust, PATH3, 'planet-dust');
    // planet-road = berm + roadbed + 2 ruts + dashes (5); planet-dust = halo + main + dashes (3)
    expect(lineStyleCount(road)).toBeGreaterThan(lineStyleCount(dust));
    expect(lineStyleCount(road)).toBeGreaterThanOrEqual(5);
  });

  it('a style without road fields draws no road layers (unchanged)', () => {
    const g = makeGfx();
    renderPath(g, PATH3, 'planet-dust');
    // planet-dust = halo (1) + main (1) + dashes (1) = 3 lineStyle calls, no road layers
    expect(lineStyleCount(g)).toBe(3);
  });

  it('throws on an unknown style', () => {
    const gfx = makeGfx();
    expect(() => renderPath(gfx, PATH, 'not-a-style')).toThrow();
  });

  it('is a no-op for paths with < 2 points', () => {
    const gfx = makeGfx();
    renderPath(gfx, [{ x: 0, y: 0 }], 'planet-dust');
    expect(gfx._calls()).toHaveLength(0);
  });

  it('samples the curve into many lineTo segments (not one straight line)', () => {
    const gfx = makeGfx();
    renderPath(gfx, PATH, 'planet-dust');
    const lineTos = gfx._calls().filter(c => c.method === 'lineTo').length;
    expect(lineTos).toBeGreaterThan(20); // dense sampling, not 2-3 raw segments
  });
});
