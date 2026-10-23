import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorldMapRenderer } from './WorldMapRenderer.js';
import { HAZE, TRAIL } from '../data/worldMap.js';
import { PALETTE } from '../data/theme.js';
import { splitRoute } from '../systems/worldRoute.js';

// A 2D context that records strokes (style, dash, path) and arcs; every other
// method is a no-op. `in` first, so recorded members aren't swallowed by the trap.
function recordingCtx(log) {
  let path = [];
  let dash = [];
  const target = {
    setLineDash(d) { dash = d; },
    beginPath() { path = []; },
    moveTo(x, y) { path.push({ x, y }); },
    lineTo(x, y) { path.push({ x, y }); },
    arc(x, y, r) { log.push({ op: 'arc', x, y, r, style: target.strokeStyle }); },
    stroke() { log.push({ op: 'stroke', style: target.strokeStyle, dash, path }); },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(target, {
    get: (t, p) => (p in t ? t[p] : () => {}),
    set: (t, p, v) => { t[p] = v; return true; },
  });
}

const frame = { x: 12, y: 124, w: 1000, h: 600 };
const viewport = { width: 1440, height: 900 };
const points = [{ x: 50, y: 600 }, { x: 250, y: 600 }, { x: 250, y: 300 }, { x: 900, y: 200 }];

function state(over = {}) {
  return { points, trailT: 0.4, frontR: 300, frontAlpha: 1, ship: { param: 0.3 }, hiveDim: 0, ...over };
}

describe('WorldMapRenderer', () => {
  let log;
  let raf;

  beforeEach(() => {
    log = [];
    raf = new Set();
    let next = 1;
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => { const id = next++; raf.add(id); return id; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id) => raf.delete(id)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function make() {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => recordingCtx(log));
    const r = new WorldMapRenderer({
      backdrop: document.createElement('canvas'),
      story: document.createElement('canvas'),
      maxDpr: 2,
      source: 'procedural',
    });
    r.resize(frame, viewport);
    log.length = 0;
    return r;
  }

  it('no-ops without a 2D context (jsdom)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const r = new WorldMapRenderer({
      backdrop: document.createElement('canvas'), story: document.createElement('canvas'), maxDpr: 2, source: 'procedural',
    });
    expect(() => { r.resize(frame, viewport); r.render(state()); r.destroy(); }).not.toThrow();
    expect(raf.size).toBe(0);
  });

  it('draws the travelled route solid gold up to trailT and the rest faint and dashed', () => {
    make().render(state());
    const { head, tail } = splitRoute(points, 0.4);
    const gold = log.find(e => e.op === 'stroke' && e.style === PALETTE.currency);
    const ahead = log.find(e => e.op === 'stroke' && e.style === TRAIL.ahead.color);
    expect(gold.path).toEqual(head);
    expect(gold.dash).toEqual([]);
    expect(ahead.path).toEqual(tail);
    expect(ahead.dash).toEqual(TRAIL.ahead.dash);
  });

  it('draws the front line as an arc on the hive core at frontR', () => {
    make().render(state({ frontR: 321 }));
    const hive = points[points.length - 1];
    expect(log).toContainEqual(expect.objectContaining({ op: 'arc', x: hive.x, y: hive.y, r: 321, style: HAZE.front.color }));
  });

  it('draws no front line once every sector is retaken (frontR 0)', () => {
    make().render(state({ frontR: 0 }));
    expect(log.some(e => e.op === 'arc' && e.style === HAZE.front.color)).toBe(false);
  });

  it('runs one backdrop rAF loop, and destroy() leaves none live', () => {
    const r = make();
    r.resize(frame, viewport);
    expect(raf.size).toBe(1);
    r.destroy();
    expect(raf.size).toBe(0);
  });
});
