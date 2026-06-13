import { MAPS } from './maps.js';
import { PATH_STYLES } from '../systems/PathRenderer.js';

describe('MAPS', () => {
  const REQUIRED = [
    'id','name','background','pathColor','waypoints','startGold',
    'startLives','unlockCost','waveCount','maxTierAllowed','storyKey','blurb',
    'backgroundImage','pathRenderStyle','blockerVocab','blockerSeed','towerSlots',
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

    it(`map ${map.id} blockerSeed is a number`, () => {
      expect(typeof map.blockerSeed).toBe('number');
      expect(Number.isFinite(map.blockerSeed)).toBe(true);
    });

    it(`map ${map.id} has exactly 6 + id tower slots`, () => {
      expect(Array.isArray(map.towerSlots)).toBe(true);
      expect(map.towerSlots.length).toBe(6 + map.id);
    });

    it(`map ${map.id} towerSlots are normalized 0-1 pairs`, () => {
      for (const [x, y] of map.towerSlots) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1);
      }
    });
  }
});
