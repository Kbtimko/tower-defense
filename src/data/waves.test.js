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
