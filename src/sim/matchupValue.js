// What a tower is WORTH to the modelled player, given what is still coming.
//
// The old `towerValue` in buildPolicy.js is `damage * fireRate / cost`, which
// ignores flat armour, the weakness matrix and pierce. It therefore ranks the
// archer first — and the archer lands 1 damage a shot on a titan. This module
// scores candidates through the real `computeDamage` instead, so the model
// picks towers the way a player with the wave preview and codex can.
import { ENEMY_DEFS } from '../data/enemies.js';
import { waveScaleFactor } from '../systems/WaveManager.js';
import { computeDamage } from '../systems/damage.js';
import { TOWER_DEFS } from '../data/towers.js';

// Weighted HP each enemy type contributes from `fromWaveIndex` onward. The
// numbers are a relative mix — only their ratios are ever used.
export function remainingEnemyWeights(waves, fromWaveIndex = 0) {
  const weights = new Map();
  if (!Array.isArray(waves)) return weights;
  for (let i = Math.max(0, fromWaveIndex); i < waves.length; i++) {
    const scale = waveScaleFactor(i);
    for (const group of waves[i] ?? []) {
      const def = ENEMY_DEFS[group.type];
      if (!def) continue;
      const hp = def.hp * (group.count ?? 0) * scale;
      weights.set(group.type, (weights.get(group.type) ?? 0) + hp);
    }
  }
  return weights;
}

const TIER_KEY = (tier, branch) => (tier === 4 ? `tier4${branch ?? 'A'}` : `tier${tier}`);

// Effective stats of a tower at a given tier. Tier blocks are SPARSE and
// CUMULATIVE — archer tier3 sets damage and range but not fireRate — so each
// one is folded over the last, mirroring how simulate.js applies them during
// an upgrade. NOTE: `cost` is the BASE purchase cost only and does NOT fold
// across tiers — it is not cumulative upgrade spend. Callers pricing an
// upgrade must use `upgradeCost()`, not `spec.cost`.
export function towerSpecAt(type, tier = 1, branch = null) {
  const def = TOWER_DEFS[type];
  if (!def) return null;
  const spec = {
    type, tier, branch,
    damage: def.damage, fireRate: def.fireRate, pierce: def.pierce, cost: def.cost,
    shots: def.shots ?? 1, slow: def.slow ?? 0, slowedMult: def.slowedMult ?? 1,
  };
  for (let t = 2; t <= tier; t++) {
    const td = def[TIER_KEY(t, branch)];
    if (!td) continue;
    if (td.damage   !== undefined) spec.damage   = td.damage;
    if (td.fireRate !== undefined) spec.fireRate = td.fireRate;
    if (td.pierce   !== undefined) spec.pierce   = td.pierce;
    if (td.shots      !== undefined) spec.shots      = td.shots;
    if (td.slow       !== undefined) spec.slow       = td.slow;
    if (td.slowedMult !== undefined) spec.slowedMult = td.slowedMult;
  }
  return spec;
}

// Expected damage per second against the weighted mix. Every candidate goes
// through the real computeDamage, so armour, the weakness matrix and pierce
// are all honoured and no combat arithmetic is duplicated here. Prices raw
// per-target damage: multi-shot (Volley's 2 arrows) and Shatter's 2x vs slowed
// targets, the latter only when the tower itself slows (else nothing slows its
// targets). The 2x is an upper bound: each enemy's first hit lands before its
// own slow does, and it assumes the slow (TOWER_SLOW_DURATION) outlasts the
// tower's cooldown, true for Shatter. Splash, chain and cluster stay unpriced,
// so it under-rates cannon, mage and ice, same as the towerValue caveat in
// buildPolicy.js.
export function towerDpsAgainst(spec, weights) {
  if (!spec || !weights || weights.size === 0) return 0;
  const shots = spec.shots ?? 1;
  const slowedMult = spec.slow > 0 && spec.slowedMult > 1 ? spec.slowedMult : 1;
  let total = 0, mass = 0;
  for (const [enemyType, weight] of weights) {
    if (!(weight > 0)) continue;
    const dmg = computeDamage({
      amount: spec.damage,
      armor: ENEMY_DEFS[enemyType]?.armor ?? 0,
      pierce: spec.pierce,
      source: { kind: 'tower', type: spec.type, tier: spec.tier, branch: spec.branch },
      enemyType,
    });
    total += dmg * spec.fireRate * shots * slowedMult * weight;
    mass  += weight;
  }
  return mass > 0 ? total / mass : 0;
}

// Expected DPS per gold — the yardstick the purchase pass ranks by.
export function towerValueAgainst(spec, weights) {
  if (!spec) return 0;
  const cost = spec.cost > 0 ? spec.cost : 1;
  return towerDpsAgainst(spec, weights) / cost;
}
