import { describe, it, expect } from 'vitest';
import { DEVICES } from '../../scripts/captureDevices.mjs';
import { ROUTE, LAYOUT } from '../data/worldMap.js';
import { MAPS } from '../data/maps.js';
import { layoutClass, routeFrameFor } from './worldMapLayout.js';
import { routePoints, routeParamAt, frontRadius } from './worldRoute.js';

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
