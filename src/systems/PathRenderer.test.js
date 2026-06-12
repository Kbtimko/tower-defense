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
  it('exports the 4 supported style names', () => {
    expect(PATH_STYLES).toEqual(['planet-dust','station-strip','space-nav','organic-glow']);
  });

  for (const style of ['planet-dust','station-strip','space-nav','organic-glow']) {
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

  it('throws on an unknown style', () => {
    const gfx = makeGfx();
    expect(() => renderPath(gfx, PATH, 'not-a-style')).toThrow();
  });

  it('is a no-op for paths with < 2 points', () => {
    const gfx = makeGfx();
    renderPath(gfx, [{ x: 0, y: 0 }], 'planet-dust');
    expect(gfx._calls()).toHaveLength(0);
  });
});
