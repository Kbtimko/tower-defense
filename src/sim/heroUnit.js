// The hero's health clock for the headless balance model.
//
// GameScene owns a Phaser-backed Hero container; this owns a plain record. The
// eligibility test for *what the hero blocks* is shared outright
// (soldierCombat.heroBlocksEnemy), but the consequences — melee damage, death,
// respawn and out-of-combat regen — live inside Hero.js's Phaser lifecycle
// (sprite visibility, hp bar, SFX), so the arithmetic is mirrored here and the
// tunables are imported rather than restated. If Hero.takeDamage / Hero.respawn
// / the regen block in Hero.update change, this must change with them or the
// model over-credits a hero that would be dead.
import { HERO_REGEN_DELAY, HERO_REGEN_RATE } from '../data/heroes.js';
import { heroLevelForDamage, heroMaxHp } from '../systems/heroLeveling.js';

// A record shaped for soldierCombat.heroBlocksEnemy ({ x, y, dead }).
//
// `mapTotalHp` paces levelling: the thresholds are fractions of it. The
// simulator models no meta upgrades, so there is no heroStartLevel head start
// and no heroMaxHpBonus here — the hero starts at level 1 on base stats.
export function makeHeroUnit(def, { x, y }, mapTotalHp = 0) {
  const maxHp = heroMaxHp(def.stats, 1);
  return {
    x, y,
    hp: maxHp,
    maxHp,
    dead: false,
    respawnTimer: 0,
    respawnTime: def.stats.respawnTime,
    // Hero.js: a hero that has never been hit counts as already out of combat.
    timeSinceDamage: HERO_REGEN_DELAY,
    stats: def.stats,
    mapTotalHp,
    level: 1,
    damageDealt: 0,
  };
}

// Bank post-armour damage and level up on it, mirroring Hero._registerDamage —
// same shared maths, same "raise current hp by the max-hp gained, never a full
// heal" rule. Returns true on the tick the hero levels.
export function registerHeroUnitDamage(unit, dealt) {
  if (!(dealt > 0)) return false;
  unit.damageDealt += dealt;
  const next = heroLevelForDamage(unit.damageDealt, unit.mapTotalHp, {
    maxLevel: unit.stats.maxLevel,
  });
  if (next === unit.level) return false;
  unit.level = next;
  const grownMaxHp = heroMaxHp(unit.stats, unit.level);
  unit.hp    = Math.min(grownMaxHp, unit.hp + (grownMaxHp - unit.maxHp));
  unit.maxHp = grownMaxHp;
  return true;
}

// Apply melee damage. Returns true only on the blow that kills, so a caller can
// count deaths without double-counting the ticks that follow.
export function damageHeroUnit(unit, amount) {
  if (unit.dead) return false;
  unit.timeSinceDamage = 0;
  unit.hp = Math.max(0, unit.hp - amount);
  if (unit.hp > 0) return false;
  unit.dead         = true;
  unit.respawnTimer = unit.respawnTime;
  return true;
}

// Advance the respawn timer or the regen clock. Returns true on the tick the
// hero comes back, which is when the caller resets its attack cooldown (as
// Hero.respawn does). `respawnPoint` is path progress 0 — where Hero.respawn
// puts the hero, not where the player last parked it.
export function tickHeroUnit(unit, dt, respawnPoint) {
  if (unit.dead) {
    unit.respawnTimer -= dt;
    if (unit.respawnTimer > 0) return false;
    unit.dead            = false;
    unit.hp              = unit.maxHp;
    unit.respawnTimer    = 0;
    unit.timeSinceDamage = HERO_REGEN_DELAY;
    unit.x               = respawnPoint.x;
    unit.y               = respawnPoint.y;
    return true;
  }
  unit.timeSinceDamage += dt;
  if (unit.timeSinceDamage >= HERO_REGEN_DELAY && unit.hp < unit.maxHp) {
    unit.hp = Math.min(unit.maxHp, unit.hp + HERO_REGEN_RATE * dt);
  }
  return false;
}
