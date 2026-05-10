import { PathManager } from './PathManager.js';

// L-shaped path: (0,0)→(100,0)→(100,100) in normalized coords
const WAYPOINTS = [[0, 0], [1, 0], [1, 1]];

describe('PathManager', () => {
  let pm;
  beforeEach(() => { pm = new PathManager(WAYPOINTS, 100, 100); });

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
    expect(pm.isOnPath(50, 50, 10)).toBe(false);
  });

  it('computes build zones with required shape', () => {
    expect(pm.buildZones.length).toBeGreaterThan(0);
    expect(pm.buildZones[0]).toMatchObject({ cx: expect.any(Number), cy: expect.any(Number), radius: 22, occupied: false });
  });
});
