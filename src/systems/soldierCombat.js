// Melee blocking, shared by the live game and the headless balance simulator.
//
// GameScene owns Phaser-backed Soldier containers and the simulator owns plain
// objects, but both must agree on WHEN an enemy is halted and what the melee
// exchange costs — otherwise the balance model silently drifts from the game it
// exists to predict. Everything here is pure arithmetic over a soldier-shaped
// record ({ x, y, hp, maxHp, dead, respawnTimer, attackTimer, canBlockFlyers }),
// so both callers share one source of truth.

export const MELEE_RANGE         = 30;  // px — an enemy this close stops walking
export const ENEMY_MELEE_DAMAGE  = 20;  // damage/second a blocked enemy deals back
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
