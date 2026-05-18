import { MAP_WAVES } from './waves.js';

describe('MAP_WAVES[0] (Outpost Sigma)', () => {
  const waves = MAP_WAVES[0];

  it('has exactly 10 waves', () => {
    expect(waves).toHaveLength(10);
  });

  it('contains no colossus enemies', () => {
    for (const wave of waves) {
      for (const group of wave) {
        expect(group.type).not.toBe('colossus');
      }
    }
  });

  it('final wave (index 9) contains only drones', () => {
    for (const group of waves[9]) {
      expect(group.type).toBe('drone');
    }
  });

  it('final wave has at least 15 drones total', () => {
    const total = waves[9].reduce((sum, g) => sum + g.count, 0);
    expect(total).toBeGreaterThanOrEqual(15);
  });

  it('all groups have valid type, positive count, and positive interval', () => {
    for (const wave of waves) {
      for (const group of wave) {
        expect(typeof group.type).toBe('string');
        expect(group.count).toBeGreaterThan(0);
        expect(group.interval).toBeGreaterThan(0);
      }
    }
  });
});

const VALID_TYPES = new Set(['drone', 'skitter', 'brute', 'phantom', 'titan']);
const WAVE_COUNTS = { 1: 10, 2: 12, 3: 12, 4: 14, 5: 14, 6: 15, 7: 15, 8: 16, 9: 18 };

for (const [mapId, count] of Object.entries(WAVE_COUNTS)) {
  describe(`MAP_WAVES[${mapId}]`, () => {
    const waves = MAP_WAVES[Number(mapId)];

    it(`has exactly ${count} waves`, () => {
      expect(waves).toHaveLength(count);
    });

    it('contains no colossus enemies', () => {
      for (const wave of waves) {
        for (const group of wave) {
          expect(group.type).not.toBe('colossus');
        }
      }
    });

    it('all groups have a valid type, positive count, and positive interval', () => {
      for (const wave of waves) {
        for (const group of wave) {
          expect(VALID_TYPES.has(group.type)).toBe(true);
          expect(group.count).toBeGreaterThan(0);
          expect(group.interval).toBeGreaterThan(0);
        }
      }
    });
  });
}
