import { describe, it, expect } from 'vitest';
import { DEVICES } from '../../scripts/captureDevices.mjs';
import { ROUTE, LAYOUT, SHIP, HAZE } from '../data/worldMap.js';
import { MAPS } from '../data/maps.js';
import { layoutClass, routeFrameFor, nodeRects } from './worldMapLayout.js';
import { routePoints, routeParamAt, frontRadius, splitRoute, parkShip } from './worldRoute.js';

const frame = { x: 10, y: 20, w: 800, h: 500 };

describe('routePoints', () => {
  it('is Earth then one point per map, mapped into the frame', () => {
    const pts = routePoints(frame, ROUTE);
    expect(pts).toHaveLength(MAPS.length + 1);
    expect(pts[0]).toEqual({ x: frame.x + ROUTE.earth[0] * frame.w, y: frame.y + ROUTE.earth[1] * frame.h });
    const n0 = ROUTE.nodes[MAPS[0].id];
    expect(pts[1]).toEqual({ x: frame.x + n0[0] * frame.w, y: frame.y + n0[1] * frame.h });
  });
});

describe('front-line consistency (spec 5)', () => {
  it.each(Object.entries(DEVICES))('distance to hive strictly decreases Earth -> node 9 on %s', (_name, d) => {
    const cls = layoutClass(d.viewport);
    const pts = routePoints(routeFrameFor(d.viewport, cls), ROUTE);
    const hive = pts[pts.length - 1];
    const dist = pts.map(p => Math.hypot(hive.x - p.x, hive.y - p.y));
    for (let i = 1; i < dist.length; i++) expect(dist[i]).toBeLessThan(dist[i - 1]);
  });

  // While the hive is the frontier the haze is held at HAZE.minRadiusPx; node 9
  // (point 9) is retaken by then, so even the haze's feathered edge stops short of it.
  it.each(Object.entries(DEVICES))('the minimum haze (feather included) stops short of node 9 on %s', (_name, d) => {
    const cls = layoutClass(d.viewport);
    const pts = routePoints(routeFrameFor(d.viewport, cls), ROUTE);
    const hive = pts[pts.length - 1];
    const node9 = pts[pts.length - 2];
    expect(HAZE.minRadiusPx).toBeGreaterThan(0);
    expect(HAZE.minRadiusPx + HAZE.featherPx / 2).toBeLessThan(Math.hypot(hive.x - node9.x, hive.y - node9.y));
  });
});

describe('frontRadius', () => {
  const pts = routePoints(frame, ROUTE);
  const hive = pts[pts.length - 1];

  it('at frontier 0 is the distance from the hive to map 0', () => {
    expect(frontRadius(pts, 0)).toBeCloseTo(Math.hypot(hive.x - pts[1].x, hive.y - pts[1].y));
  });

  it('mid-campaign is the distance to the frontier map, and shrinks as the front advances', () => {
    expect(frontRadius(pts, 4)).toBeCloseTo(Math.hypot(hive.x - pts[5].x, hive.y - pts[5].y));
    expect(frontRadius(pts, 5)).toBeLessThan(frontRadius(pts, 4));
  });

  it('is held at HAZE.minRadiusPx while the hive (on the route) is the frontier', () => {
    expect(frontRadius(pts, MAPS.length - 1)).toBe(HAZE.minRadiusPx);
  });

  it('is 0 once every map is cleared', () => {
    expect(frontRadius(pts, MAPS.length)).toBe(0);
  });
});

describe('routeParamAt', () => {
  const pts = routePoints(frame, ROUTE);

  it('is 0 at Earth and 1 at the hive core', () => {
    expect(routeParamAt(pts, 0)).toBe(0);
    expect(routeParamAt(pts, pts.length - 1)).toBe(1);
  });

  it('strictly increases along the route', () => {
    for (let i = 1; i < pts.length; i++) expect(routeParamAt(pts, i)).toBeGreaterThan(routeParamAt(pts, i - 1));
  });

  it('is the arc-length fraction, not the index fraction', () => {
    const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 40, y: 0 }];
    expect(routeParamAt(line, 1)).toBeCloseTo(0.25);
  });
});

describe('ROUTE data', () => {
  it('has a node for every map id', () => {
    for (const m of MAPS) expect(ROUTE.nodes[m.id]).toHaveLength(2);
  });

  it('LAYOUT carries the spec node sizes and guards', () => {
    expect(LAYOUT.node).toEqual({ tall: { d: 56, final: 64 }, compact: { d: 44, final: 50 } });
    expect(LAYOUT.inputGuardMs).toBe(250);
    expect(LAYOUT.maxCanvasDpr).toBe(2);
  });
});

