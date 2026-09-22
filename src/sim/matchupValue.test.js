import { describe, it, expect } from 'vitest';
import { remainingEnemyWeights } from './matchupValue.js';
import { ENEMY_DEFS } from '../data/enemies.js';

const waves = [
  [{ type: 'drone', count: 10, interval: 1000 }],
  [{ type: 'titan', count: 2,  interval: 1000 }],
];

describe('remainingEnemyWeights', () => {
  it('weights a type by its HP times its count', () => {
    const w = remainingEnemyWeights([[{ type: 'drone', count: 10, interval: 0 }]], 0);
    expect(w.get('drone')).toBeCloseTo(ENEMY_DEFS.drone.hp * 10);
  });

  it('counts only waves from fromWaveIndex onward', () => {
    const w = remainingEnemyWeights(waves, 1);
    expect(w.has('drone')).toBe(false);
    expect(w.get('titan')).toBeGreaterThan(0);
  });

  it('weighs a later wave more heavily than the same wave earlier', () => {
    // Enemy HP scales with the wave index, so an identical group arriving
    // later represents more HP and must pull the ranking harder.
    const early = remainingEnemyWeights([[{ type: 'drone', count: 1, interval: 0 }]], 0);
    const late  = remainingEnemyWeights(
      [[], [], [], [], [], [{ type: 'drone', count: 1, interval: 0 }]], 0);
    expect(late.get('drone')).toBeGreaterThan(early.get('drone'));
  });

  it('returns an empty map past the last wave', () => {
    expect(remainingEnemyWeights(waves, 99).size).toBe(0);
  });

  it('returns an empty map for a missing or empty wave table', () => {
    expect(remainingEnemyWeights(undefined, 0).size).toBe(0);
    expect(remainingEnemyWeights([], 0).size).toBe(0);
  });

  it('ignores an unknown enemy type rather than scoring it as zero HP', () => {
    const w = remainingEnemyWeights([[{ type: 'nosuch', count: 5, interval: 0 }]], 0);
    expect(w.has('nosuch')).toBe(false);
  });

  it('accumulates a type that appears in several waves', () => {
    const w = remainingEnemyWeights(
      [[{ type: 'drone', count: 1, interval: 0 }], [{ type: 'drone', count: 1, interval: 0 }]], 0);
    const one = remainingEnemyWeights([[{ type: 'drone', count: 1, interval: 0 }]], 0);
    expect(w.get('drone')).toBeGreaterThan(one.get('drone'));
  });
});
