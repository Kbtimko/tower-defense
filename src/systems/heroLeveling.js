// Hero levelling maths, shared outright by the live game and the headless
// balance simulator.
//
// Hero.js drives Phaser sprites, HP bars and the `hero:level-up` event; the
// simulator drives a plain record. What must NOT differ is when a level is
// earned and what it is worth — soldierCombat.js makes the same point about
// blocking: a second copy of this arithmetic lets the balance model drift away
// from the game it exists to predict. So both callers import these functions
// and neither restates the formula.
//
// XP is post-armour damage dealt. Armour is flat subtraction, so the raw
// attackDamage stat says almost nothing about what a hero lands on an armoured
// enemy; only the computeDamage result does.
import { HERO_LEVEL_DAMAGE_FRACTIONS, HERO_LEVEL_STAT_STEP } from '../data/heroes.js';

// Absolute damage needed for levels 2..5 on a map with this much total enemy HP
// (see totalEnemyHpForMap in data/waves.js).
export function heroXpThresholds(mapTotalHp) {
  return HERO_LEVEL_DAMAGE_FRACTIONS.map(f => f * mapTotalHp);
}

// The level a hero has earned, never below the level it started the map at.
// A map with no wave table has no HP budget to pace against, so it yields the
// start level rather than a hero that caps on its first swing.
export function heroLevelForDamage(damageDealt, mapTotalHp, { startLevel = 1, maxLevel = 5 } = {}) {
  let level = startLevel;
  if (mapTotalHp > 0) {
    const thresholds = heroXpThresholds(mapTotalHp);
    for (let i = 0; i < thresholds.length; i++) {
      if (damageDealt >= thresholds[i]) level = Math.max(level, i + 2);
    }
  }
  return Math.min(level, maxLevel);
}

// Linear on the BASE stat, so level 5 is a predictable 1.8x.
export function heroLevelMult(level) {
  return 1 + HERO_LEVEL_STAT_STEP * (level - 1);
}

export function heroAttackDamage(stats, level) {
  return stats.attackDamage * heroLevelMult(level);
}

// heroMaxHpBonus is added AFTER the multiplier — see the note in data/heroes.js.
export function heroMaxHp(stats, level, modifiers = {}) {
  return stats.maxHp * heroLevelMult(level) + (modifiers.heroMaxHpBonus ?? 0);
}
