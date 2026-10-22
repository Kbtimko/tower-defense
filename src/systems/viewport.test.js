import { describe, it, expect } from 'vitest';
import { gameToPageCss, pageToGame, worldToPageCss, pageToWorld, clampPanel } from './viewport.js';
import { RAIL_WIDTH, CANVAS_WIDTH, WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';

describe('gameToPageCss', () => {
  it('applies displayScale and canvas offset (identity transform)', () => {
    const scale = { canvasBounds: { x: 0, y: 0 }, displayScale: { x: 1, y: 1 } };
    expect(gameToPageCss(scale, 100, 100)).toEqual({ x: 100, y: 100 });
  });

  // Phaser displayScale = game px per CSS px, so a 1280x720 game FIT to 640x360
  // has displayScale 2 and a game point lands at bounds + game / 2.
  it('divides by displayScale: canvas FIT-scaled to 0.5 maps game corner to bounds corner', () => {
    const scale = { canvasBounds: { x: 100, y: 40 }, displayScale: { x: 2, y: 2 } };
    expect(gameToPageCss(scale, 1280, 720)).toEqual({ x: 100 + 640, y: 40 + 360 });
    expect(gameToPageCss(scale, 0, 0)).toEqual({ x: 100, y: 40 });
  });

  it('round-trips with pageToGame', () => {
    const scale = {
      canvasBounds: { x: 37, y: 12 },
      displayScale: { x: 1280 / 1036, y: 720 / 583 },
    };
    for (const [gx, gy] of [[0, 0], [100, 50], [640, 360], [1280, 720], [333, 601]]) {
      const page = gameToPageCss(scale, gx, gy);
      const back = pageToGame(scale, page.x, page.y);
      expect(back.x).toBeCloseTo(gx);
      expect(back.y).toBeCloseTo(gy);
    }
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

// The map world sits RAIL_WIDTH in from the canvas's left edge (camera viewport),
// so world coords are canvas coords shifted by the rail before the FIT scale.
describe('worldToPageCss / pageToWorld', () => {
  // A 1632-wide canvas FIT into an 844x390 phone: non-1:1 and letterboxed.
  const scale = {
    canvasBounds: { x: 21, y: 4 },
    displayScale: { x: CANVAS_WIDTH / 802, y: WORLD_HEIGHT / 354 },
  };

  it('maps a world point to the canvas rect plus (x + RAIL_WIDTH) / displayScale', () => {
    const p = worldToPageCss(scale, 100, 50);
    expect(p.x).toBeCloseTo(21 + (100 + RAIL_WIDTH) / scale.displayScale.x);
    expect(p.y).toBeCloseTo(4 + 50 / scale.displayScale.y);
  });

  it('puts world x=0 at the left rail edge and x=WORLD_WIDTH at the right rail edge', () => {
    expect(worldToPageCss(scale, 0, 0).x).toBeCloseTo(21 + RAIL_WIDTH / scale.displayScale.x);
    expect(worldToPageCss(scale, WORLD_WIDTH, 0).x)
      .toBeCloseTo(21 + (CANVAS_WIDTH - RAIL_WIDTH) / scale.displayScale.x);
  });

  it('pageToWorld subtracts the rail: the canvas left edge is world x = -RAIL_WIDTH', () => {
    const p = pageToWorld(scale, 21, 4);
    expect(p.x).toBeCloseTo(-RAIL_WIDTH);
    expect(p.y).toBeCloseTo(0);
    expect(pageToWorld(scale, 21 + 802, 4).x).toBeCloseTo(WORLD_WIDTH + RAIL_WIDTH);
  });

  it('round-trips world -> page -> world', () => {
    for (const [wx, wy] of [[0, 0], [-RAIL_WIDTH, 0], [640, 360], [WORLD_WIDTH, WORLD_HEIGHT], [333, 601]]) {
      const page = worldToPageCss(scale, wx, wy);
      const back = pageToWorld(scale, page.x, page.y);
      expect(back.x).toBeCloseTo(wx);
      expect(back.y).toBeCloseTo(wy);
    }
  });

  it('keeps the rail offset when the scale transform is unavailable', () => {
    expect(worldToPageCss(undefined, 200, 300)).toEqual({ x: 200 + RAIL_WIDTH, y: 300 });
    expect(pageToWorld(undefined, 200 + RAIL_WIDTH, 300)).toEqual({ x: 200, y: 300 });
  });
});

describe('clampPanel', () => {
  const area = { width: 400, height: 200 };
  const size = { width: 170, height: 100 };

  it('leaves a panel that already fits untouched', () => {
    expect(clampPanel({ left: 50, top: 40 }, size, area, 6)).toEqual({ left: 50, top: 40 });
  });

  it('pulls a panel back from the right edge by its measured width plus margin', () => {
    expect(clampPanel({ left: 380, top: 40 }, size, area, 6).left).toBe(400 - 170 - 6);
  });

  it('pulls a panel up from the bottom edge by its measured height plus margin', () => {
    expect(clampPanel({ left: 50, top: 190 }, size, area, 6).top).toBe(200 - 100 - 6);
  });

  it('keeps the margin from the top/left when the desired spot is negative', () => {
    expect(clampPanel({ left: -20, top: -30 }, size, area, 6)).toEqual({ left: 6, top: 6 });
  });

  it('pins a panel taller than the area to the top margin', () => {
    expect(clampPanel({ left: 50, top: 80 }, { width: 170, height: 255 }, area, 6).top).toBe(6);
  });
});
