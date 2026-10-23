import { describe, it, expect } from 'vitest';
import { DEVICES } from '../../scripts/captureDevices.mjs';
import { ROUTE, LAYOUT } from '../data/worldMap.js';
import { MAPS } from '../data/maps.js';
import { COMPACT_MAX_HEIGHT_PX } from '../data/mobile.js';
import { layoutClass, routeFrameFor, nodeRects, worldMapProblems } from './worldMapLayout.js';

const deviceEntries = Object.entries(DEVICES);

describe('layoutClass', () => {
  it('is compact at the compact threshold and tall just above it', () => {
    expect(layoutClass({ width: 900, height: COMPACT_MAX_HEIGHT_PX })).toBe('compact');
    expect(layoutClass({ width: 900, height: COMPACT_MAX_HEIGHT_PX + 1 })).toBe('tall');
  });
});

describe('routeFrameFor', () => {
  it('sits left of the clamped card, below the top band, above the stats strip, inset by the gutter', () => {
    const viewport = { width: 1280, height: 720 };
    const c = LAYOUT.card.tall;
    const cardW = Math.min(c.max, Math.max(c.min, c.vw * viewport.width));
    const g = LAYOUT.gutter;
    expect(routeFrameFor(viewport, 'tall')).toEqual({
      x: g,
      y: LAYOUT.topBand.tall + g,
      w: viewport.width - cardW - 3 * g,
      h: viewport.height - LAYOUT.topBand.tall - LAYOUT.statsStrip.tall - 2 * g,
    });
  });

  it('clamps the card to its min and max', () => {
    const c = LAYOUT.card.compact;
    const g = LAYOUT.gutter;
    const narrow = routeFrameFor({ width: 300, height: 340 }, 'compact');
    expect(narrow.w).toBe(300 - c.min - 3 * g);
    const wide = routeFrameFor({ width: 4000, height: 340 }, 'compact');
    expect(wide.w).toBe(4000 - c.max - 3 * g);
  });

  it('has no stats strip when compact', () => {
    expect(LAYOUT.statsStrip.compact).toBe(0);
  });
});

describe('nodeRects', () => {
  it('has one rect per map, label included, the final node larger', () => {
    const frame = { x: 0, y: 0, w: 1000, h: 500 };
    const rects = nodeRects(frame, ROUTE, 'tall', LAYOUT);
    expect(rects.map(r => r.id)).toEqual(MAPS.map(m => m.id));
    const last = rects[rects.length - 1];
    expect(rects[0].h).toBe(LAYOUT.node.tall.d + LAYOUT.labelPx.tall);
    expect(last.h).toBe(LAYOUT.node.tall.final + LAYOUT.labelPx.tall);
    expect(rects[0].w).toBe(Math.max(LAYOUT.node.tall.d, LAYOUT.labelW.tall));
  });

  it('carries the node diameter d, so the touch rule measures the button, not the label box', () => {
    const rects = nodeRects({ x: 0, y: 0, w: 1000, h: 500 }, ROUTE, 'compact', LAYOUT);
    expect(rects[0].d).toBe(LAYOUT.node.compact.d);
    expect(rects[rects.length - 1].d).toBe(LAYOUT.node.compact.final);
  });

  it('compact rects carry only the stars line below the node', () => {
    const frame = { x: 0, y: 0, w: 500, h: 260 };
    const rects = nodeRects(frame, ROUTE, 'compact', LAYOUT);
    expect(rects[0].h).toBe(LAYOUT.node.compact.d + LAYOUT.labelPx.compact);
  });
});

describe('fit rule (spec 5, #41c)', () => {
  it('covers desktop1080 and every capture device', () => {
    expect(Object.keys(DEVICES)).toContain('desktop1080');
  });

  it.each(deviceEntries)('fit: no problems on %s', (_name, d) => {
    const viewport = d.viewport;
    const cls = layoutClass(viewport);
    const frame = routeFrameFor(viewport, cls);
    const nodes = nodeRects(frame, ROUTE, cls, LAYOUT);
    expect(worldMapProblems({ nodes, frame, viewport, coarse: !!d.hasTouch })).toEqual([]);
  });
});

describe('worldMapProblems', () => {
  const frame = { x: 0, y: 0, w: 400, h: 300 };
  const viewport = { width: 500, height: 400 };
  const ok = { id: 0, cx: 100, cy: 100, w: 50, h: 50 };

  it('passes a clean layout', () => {
    expect(worldMapProblems({ nodes: [ok, { id: 1, cx: 200, cy: 200, w: 50, h: 50 }], frame, viewport, coarse: true })).toEqual([]);
  });

  it('flags a synthetic overlap, an off-frame node and a 40-px coarse node', () => {
    const nodes = [
      ok,
      { id: 1, cx: 130, cy: 110, w: 50, h: 50 },  // overlaps 0
      { id: 2, cx: 398, cy: 150, w: 50, h: 50 },  // past the frame's right edge
      { id: 3, cx: 250, cy: 250, w: 40, h: 40 },  // under 44 on a coarse pointer
    ];
    const problems = worldMapProblems({ nodes, frame, viewport, coarse: true });
    expect(problems.some(p => /overlap/.test(p) && /0/.test(p) && /1/.test(p))).toBe(true);
    expect(problems.some(p => /frame/.test(p) && /2/.test(p))).toBe(true);
    expect(problems.some(p => /touch/.test(p) && /3/.test(p))).toBe(true);
  });

  it('holds the 4-px frame margin', () => {
    const edge = { id: 5, cx: 27, cy: 100, w: 50, h: 50 }; // 2 px from the left edge
    expect(worldMapProblems({ nodes: [edge], frame, viewport, coarse: false })).toEqual([expect.stringMatching(/frame/)]);
    const clear = { id: 5, cx: 29, cy: 100, w: 50, h: 50 }; // exactly 4 px
    expect(worldMapProblems({ nodes: [clear], frame, viewport, coarse: false })).toEqual([]);
  });

  it('flags a node outside the viewport', () => {
    const big = { x: 0, y: 0, w: 1000, h: 1000 };
    const out = { id: 6, cx: 600, cy: 100, w: 50, h: 50 };
    expect(worldMapProblems({ nodes: [out], frame: big, viewport, coarse: false })).toEqual([expect.stringMatching(/viewport/)]);
  });

  it('flags a 30-px node inside a 48x44 rect on a coarse pointer (the node, not its label box)', () => {
    const node = { id: 4, cx: 250, cy: 200, w: 48, h: 44, d: 30 };
    expect(worldMapProblems({ nodes: [node], frame, viewport, coarse: true }))
      .toEqual([expect.stringMatching(/node 4 touch target 30 < 44/)]);
  });

  it('skips the touch check for locked nodes and fine pointers', () => {
    const small = { id: 3, cx: 250, cy: 250, w: 40, h: 40 };
    expect(worldMapProblems({ nodes: [small], frame, viewport, coarse: false })).toEqual([]);
    expect(worldMapProblems({ nodes: [{ ...small, locked: true }], frame, viewport, coarse: true })).toEqual([]);
  });
});

