// How much more effective damage a map needs before a modelled defence clears it.
//
// The simulator deliberately omits several real systems (hero abilities, meta
// upgrades, matchup-aware tower choice, soldier repositioning, the
// send-wave-early bonus). Rather than pretend those don't exist, this
// solves for the uniform damage multiplier at which the map becomes winnable.
// The result reads as: "everything this model leaves out has to be worth about
// Nx before map M clears." A figure near 1.0 means the map is on the edge; a
// large figure means the omitted systems are carrying the whole campaign.
import { simulateMap } from './simulate.js';

export function findWinMultiplier(map, waves, { buildPlan, max = 8, tolerance = 0.05 } = {}) {
  const wins = mult => simulateMap({ map, waves, buildPlan, damageMult: mult }).won;

  if (wins(1)) return 1;
  if (!wins(max)) return null;          // not winnable even at the ceiling

  let lo = 1, hi = max;
  while (hi - lo > tolerance) {
    const mid = (lo + hi) / 2;
    if (wins(mid)) hi = mid; else lo = mid;
  }
  return Number(hi.toFixed(2));
}
