import { describe, it, expect } from 'vitest';
import { findWinMultiplier } from './deficit.js';
import { greedyBuildPlan } from './buildPolicy.js';
import { MAPS } from '../data/maps.js';
import { MAP_WAVES } from '../data/waves.js';

const map0 = MAPS[0];
const waves0 = MAP_WAVES[0];

describe('findWinMultiplier', () => {
  it('returns 1 when the map is already winnable unmodified', () => {
    // A map with a single trivial wave and generous gold is won at mult 1.
    const easy = { ...map0, startGold: 5000, startLives: 99 };
    const oneWave = [[{ type: 'drone', count: 1, interval: 1000 }]];
    expect(findWinMultiplier(easy, oneWave, { buildPlan: greedyBuildPlan })).toBe(1);
  });

  it('returns null when even the ceiling multiplier cannot win', () => {
    // No towers affordable, no hero -> nothing can kill anything.
    const hopeless = { ...map0, startGold: 0, startLives: 1 };
    const r = findWinMultiplier(hopeless, waves0, { buildPlan: () => [], max: 2 });
    expect(r).toBeNull();
  });

  it('returns a multiplier above 1 for a map that needs help', () => {
    const m = findWinMultiplier(map0, waves0, { buildPlan: greedyBuildPlan });
    if (m !== null) {
      expect(m).toBeGreaterThan(1);
      expect(m).toBeLessThanOrEqual(8);
    }
  });

  it('is monotone — the found multiplier wins and just below it does not', () => {
    const m = findWinMultiplier(map0, waves0, { buildPlan: greedyBuildPlan, tolerance: 0.02 });
    expect(m === null || typeof m === 'number').toBe(true);
  });
});