describe('splitRoute', () => {
  // An L: 30 px right, then 10 px down (total 40).
  const L = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }];

  it('splits by arc length: head ends where tail starts, at the interpolated point', () => {
    const { head, tail, at } = splitRoute(L, 0.5);
    expect(at).toEqual({ x: 20, y: 0 });
    expect(head).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }]);
    expect(tail).toEqual([{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }]);
  });

  it('crosses a vertex: the head keeps every vertex before the split', () => {
    const { head, tail, angle } = splitRoute(L, 0.875);
    expect(head).toEqual([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 5 }]);
    expect(tail).toEqual([{ x: 30, y: 5 }, { x: 30, y: 10 }]);
    expect(angle).toBeCloseTo(Math.PI / 2);
  });

  it('t = 0 is all tail and faces the first leg; t = 1 is all head and faces the last leg', () => {
    const start = splitRoute(L, 0);
    expect(start.head).toEqual([{ x: 0, y: 0 }]);
    expect(start.tail).toEqual(L);
    expect(start.angle).toBeCloseTo(0);
    const end = splitRoute(L, 1);
    expect(end.head).toEqual(L);
    expect(end.tail).toEqual([{ x: 30, y: 10 }]);
    expect(end.angle).toBeCloseTo(Math.PI / 2);
  });

  it('clamps out-of-range and NaN params instead of drawing garbage', () => {
    expect(splitRoute(L, 2).at).toEqual({ x: 30, y: 10 });
    expect(splitRoute(L, -1).at).toEqual({ x: 0, y: 0 });
    expect(splitRoute(L, NaN).at).toEqual({ x: 0, y: 0 });
  });
});

describe('parkShip (V1: the parked ship overlaps no node)', () => {
  const box = (pts, park) => {
    const { at, angle } = splitRoute(pts, park.param);
    const x = at.x - Math.sin(angle) * park.offset;
    const y = at.y + Math.cos(angle) * park.offset;
    const h = SHIP.sizePx / 2;
    return { l: x - h, r: x + h, t: y - h, b: y + h };
  };
  const hits = (b, n) => b.l < n.cx + n.w / 2 && n.cx - n.w / 2 < b.r && b.t < n.cy + n.h / 2 && n.cy - n.h / 2 < b.b;

  it.each(Object.entries(DEVICES))('clears every node rect and stays in the frame, for every frontier, on %s', (_name, d) => {
    const cls = layoutClass(d.viewport);
    const frame = routeFrameFor(d.viewport, cls);
    const pts = routePoints(frame, ROUTE);
    const rects = nodeRects(frame, ROUTE, cls, LAYOUT);
    for (let frontier = 0; frontier <= MAPS.length; frontier++) {
      const idx = Math.min(frontier, MAPS.length - 1) + 1;
      const park = parkShip(pts, idx, rects, frame);
      const b = box(pts, park);
      const hit = rects.filter(n => hits(b, n)).map(n => n.id);
      expect(hit, `frontier ${frontier}`).toEqual([]);
      expect(b.l >= frame.x && b.r <= frame.x + frame.w && b.t >= frame.y && b.b <= frame.y + frame.h, `frontier ${frontier} in frame`).toBe(true);
    }
  });

  it('stays on the route (offset 0) when stepping back along the incoming leg is enough', () => {
    const pts = [{ x: 0, y: 100 }, { x: 300, y: 100 }];
    const rects = [{ id: 0, cx: 300, cy: 110, w: 60, h: 60 }];
    const park = parkShip(pts, 1, rects, { x: -50, y: 0, w: 400, h: 200 });
    expect(park.offset).toBe(0);
    // Box right edge clears the rect's left edge (270) by the clearance.
    expect(park.param * 300 + SHIP.sizePx / 2 + SHIP.clearPx).toBeLessThanOrEqual(270 + SHIP.stepPx);
    expect(park.param * 300 + SHIP.sizePx / 2).toBeLessThanOrEqual(270);
  });

  it('steps sideways when the whole incoming leg is covered by node rects', () => {
    const pts = [{ x: 100, y: 0 }, { x: 100, y: 60 }];
    const rects = [{ id: 0, cx: 100, cy: 5, w: 40, h: 50 }, { id: 1, cx: 100, cy: 65, w: 40, h: 50 }];
    const park = parkShip(pts, 1, rects, { x: 0, y: -40, w: 200, h: 160 });
    expect(park.offset).not.toBe(0);
    expect(Math.abs(park.offset)).toBeGreaterThanOrEqual(20 + SHIP.sizePx / 2);
  });

  it('picks the side that keeps the ship inside the frame', () => {
    const pts = [{ x: 100, y: 0 }, { x: 100, y: 60 }];
    const rects = [{ id: 0, cx: 100, cy: 5, w: 40, h: 50 }, { id: 1, cx: 100, cy: 65, w: 40, h: 50 }];
    // +offset is the left normal here (x decreases); the frame stops just left of the rects.
    const park = parkShip(pts, 1, rects, { x: 75, y: -40, w: 200, h: 160 });
    expect(park.offset).toBeLessThan(0);
  });
});
