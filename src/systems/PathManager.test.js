import { PathManager } from './PathManager.js';

// L-shaped path: (0,0)→(100,0)→(100,100) in normalized coords.
const WAYPOINTS = [[0, 0], [1, 0], [1, 1]];
// Hand-placed slots (3 slots, normalized).
const SLOTS = [[0.50, 0.20], [0.20, 0.50], [0.80, 0.80]];

describe('PathManager', () => {
  let pm;
  beforeEach(() => { pm = new PathManager(WAYPOINTS, SLOTS, 100, 100); });

  it('converts normalized waypoints to pixel coords', () => {
    expect(pm.path[0]).toEqual({ x: 0, y: 0 });
    expect(pm.path[1]).toEqual({ x: 100, y: 0 });
    expect(pm.path[2]).toEqual({ x: 100, y: 100 });
  });

  it('isOnPath returns true for point on the path', () => {
    expect(pm.isOnPath(50, 0, 10)).toBe(true);
    expect(pm.isOnPath(100, 50, 10)).toBe(true);
  });

  it('isOnPath returns false for point far from path', () => {
    expect(pm.isOnPath(0, 80, 10)).toBe(false);
    // Not (50, 50) — that's near the elbow with the default 10px margin
  });

  it('buildZones come from supplied slots (not auto-computed)', () => {
    expect(pm.buildZones).toHaveLength(3);
    expect(pm.buildZones[0]).toMatchObject({
      cx: 50, cy: 20, radius: 22, occupied: false,
    });
    expect(pm.buildZones[1]).toMatchObject({ cx: 20, cy: 50 });
    expect(pm.buildZones[2]).toMatchObject({ cx: 80, cy: 80 });
  });

  it('getPathPoints returns the path array', () => {
    expect(pm.getPathPoints()).toBe(pm.path);
  });

  it('getNearestPathProgress returns 0 at path start', () => {
    expect(pm.getNearestPathProgress(0, 0)).toBeCloseTo(0, 5);
  });

  it('getNearestPathProgress returns 1 at path end', () => {
    expect(pm.getNearestPathProgress(100, 100)).toBeCloseTo(1, 5);
  });

  it('getNearestPathProgress returns 0.5 at elbow of L-path', () => {
    expect(pm.getNearestPathProgress(100, 0)).toBeCloseTo(0.5, 5);
  });
});
