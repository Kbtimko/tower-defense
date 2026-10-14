import { describe, it, expect } from 'vitest';
import {
  CANDIDATE_STRATEGIES, strategyLabel, pickBest, bestStrategy,
} from './strategy.js';
import { OPENINGS, DEFAULT_OPENING, DEFAULT_BARRACKS_TIER } from './buildPolicy.js';
import { MAPS } from '../data/maps.js';
import { MAP_WAVES } from '../data/waves.js';

describe('CANDIDATE_STRATEGIES', () => {
  it("puts the policy's own defaults first, so a full tie keeps today's behaviour", () => {
    expect(CANDIDATE_STRATEGIES[0]).toEqual({
      opening: DEFAULT_OPENING, barracksTier: DEFAULT_BARRACKS_TIER,
    });
  });

  it('uses only openings the policy accepts', () => {
    for (const s of CANDIDATE_STRATEGIES) expect(OPENINGS).toContain(s.opening);
  });

  it("never pairs 'none' with depth — there is no barracks to deepen", () => {
    expect(CANDIDATE_STRATEGIES.filter(s => s.opening === 'none' && s.barracksTier > 1)).toEqual([]);
  });

  it('has no duplicates', () => {
    const keys = CANDIDATE_STRATEGIES.map(s => JSON.stringify(s));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every candidate a distinct label', () => {
    const labels = CANDIDATE_STRATEGIES.map(strategyLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('strategyLabel', () => {
  it('names the opening and the depth', () => {
    expect(strategyLabel({ opening: 'start', barracksTier: 1 })).toBe('start/T1');
    expect(strategyLabel({ opening: 'beforeGround', barracksTier: 3 })).toBe('ground/T3');
    expect(strategyLabel({ opening: 'none', barracksTier: 1 })).toBe('none');
  });
});

describe('pickBest', () => {
  const r = (name, multiplier, livesKept, wavesSurvived) =>
    ({ strategy: { name }, multiplier, livesKept, wavesSurvived });
  const pick = results => pickBest(results).strategy.name;

  it('prefers the lowest win multiplier', () => {
    expect(pick([r('a', 1.3, 0, 5), r('b', 1.05, 0, 9)])).toBe('b');
  });

  it('ranks an unwinnable (null) candidate below any number', () => {
    expect(pick([r('a', null, 0, 17), r('b', 7.9, 0, 1)])).toBe('b');
  });

  it('breaks a multiplier tie on lives kept', () => {
    expect(pick([r('a', 1, 0.55, 10), r('b', 1, 0.85, 10)])).toBe('b');
  });

  it('breaks a lives tie on waves survived', () => {
    expect(pick([r('a', 1.3, 0, 5), r('b', 1.3, 0, 9)])).toBe('b');
  });

  it('breaks a full tie by candidate order', () => {
    expect(pick([r('a', 1, 0.6, 10), r('b', 1, 0.6, 10)])).toBe('a');
  });

  it('when nothing is winnable, prefers the run that lasted longest', () => {
    expect(pick([r('a', null, 0, 3), r('b', null, 0, 7)])).toBe('b');
  });
});

describe('bestStrategy', () => {
  const map = MAPS[0], waves = MAP_WAVES[0];

  it('evaluates every candidate on a real map and returns one of them', () => {
    const { best, results } = bestStrategy(map, waves);
    expect(results.map(x => x.strategy)).toEqual([...CANDIDATE_STRATEGIES]);
    expect(results).toContain(best);
    for (const x of results) {
      expect(x.run.totalWaves).toBe(waves.length);
      expect(x.livesKept).toBeCloseTo(x.run.livesRemaining / map.startLives);
      expect(x.wavesSurvived).toBe(x.run.wavesSurvived);
    }
  });

  it('really plays each strategy rather than the default five times', () => {
    // On map 0 the baseline policy keeps 64% of lives and barracks-first to
    // the tier cap keeps 32%; if the strategy never reached the policy, every
    // candidate would report the same figure.
    const { results } = bestStrategy(map, waves);
    expect(new Set(results.map(x => x.livesKept)).size).toBeGreaterThan(1);
  });
});
