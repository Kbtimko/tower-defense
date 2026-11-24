// Which barracks strategy the modelled player plays on a map.
//
// One fixed opening on every map measured the opening as much as the map: no
// single rule wins everywhere (map 9 wants its barracks, map 8 does better
// without one, map 6 only wins with it deepened to T3). A real player retries
// a level and adapts, so the report plays each candidate below in full and
// keeps the best — hindsight, not foresight. The list is small on purpose:
// enough to cover every winner the 2026-10-13 probes found, few enough that the
// search models a competent player rather than an exploit-finder.
import { simulateMap } from './simulate.js';
import { findWinMultiplier } from './deficit.js';
import { greedyBuildPlan } from './buildPolicy.js';

// Default policy first: candidate order is the last tie-break, so a map every
// strategy plays identically keeps today's numbers.
export const CANDIDATE_STRATEGIES = Object.freeze([
  { opening: 'start',        barracksTier: 1 },
  { opening: 'start',        barracksTier: 3 },
  { opening: 'beforeGround', barracksTier: 1 },
  { opening: 'beforeGround', barracksTier: 3 },
  { opening: 'none',         barracksTier: 1 },   // no barracks, nothing to deepen
]);

export function strategyLabel({ opening, barracksTier }) {
  if (opening === 'none') return 'none';
  const head = opening === 'beforeGround' ? 'ground' : opening;
  return `${head}/T${barracksTier}`;
}

export function strategyPlan(strategy) {
  return ctx => greedyBuildPlan({ ...ctx, ...strategy });
}

const multiplierRank = m => (m === null ? Infinity : m);

// Positive when `b` is better than `a`. Lives kept only matters between runs
// won at the same multiplier; waves survived only between runs that kept the
// same lives — i.e. two losses.
function compare(a, b) {
  return (multiplierRank(a.multiplier) - multiplierRank(b.multiplier))
      || (b.livesKept - a.livesKept)
      || (b.wavesSurvived - a.wavesSurvived);
}

// Strictly-better only, so an exact tie keeps the earlier candidate.
export function pickBest(results) {
  return results.reduce((best, r) => (compare(best, r) > 0 ? r : best));
}

export function bestStrategy(map, waves, { waveTiming } = {}) {
  const results = CANDIDATE_STRATEGIES.map(strategy => {
    const buildPlan = strategyPlan(strategy);
    const run = simulateMap({ map, waves, buildPlan, waveTiming });
    return {
      strategy,
      run,
      multiplier: findWinMultiplier(map, waves, { buildPlan, waveTiming }),
      livesKept: run.livesRemaining / map.startLives,
      wavesSurvived: run.wavesSurvived,
    };
  });
  return { best: pickBest(results), results };
}
