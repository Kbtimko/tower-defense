import { describe, it, expect } from 'vitest';
import { gameToPageCss } from './viewport.js';

describe('gameToPageCss', () => {
  it('applies displayScale and canvas offset (identity transform)', () => {
    const scale = { canvasBounds: { x: 0, y: 0 }, displayScale: { x: 1, y: 1 } };
    expect(gameToPageCss(scale, 100, 100)).toEqual({ x: 100, y: 100 });
  });

  it('scales up when the display is larger than the design resolution', () => {
    const scale = { canvasBounds: { x: 0, y: 0 }, displayScale: { x: 1.5, y: 1.5 } };
    expect(gameToPageCss(scale, 100, 100)).toEqual({ x: 150, y: 150 });
  });

  it('scales down when the display is smaller', () => {
    const scale = { canvasBounds: { x: 0, y: 0 }, displayScale: { x: 0.5, y: 0.5 } };
    expect(gameToPageCss(scale, 200, 200)).toEqual({ x: 100, y: 100 });
  });

  it('adds the letterbox offset from canvasBounds', () => {
    const scale = { canvasBounds: { x: 215, y: 30 }, displayScale: { x: 1, y: 1 } };
    expect(gameToPageCss(scale, 100, 50)).toEqual({ x: 315, y: 80 });
  });

  it('returns coords unchanged when the scale transform is unavailable', () => {
    expect(gameToPageCss({}, 200, 300)).toEqual({ x: 200, y: 300 });
    expect(gameToPageCss(undefined, 200, 300)).toEqual({ x: 200, y: 300 });
  });
});
