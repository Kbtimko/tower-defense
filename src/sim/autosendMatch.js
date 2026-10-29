// "Does auto-send leave this map no harder than today?" — shared by the
// calibration script and the balance report so they can never disagree.
import { simulateMap } from './simulate.js';
import { findWinMultiplier } from './deficit.js';
import { strategyPlan } from './strategy.js';
import { verdict, VERDICT_HARDNESS } from './verdict.js';

const rank = m => (m === null ? Infinity : m);

// before/after: { multiplier, run }. One life of tolerance covers sim noise
// (the 2026-10-21 spec saw +-15-pp swings from small inputs).
export function matchesBefore(before, after, startLives) {
  if (rank(after.multiplier) > rank(before.multiplier)) return false;
  if (before.multiplier === 1 && after.multiplier === 1
      && after.run.livesRemaining < before.run.livesRemaining - 1) return false;
  const band = r => VERDICT_HARDNESS.indexOf(verdict(r, startLives).tag);
  return band(after.run) >= band(before.run);
}

// Replays the strategy that won `before` under countdown timing (spec S6).
export function afterSame(map, waves, strategy) {
  const buildPlan = strategyPlan(strategy);
  return {
    multiplier: findWinMultiplier(map, waves, { buildPlan, waveTiming: 'countdown' }),
    run: simulateMap({ map, waves, buildPlan, waveTiming: 'countdown' }),
  };
}
