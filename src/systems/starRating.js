import { STAR_RULE } from '../data/results.js';

export function starsFor(lives, startLives, rule = STAR_RULE) {
  // A non-positive or non-finite denominator has no meaningful ratio; a win still earns the floor.
  if (!Number.isFinite(startLives) || startLives <= 0) return rule.floor;
  const ratio = lives / startLives;
  for (const t of rule.thresholds) {
    if (ratio >= t.minRatio) return t.stars;
  }
  return rule.floor;
}
