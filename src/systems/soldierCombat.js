// Melee blocking, shared by the live game and the headless balance simulator.
//
// GameScene owns Phaser-backed Soldier containers and the simulator owns plain
// objects, but both must agree on WHEN an enemy is halted and what the melee
// exchange costs — otherwise the balance model silently drifts from the game it
// exists to predict. Everything here is pure arithmetic over a soldier-shaped
// record ({ x, y, hp, maxHp, dead, respawnTimer, attackTimer, canBlockFlyers }),
// so both callers share one source of truth.
//
// The damage a blocked enemy deals back is a balance dial and lives with the
// enemy stats; it is re-exported here so callers of this module get the whole
// melee exchange from one import.
import { ENEMY_MELEE_DAMAGE } from '../data/enemies.js';

export { ENEMY_MELEE_DAMAGE };

export const MELEE_RANGE         = 30;  // px — an enemy this close stops walking
export const SOLDIER_ATTACK_RATE = 1;   // soldier attacks per second

// Max hp after meta upgrades.
export function soldierMaxHp(stats, modifiers = {}) {
  return stats.hp + (modifiers.soldierMaxHpBonus ?? 0);
}

// Respawn delay after meta upgrades.
export function soldierRespawnDuration(stats, modifiers = {}) {
  return stats.respawnDuration * (modifiers.soldierRespawnMult ?? 1);
}

// The soldier that halts this enemy, or null. Flyers pass over ground soldiers.
// The first match wins and is not claimed exclusively, so several enemies can
// gang up on one blocker — that concentration is why blocking eventually breaks.
export function findBlockingSoldier(enemy, soldiers) {
  for (const soldier of soldiers) {
    if (soldier.dead) continue;
    if (enemy.def.flying && !soldier.canBlockFlyers) continue;
    if (Math.hypot(enemy.x - soldier.x, enemy.y - soldier.y) < MELEE_RANGE) return soldier;
  }
  return null;
}

// Apply melee damage. Returns true if this blow killed the soldier, so callers
// can attach their own presentation to that transition.
export function damageSoldier(soldier, amount) {
  if (soldier.dead) return false;
  soldier.hp -= amount;
  if (soldier.hp > 0) return false;
  soldier.dead         = true;
  soldier.respawnTimer = soldier.respawnDuration;
  return true;
}

// Advance attack cooldown and respawn timer. Returns true on the tick the
// soldier comes back.
export function tickSoldier(soldier, dt) {
  if (soldier.attackTimer > 0) soldier.attackTimer -= dt;
  if (!soldier.dead) return false;
  soldier.respawnTimer -= dt;
  if (soldier.respawnTimer > 0) return false;
  soldier.dead         = false;
  soldier.hp           = soldier.maxHp;
  soldier.respawnTimer = 0;
  return true;
}

// The hero blocks like a ground soldier but is not soldier-shaped: it carries
// `_attackTimer` / `def.stats.attackDamage`, so it cannot go through
// findBlockingSoldier. Only the eligibility test is shared — the damage
// exchange differs, because the hero's own auto-attack already covers melee
// range and striking again from the block would double its dps.
//
// Eligibility only, and deliberately stateless: the hero holds ONE enemy at a
// time (the rest of the wave flows past), but that is a property of a single
// pass over the enemy queue, so each caller tracks it with a frame-local flag
// rather than this predicate carrying per-frame state its other callers would
// have to reason about.
export function heroBlocksEnemy(hero, enemy) {
  if (!hero || hero.dead) return false;
  if (enemy.def?.flying) return false;  // flyers pass over the hero, as over ground soldiers
  return Math.hypot(enemy.x - hero.x, enemy.y - hero.y) < MELEE_RANGE;
}
