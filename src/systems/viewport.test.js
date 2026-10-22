import { describe, it, expect } from 'vitest';
import { gameToPageCss, pageToGame } from './viewport.js';

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

describe('pageToGame', () => {
  // A 1280-wide game shown at 1036 CSS px: Phaser's displayScale is game/css.
  const scale = {
    canvasBounds: { x: 37, y: 12 },
    displayScale: { x: 1280 / 1036, y: 720 / 583 },
  };

  it('matches Phaser ScaleManager.transformX/Y: (page - bounds) * displayScale', () => {
    const p = pageToGame(scale, 555, 300);
    expect(p.x).toBeCloseTo((555 - 37) * (1280 / 1036));
    expect(p.y).toBeCloseTo((300 - 12) * (720 / 583));
  });

  it('maps the canvas corners to the game corners', () => {
    expect(pageToGame(scale, 37, 12)).toEqual({ x: 0, y: 0 });
    const br = pageToGame(scale, 37 + 1036, 12 + 583);
    expect(br.x).toBeCloseTo(1280);
    expect(br.y).toBeCloseTo(720);
  });

  it('is identity without a transform', () => {
    expect(pageToGame(undefined, 5, 6)).toEqual({ x: 5, y: 6 });
  });
});
