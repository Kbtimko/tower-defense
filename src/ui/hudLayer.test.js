import { describe, it, expect } from 'vitest';
import { hudLayerTransform, fitHudLayer, applyHudLayerSize, railAnchorRect, mapRectIn } from './hudLayer.js';
import { CANVAS_WIDTH, WORLD_WIDTH, WORLD_HEIGHT, RAIL_WIDTH, HUD_CELL } from '../data/layout.js';
import { PEEK_GAP_PX } from '../data/input.js';

// FIT keeps the canvas aspect; these build the canvas rect Phaser would produce.
const fitCanvas = (game) => {
  const scale = Math.min(game.width / CANVAS_WIDTH, game.height / WORLD_HEIGHT);
  const width = CANVAS_WIDTH * scale;
  const height = WORLD_HEIGHT * scale;
  return { left: game.left + (game.width - width) / 2, top: game.top + (game.height - height) / 2, width, height };
};

describe('hudLayerTransform', () => {
  it('a wide parent letterboxes left/right: layer offset in x, scale from the height', () => {
    const gameRect = { left: 0, top: 0, width: 1000, height: 300 };
    const t = hudLayerTransform({ canvasRect: fitCanvas(gameRect), gameRect, canvasWidth: CANVAS_WIDTH });
    expect(t.scale).toBeCloseTo(300 / WORLD_HEIGHT, 10);
    expect(t.left).toBeCloseTo((1000 - CANVAS_WIDTH * (300 / WORLD_HEIGHT)) / 2, 10);
    expect(t.top).toBe(0);
  });

  it('a tall parent letterboxes top/bottom: layer offset in y, scale from the width', () => {
    const gameRect = { left: 0, top: 0, width: 800, height: 800 };
    const t = hudLayerTransform({ canvasRect: fitCanvas(gameRect), gameRect, canvasWidth: CANVAS_WIDTH });
    expect(t.scale).toBeCloseTo(800 / CANVAS_WIDTH, 10);
    expect(t.left).toBe(0);
    expect(t.top).toBeCloseTo((800 - WORLD_HEIGHT * (800 / CANVAS_WIDTH)) / 2, 10);
  });

  // #game sits inside the safe-area padding, so the canvas offset is relative
  // to #game, not the page; and real phones give non-integer scales.
  it('is relative to #game (safe-area offset) and keeps non-integer scales exact', () => {
    const gameRect = { left: 47, top: 0, width: 750, height: 340 };
    const canvasRect = fitCanvas(gameRect);
    const t = hudLayerTransform({ canvasRect, gameRect, canvasWidth: CANVAS_WIDTH });
    // 750x340 is width-limited (750/1632 < 340/720): a ~0.46 scale, letterboxed top/bottom.
    expect(t.scale).toBeCloseTo(750 / CANVAS_WIDTH, 10);
    expect(t.left).toBeCloseTo(0, 10);
    expect(t.top).toBeCloseTo((340 - WORLD_HEIGHT * (750 / CANVAS_WIDTH)) / 2, 10);
    // A layer point maps onto the same page point as the canvas pixel under it.
    const railRight = RAIL_WIDTH * t.scale + t.left + gameRect.left;
    expect(railRight).toBeCloseTo(canvasRect.left + canvasRect.width * (RAIL_WIDTH / CANVAS_WIDTH), 10);
  });
});

function layerDom() {
  document.body.replaceChildren();
  const gameEl = document.createElement('div');
  gameEl.id = 'game';
  const layer = document.createElement('div');
  layer.id = 'hud-layer';
  const canvas = document.createElement('canvas');
  gameEl.append(layer, canvas);
  document.body.appendChild(gameEl);
  gameEl.getBoundingClientRect = () => ({ left: 10, top: 20, width: 844, height: 390 });
  canvas.getBoundingClientRect = () => ({ left: 10 + 1.5, top: 20 + 4.25, width: 816, height: 360 });
  return { layer, canvas };
}

