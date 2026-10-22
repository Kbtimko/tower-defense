import { describe, it, expect, vi, afterEach } from 'vitest';
import { paintRoad, bakeRoad } from './RoadRenderer.js';
import { ROAD_STYLES, ROAD_PAINT } from '../data/roads.js';
import { featherSteps } from './roadMath.js';

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

// Records every stroke with the context state at the moment it was issued.
function makeCtx() {
  const strokes = [];
  const calls = [];
  const state = { strokeStyle: null, lineWidth: 1, globalAlpha: 1, lineJoin: 'miter', lineCap: 'butt', dash: [], tx: 0, ty: 0 };
  const stack = [];
  const ctx = {
    strokes, calls, state,
    save() { calls.push('save'); stack.push({ ...state }); },
    restore() { calls.push('restore'); Object.assign(state, stack.pop()); },
    translate(x, y) { state.tx += x; state.ty += y; },
    beginPath() {}, moveTo() {}, lineTo() {},
    setLineDash(d) { state.dash = [...d]; },
    createPattern(src, rep) { return { pattern: src, rep }; },
    stroke() { strokes.push({ ...state, dash: [...state.dash] }); },
  };
  for (const k of ['strokeStyle', 'lineWidth', 'globalAlpha', 'lineJoin', 'lineCap']) {
    Object.defineProperty(ctx, k, { get: () => state[k], set: (v) => { state[k] = v; } });
  }
  return ctx;
}

const curve = [{ x: 10, y: 10 }, { x: 100, y: 40 }, { x: 200, y: 20 }];
const roadKeys = Object.keys(ROAD_STYLES).filter((k) => ROAD_STYLES[k].kind === 'road');
const laneKeys = Object.keys(ROAD_STYLES).filter((k) => ROAD_STYLES[k].kind === 'lane');
const tile = { tag: 'tile' };

describe('paintRoad', () => {
  it('derives at least one road and one lane style from the data', () => {
    expect(roadKeys.length).toBeGreaterThan(0);
    expect(laneKeys.length).toBeGreaterThan(0);
  });

  for (const key of Object.keys(ROAD_STYLES)) {
    const style = ROAD_STYLES[key];

    it(`${key}: every stroke uses round joins and caps`, () => {
      const ctx = makeCtx();
      paintRoad(ctx, { curve, style, tile });
      expect(ctx.strokes.length).toBeGreaterThan(0);
      for (const s of ctx.strokes) {
        expect(s.lineJoin).toBe('round');
        expect(s.lineCap).toBe('round');
      }
    });

    it(`${key}: feather strokes come first, outermost first, at the computed widths`, () => {
      const ctx = makeCtx();
      paintRoad(ctx, { curve, style, tile });
      const steps = featherSteps(style.halfWidth, style.feather, ROAD_PAINT.featherSteps);
      expect(steps.length).toBeGreaterThan(0);
      const first = ctx.strokes.slice(0, steps.length);
      expect(first.map((s) => s.lineWidth)).toEqual(steps.map((s) => s.width));
      expect(first.map((s) => s.globalAlpha)).toEqual(steps.map((s) => s.alpha));
      for (const s of first) expect(s.strokeStyle).toBe(hex(style.edge));
    });

    it(`${key}: lane dashes drawn only when the style has a lane; dash state restored after`, () => {
      const ctx = makeCtx();
      paintRoad(ctx, { curve, style, tile });
      const dashed = ctx.strokes.filter((s) => s.dash.length > 0);
      if (style.lane) {
        expect(dashed.length).toBeGreaterThan(0);
        for (const s of dashed) expect(s.dash).toEqual([style.lane.dash, style.lane.gap]);
        expect(dashed.some((s) => s.strokeStyle === hex(style.lane.color) && s.lineWidth === style.lane.width)).toBe(true);
      } else {
        expect(dashed).toHaveLength(0);
      }
      expect(ctx.state.dash).toEqual([]);
    });

    it(`${key}: leaves the context state balanced (save/restore)`, () => {
      const ctx = makeCtx();
      paintRoad(ctx, { curve, style, tile });
      expect(ctx.calls.filter((c) => c === 'save').length).toBe(ctx.calls.filter((c) => c === 'restore').length);
      expect(ctx.state.tx).toBe(0);
      expect(ctx.state.ty).toBe(0);
    });
  }

  for (const key of roadKeys) {
    const style = ROAD_STYLES[key];
    it(`${key}: opaque base bed is exactly 2*halfWidth and is textured with the tile pattern`, () => {
      const ctx = makeCtx();
      paintRoad(ctx, { curve, style, tile });
      const bed = ctx.strokes.find((s) => s.strokeStyle === hex(style.base) && s.globalAlpha === 1);
      expect(bed).toBeDefined();
      expect(bed.lineWidth).toBe(2 * style.halfWidth);
      const textured = ctx.strokes.filter((s) => s.strokeStyle && s.strokeStyle.pattern === tile);
      expect(textured.length).toBeGreaterThan(0);
      expect(textured[0].lineWidth).toBe(2 * style.halfWidth);
      expect(textured[0].globalAlpha).toBe(Math.min(1, style.noise.contrast));
    });

    it(`${key}: edge shade is offset toward the lower-right (light from upper-left)`, () => {
      const ctx = makeCtx();
      paintRoad(ctx, { curve, style, tile });
      const shade = ctx.strokes.filter((s) => s.tx !== 0 || s.ty !== 0);
      expect(shade).toHaveLength(1);
      expect(shade[0].tx).toBe(ROAD_PAINT.light.dx);
      expect(shade[0].ty).toBe(ROAD_PAINT.light.dy);
      expect(shade[0].strokeStyle).toBe(hex(style.noise.colors[0]));
    });

    it(`${key}: no stroke ever exceeds the outermost feather width`, () => {
      const ctx = makeCtx();
      paintRoad(ctx, { curve, style, tile });
      const max = 2 * (style.halfWidth + style.feather);
      for (const s of ctx.strokes) expect(s.lineWidth).toBeLessThanOrEqual(max);
    });
  }

  it('wear lightens the centre only when wear > 0', () => {
    const style = ROAD_STYLES['planet-road'];
    const light = hex(style.noise.colors[1]);
    const withWear = makeCtx();
    paintRoad(withWear, { curve, style, tile });
    expect(withWear.strokes.some((s) => s.strokeStyle === light && s.lineWidth < 2 * style.halfWidth)).toBe(true);
    const noWear = makeCtx();
    paintRoad(noWear, { curve, style: { ...style, wear: 0 }, tile });
    expect(noWear.strokes.some((s) => s.strokeStyle === light)).toBe(false);
  });

  it('style without a lane draws no dashes', () => {
    const { lane, ...style } = ROAD_STYLES['lunar-road'];
    expect(lane).toBeDefined();
    const ctx = makeCtx();
    paintRoad(ctx, { curve, style, tile });
    expect(ctx.strokes.some((s) => s.dash.length > 0)).toBe(false);
  });

  for (const key of laneKeys) {
    const style = ROAD_STYLES[key];
    it(`${key}: kind 'lane' draws a glow corridor and no opaque bed`, () => {
      const ctx = makeCtx();
      paintRoad(ctx, { curve, style, tile });
      expect(ctx.strokes.some((s) => s.lineWidth === 2 * style.halfWidth && s.globalAlpha === 1)).toBe(false);
      expect(ctx.strokes.some((s) => s.strokeStyle && s.strokeStyle.pattern)).toBe(false);
      for (const s of ctx.strokes.filter((x) => x.dash.length === 0)) expect(s.globalAlpha).toBeLessThan(1);
    });
  }

  it('paints an untextured bed when no tile is available', () => {
    const style = ROAD_STYLES['planet-road'];
    const ctx = makeCtx();
    paintRoad(ctx, { curve, style, tile: null });
    expect(ctx.strokes.some((s) => s.strokeStyle && s.strokeStyle.pattern)).toBe(false);
    expect(ctx.strokes.some((s) => s.strokeStyle === hex(style.base) && s.lineWidth === 2 * style.halfWidth)).toBe(true);
  });

  it('draws nothing for a curve with fewer than two points', () => {
    const ctx = makeCtx();
    paintRoad(ctx, { curve: [{ x: 1, y: 1 }], style: ROAD_STYLES['planet-road'], tile });
    expect(ctx.strokes).toHaveLength(0);
  });
});

