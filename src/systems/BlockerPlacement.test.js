import { computeBlockerPlacements } from './BlockerPlacement.js';

// L-shaped path: 3 waypoints, 1 interior bend.
const L_WAYPOINTS = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
// Zig-zag: 5 waypoints, 3 interior bends.
const ZIG = [
  { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 },
  { x: 100, y: 50 }, { x: 100, y: 100 },
];

describe('BlockerPlacement', () => {
  it('places one blocker per interior waypoint', () => {
    const result = computeBlockerPlacements(L_WAYPOINTS, ['crater'], 1);
    expect(result).toHaveLength(1);
  });

  it('places three blockers for the zig-zag path', () => {
    const result = computeBlockerPlacements(ZIG, ['crater'], 7);
    expect(result).toHaveLength(3);
  });

  it('returns entries with type/x/y/scale', () => {
    const result = computeBlockerPlacements(L_WAYPOINTS, ['crater'], 1);
    expect(result[0]).toMatchObject({
      type: 'crater',
      x: expect.any(Number),
      y: expect.any(Number),
      scale: expect.any(Number),
    });
  });

  it('same seed produces identical placements', () => {
    const a = computeBlockerPlacements(ZIG, ['crater', 'rocks'], 1234);
    const b = computeBlockerPlacements(ZIG, ['crater', 'rocks'], 1234);
    expect(a).toEqual(b);
  });

  it('different seeds produce different placements when vocab has multiple types', () => {
    const a = computeBlockerPlacements(ZIG, ['crater', 'rocks'], 1);
    const b = computeBlockerPlacements(ZIG, ['crater', 'rocks'], 999);
    // Either types or jitter differ
    expect(a).not.toEqual(b);
  });

  it('picks types from the supplied vocab only', () => {
    const result = computeBlockerPlacements(ZIG, ['rocks'], 42);
    for (const b of result) expect(b.type).toBe('rocks');
  });

  it('returns empty array for a 2-waypoint path (no interior bends)', () => {
    const result = computeBlockerPlacements(
      [{ x: 0, y: 0 }, { x: 100, y: 100 }], ['crater'], 1,
    );
    expect(result).toEqual([]);
  });

  it('blocker is placed on the "outside" of the bend', () => {
    // L-path: (0,0)→(100,0)→(100,100). Bend at (100,0). Path continues down.
    // Outside of the bend is up-and-to-the-right (away from the bend interior).
    const [b] = computeBlockerPlacements(L_WAYPOINTS, ['crater'], 1);
    // Interior of bend is roughly (50, 50). Blocker should be on the opposite side from (50, 50).
    const dxFromInterior = b.x - 50;
    const dyFromInterior = b.y - 50;
    expect(dxFromInterior).toBeGreaterThan(0); // pushed right of interior
    expect(dyFromInterior).toBeLessThan(0);    // pushed up of interior
  });
});
