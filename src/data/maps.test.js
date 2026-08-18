import { MAPS } from './maps.js';
import { PATH_STYLES } from '../systems/PathRenderer.js';

describe('MAPS', () => {
  const REQUIRED = [
    'id','name','background','pathColor','waypoints','startGold',
    'startLives','unlockCost','waveCount','maxTierAllowed','storyKey','blurb',
    'backgroundImage','pathRenderStyle','blockerVocab','blockerSeed','towerSlots',
    'rewardMult','overworldPos','overworldArt',
  ];
  const VALID_BLOCKER_VOCAB = ['crater','rocks','metal_bulkhead','asteroid','organic_spire','glowing_pool'];

  for (const map of MAPS) {
    it(`map ${map.id} has all required fields`, () => {
      for (const field of REQUIRED) expect(map).toHaveProperty(field);
    });

    it(`map ${map.id} waypoints are normalized 0-1 pairs`, () => {
      for (const [x, y] of map.waypoints) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1);
      }
    });

    it(`map ${map.id} backgroundImage is a .png filename`, () => {
      expect(typeof map.backgroundImage).toBe('string');
      expect(map.backgroundImage.length).toBeGreaterThan(0);
      expect(map.backgroundImage.endsWith('.png')).toBe(true);
    });

    it(`map ${map.id} pathRenderStyle is a supported style`, () => {
      expect(PATH_STYLES).toContain(map.pathRenderStyle);
    });

    it(`map ${map.id} blockerVocab is an array of supported types (may be empty)`, () => {
      expect(Array.isArray(map.blockerVocab)).toBe(true);
      // An empty vocab is valid — the map opts out of procedural blockers
      // (e.g. map 0, whose painted backdrop already has craters/rock mounds).
      for (const v of map.blockerVocab) {
        expect(typeof v).toBe('string');
        expect(VALID_BLOCKER_VOCAB).toContain(v);
      }
    });

    it(`map ${map.id} blockers (if present) are valid fixed placements`, () => {
      if (map.blockers === undefined) return; // optional field
      expect(Array.isArray(map.blockers)).toBe(true);
      for (const b of map.blockers) {
        expect(VALID_BLOCKER_VOCAB).toContain(b.type);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x).toBeLessThanOrEqual(1);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeLessThanOrEqual(1);
        if (b.scale !== undefined) expect(b.scale).toBeGreaterThan(0);
      }
    });

    it(`map ${map.id} blockerSeed is a number`, () => {
      expect(typeof map.blockerSeed).toBe('number');
      expect(Number.isFinite(map.blockerSeed)).toBe(true);
    });

    it(`map ${map.id} has a generous set of tower slots`, () => {
      expect(Array.isArray(map.towerSlots)).toBe(true);
      // Slots are placed hugging the path within tower range; every map gets a
      // generous reachable set (no longer the old fixed 6 + id count).
      expect(map.towerSlots.length).toBeGreaterThanOrEqual(8);
    });

    it(`map ${map.id} towerSlots are normalized 0-1 pairs`, () => {
      for (const [x, y] of map.towerSlots) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1);
      }
    });

    it(`map ${map.id} rewardMult is a number in (0, 1]`, () => {
      expect(typeof map.rewardMult).toBe('number');
      expect(map.rewardMult).toBeGreaterThan(0);
      expect(map.rewardMult).toBeLessThanOrEqual(1);
    });

    it(`map ${map.id} overworldPos is a normalized [x,y] pair`, () => {
      expect(Array.isArray(map.overworldPos)).toBe(true);
      expect(map.overworldPos).toHaveLength(2);
      for (const v of map.overworldPos) {
        expect(typeof v).toBe('number');
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it(`map ${map.id} overworldArt is a .png filename`, () => {
      expect(typeof map.overworldArt).toBe('string');
      expect(map.overworldArt.endsWith('.png')).toBe(true);
    });
  }
});