describe('bakeRoad', () => {
  afterEach(() => vi.restoreAllMocks());

  const waypoints = [{ x: 0, y: 100 }, { x: 300, y: 120 }, { x: 640, y: 80 }];
  const opts = { key: 'road_map_1', waypoints, styleKey: 'planet-road', seed: 42, width: 1280, height: 720 };

  function makeScene({ exists = false, ctx = makeCtx() } = {}) {
    const refresh = vi.fn();
    const createCanvas = vi.fn(() => ({ getContext: () => ctx, refresh }));
    return { scene: { textures: { exists: vi.fn(() => exists), createCanvas } }, createCanvas, refresh, ctx };
  }

  function stubTileCanvas() {
    const putImageData = vi.fn();
    const tileCtx = {
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData,
    };
    const canvas = { width: 0, height: 0, getContext: () => tileCtx };
    const real = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => (tag === 'canvas' ? canvas : real(tag)));
    return { canvas, putImageData };
  }

  it('reuses an existing texture key without creating a second canvas', () => {
    const { scene, createCanvas } = makeScene({ exists: true });
    expect(bakeRoad(scene, opts)).toBe('road_map_1');
    expect(createCanvas).not.toHaveBeenCalled();
  });

  it('creates the canvas at the given size, paints the road and refreshes once', () => {
    const { canvas, putImageData } = stubTileCanvas();
    const { scene, createCanvas, refresh, ctx } = makeScene();
    expect(bakeRoad(scene, opts)).toBe('road_map_1');
    expect(createCanvas).toHaveBeenCalledWith('road_map_1', 1280, 720);
    expect(canvas.width).toBe(ROAD_PAINT.tileSize);
    expect(canvas.height).toBe(ROAD_PAINT.tileSize);
    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(ctx.strokes.some((s) => s.strokeStyle && s.strokeStyle.pattern === canvas)).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('is deterministic: same seed + style yields identical tile pixels', () => {
    const { putImageData } = stubTileCanvas();
    bakeRoad(makeScene().scene, opts);
    bakeRoad(makeScene().scene, opts);
    const [a, b] = putImageData.mock.calls.map((c) => Array.from(c[0].data));
    expect(a).toEqual(b);
  });

  it('does not crash when the canvas context is unavailable (jsdom)', () => {
    const refresh = vi.fn();
    const scene = { textures: { exists: () => false, createCanvas: () => ({ getContext: () => null, refresh }) } };
    expect(bakeRoad(scene, opts)).toBe('road_map_1');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('still paints an untextured road when the tile canvas has no context', () => {
    const { scene, refresh, ctx } = makeScene();
    expect(bakeRoad(scene, opts)).toBe('road_map_1');
    expect(ctx.strokes.length).toBeGreaterThan(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
