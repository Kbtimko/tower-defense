import { PROJECTILE_FX } from '../data/fx.js';

const MAX_TIER = 4;

// Overrides apply cumulatively (tier 3 sits on top of tier 2) and the branch
// only at tier 4, mirroring how tower upgrades stack. Never mutates the data.
export function projectileFx(towerType, tier = 1, branch = null) {
  const base = PROJECTILE_FX[towerType] ?? PROJECTILE_FX.sentry;
  const { tiers = {}, branches = {}, ...resolved } = base;
  let fx = resolved;
  for (let t = 2; t <= Math.min(tier, MAX_TIER); t++) fx = { ...fx, ...tiers[t] };
  if (tier === MAX_TIER && branch) fx = { ...fx, ...branches[branch] };
  return fx;
}

// Parabolic lob height; caller subtracts it from y so x/y stay the ground position.
export function arcOffset(progress, peak) {
  const p = Math.min(1, Math.max(0, progress));
  return 4 * peak * p * (1 - p);
}