describe('fitHudLayer', () => {
  it('writes one translate+scale transform placing the layer over the canvas', () => {
    const { layer, canvas } = layerDom();
    fitHudLayer(document, { canvas });
    expect(layer.style.transform).toBe(`translate(1.5px, 4.25px) scale(${816 / CANVAS_WIDTH})`);
  });

  // #game-anchored DOM (toast, banners, tower panel) positions from these.
  it('publishes the map rect on #game as CSS px custom properties', () => {
    const { canvas } = layerDom();
    fitHudLayer(document, { canvas });
    const s = document.getElementById('game').style;
    const scale = 816 / CANVAS_WIDTH;
    expect(s.getPropertyValue('--map-left')).toBe(`${1.5 + RAIL_WIDTH * scale}px`);
    expect(s.getPropertyValue('--map-top')).toBe('4.25px');
    expect(s.getPropertyValue('--map-width')).toBe(`${WORLD_WIDTH * scale}px`);
    expect(s.getPropertyValue('--map-height')).toBe(`${WORLD_HEIGHT * scale}px`);
  });

  it('is a no-op before the canvas exists or without the layer', () => {
    const { layer } = layerDom();
    expect(() => fitHudLayer(document, { canvas: null })).not.toThrow();
    expect(layer.style.transform).toBe('');
    layer.remove();
    expect(() => fitHudLayer(document, { canvas: document.querySelector('canvas') })).not.toThrow();
  });
});

describe('applyHudLayerSize', () => {
  it('publishes the layout tunables as CSS custom properties', () => {
    applyHudLayerSize(document);
    const s = document.documentElement.style;
    expect(s.getPropertyValue('--canvas-w')).toBe(`${CANVAS_WIDTH}px`);
    expect(s.getPropertyValue('--world-h')).toBe(`${WORLD_HEIGHT}px`);
    expect(s.getPropertyValue('--rail-w')).toBe(`${RAIL_WIDTH}px`);
    expect(s.getPropertyValue('--hud-cell')).toBe(`${HUD_CELL}px`);
    expect(s.getPropertyValue('--peek-gap')).toBe(`${PEEK_GAP_PX}px`);
  });
});

// A peek card opens beside the whole rail, not just the control: from a
// right-column tower it would otherwise cover the left-column one.
describe('railAnchorRect', () => {
  it("spans the control's rail horizontally and the control vertically", () => {
    document.body.replaceChildren();
    const rail = document.createElement('div');
    rail.className = 'hud-rail';
    const btn = document.createElement('button');
    rail.appendChild(btn);
    document.body.appendChild(rail);
    rail.getBoundingClientRect = () => ({ left: 753, top: 8, width: 91, height: 372 });
    btn.getBoundingClientRect = () => ({ left: 798.5, top: 96, width: 45.5, height: 45.5 });
    expect(railAnchorRect(btn)).toEqual({ left: 753, top: 96, width: 91, height: 45.5 });
  });

  it('falls back to the element rect outside a rail', () => {
    document.body.replaceChildren();
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    btn.getBoundingClientRect = () => ({ left: 5, top: 6, width: 7, height: 8 });
    expect(railAnchorRect(btn)).toEqual({ left: 5, top: 6, width: 7, height: 8 });
  });
});

// The map is the canvas minus a rail each side, in #game-local CSS px.
describe('mapRectIn', () => {
  it('offsets past the left rail and scales the world size', () => {
    const gameRect = { left: 47, top: 0, width: 750, height: 340 };
    const canvasRect = fitCanvas(gameRect);
    const scale = canvasRect.width / CANVAS_WIDTH;
    const m = mapRectIn({ gameRect, canvasRect });
    expect(m.left).toBeCloseTo(canvasRect.left - 47 + RAIL_WIDTH * scale, 10);
    expect(m.top).toBeCloseTo(canvasRect.top, 10);
    expect(m.width).toBeCloseTo(WORLD_WIDTH * scale, 10);
    expect(m.height).toBeCloseTo(WORLD_HEIGHT * scale, 10);
  });

  it('is the whole #game box when there is no canvas yet', () => {
    expect(mapRectIn({ gameRect: { left: 3, top: 4, width: 100, height: 50 }, canvasRect: null }))
      .toEqual({ left: 0, top: 0, width: 100, height: 50 });
  });
});
