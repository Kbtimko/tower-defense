import { describe, it, expect } from 'vitest';
import { gameToPageCss, pageToGame, worldToPageCss, pageToWorld, clampPanel, placeLeftOf, placeRightOf, placeBeside, clampPanelWithin } from './viewport.js';
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

// Rail HUD peeks: a right-rail control opens its card over the map to its LEFT,
// a left-rail control to its RIGHT, both vertically centred on the control.
describe('placeLeftOf / placeRightOf', () => {
  const area = { width: 844, height: 390 };
  const size = { width: 200, height: 100 };
  const anchor = { left: 760, top: 150, width: 45, height: 45 };

  it('places left of the anchor by the gap, centred vertically', () => {
    expect(placeLeftOf({ anchor, size, area, gap: 10, margin: 6 })).toEqual({ left: 760 - 10 - 200, top: 150 + (45 - 100) / 2 });
  });
  it('places right of the anchor by the gap, centred vertically', () => {
    const a = { left: 40, top: 150, width: 45, height: 45 };
    expect(placeRightOf({ anchor: a, size, area, gap: 10, margin: 6 })).toEqual({ left: 40 + 45 + 10, top: 150 + (45 - 100) / 2 });
  });
  it('clamps the top edge for an anchor near the top', () => {
    expect(placeLeftOf({ anchor: { ...anchor, top: 0 }, size, area, gap: 10, margin: 6 }).top).toBe(6);
  });
  it('clamps the bottom edge for an anchor near the bottom', () => {
    expect(placeRightOf({ anchor: { ...anchor, left: 0, top: 380 }, size, area, gap: 10, margin: 6 }).top).toBe(390 - 100 - 6);
  });
  it('clamps horizontally when there is no room on the requested side', () => {
    expect(placeLeftOf({ anchor: { ...anchor, left: 50 }, size, area, gap: 10, margin: 6 }).left).toBe(6);
    expect(placeRightOf({ anchor: { ...anchor, left: 800 }, size, area, gap: 10, margin: 6 }).left).toBe(844 - 200 - 6);
  });
});

// The tower panel is clamped to the MAP, which sits inside #game with an offset.
describe('clampPanelWithin', () => {
  const rect = { left: 91, top: 8, width: 662, height: 372 };
  const size = { width: 170, height: 200 };
  it('keeps an in-bounds spot', () => {
    expect(clampPanelWithin({ left: 200, top: 100 }, size, rect, 6)).toEqual({ left: 200, top: 100 });
  });
  it('clamps off the right rail and the bottom letterbox', () => {
    expect(clampPanelWithin({ left: 700, top: 300 }, size, rect, 6)).toEqual({ left: 91 + 662 - 170 - 6, top: 8 + 372 - 200 - 6 });
  });
  it('clamps off the left rail and the top letterbox', () => {
    expect(clampPanelWithin({ left: 10, top: 0 }, size, rect, 6)).toEqual({ left: 91 + 6, top: 8 + 6 });
  });
});

// The radial item peek sits beside the ring's whole footprint, so it never covers an item.
describe('placeBeside', () => {
  const bounds = { left: 0, top: 0, width: 1280, height: 720 };
  const size = { width: 200, height: 100 };
  const rect = { left: 500, top: 300, width: 300, height: 300 };

  it('prefers the right of the rect, by the gap, centred vertically', () => {
    expect(placeBeside(rect, size, bounds, 10, 8)).toEqual({ left: 500 + 300 + 10, top: 300 + (300 - 100) / 2 });
  });
  it('flips to the left when the right side has no room', () => {
    const r = { ...rect, left: 900 };
    expect(placeBeside(r, size, bounds, 10, 8)).toEqual({ left: 900 - 10 - 200, top: 400 });
  });
  it('clamps vertically inside bounds with the margin', () => {
    expect(placeBeside({ ...rect, top: -40, height: 100 }, size, bounds, 10, 8).top).toBe(8);
    expect(placeBeside({ ...rect, top: 700, height: 100 }, size, bounds, 10, 8).top).toBe(720 - 100 - 8);
  });
  it('honours a bounds origin (the map inside #game)', () => {
    const b = { left: 91, top: 8, width: 662, height: 372 };
    const p = placeBeside({ left: 91 + 100, top: 8 + 50, width: 150, height: 150 }, { width: 170, height: 60 }, b, 6, 6);
    expect(p.left).toBe(91 + 100 + 150 + 6);
    expect(p.top).toBe(8 + 50 + 45);
  });
  it('stays inside bounds when neither side fits', () => {
    const b = { left: 0, top: 0, width: 300, height: 300 };
    const p = placeBeside({ left: 60, top: 60, width: 180, height: 180 }, { width: 200, height: 50 }, b, 10, 8);
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + 200).toBeLessThanOrEqual(300 - 8);
  });
});
