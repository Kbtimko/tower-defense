import { PathManager } from './PathManager.js';

const WAYPOINTS = [[0, 0], [1, 0], [1, 1]];
const SLOTS = [[0.50, 0.20], [0.20, 0.50], [0.80, 0.80]];
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

describe('PathManager', () => {
  let pm;
  beforeEach(() => { pm = new PathManager(WAYPOINTS, SLOTS, 100, 100); });

  it('stores raw pixel waypoints as control points', () => {
    expect(pm.waypoints).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
  });

  it('path is a dense polyline passing through every raw waypoint', () => {
    expect(pm.path.length).toBeGreaterThan(WAYPOINTS.length);
    for (const w of [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]) {
      expect(pm.path.some(p => near(p.x, w.x) && near(p.y, w.y))).toBe(true);
    }
  });

  it('path endpoints are exactly the first/last waypoint', () => {
    expect(pm.path[0]).toEqual({ x: 0, y: 0 });
    expect(pm.path[pm.path.length - 1]).toEqual({ x: 100, y: 100 });
  });

  it('isOnPath returns true near the curve and false far from it', () => {
    expect(pm.isOnPath(50, 0, 12)).toBe(true);
    expect(pm.isOnPath(100, 50, 12)).toBe(true);
    expect(pm.isOnPath(0, 80, 10)).toBe(false);
  });

  it('buildZones come from supplied slots (not auto-computed)', () => {
    expect(pm.buildZones).toHaveLength(3);
    expect(pm.buildZones[0]).toMatchObject({ cx: 50, cy: 20, radius: 22, occupied: false });
    expect(pm.buildZones[1]).toMatchObject({ cx: 20, cy: 50 });
    expect(pm.buildZones[2]).toMatchObject({ cx: 80, cy: 80 });
  });

  it('getPathPoints returns the dense path array', () => {
    expect(pm.getPathPoints()).toBe(pm.path);
  });

  it('getNearestPathProgress returns ~0 at start and ~1 at end', () => {
    expect(pm.getNearestPathProgress(0, 0)).toBeCloseTo(0, 5);
    expect(pm.getNearestPathProgress(100, 100)).toBeCloseTo(1, 5);
  });

  it('getNearestPathProgress is ~0.5 at the elbow of the symmetric L', () => {
    expect(pm.getNearestPathProgress(100, 0)).toBeCloseTo(0.5, 1);
  });
});
