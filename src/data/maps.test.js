import { MAPS } from './maps.js';

describe('MAPS', () => {
  const REQUIRED = ['id','name','background','pathColor','waypoints','startGold',
                    'startLives','unlockCost','waveCount','maxTierAllowed','storyKey','blurb'];
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
  }
});
