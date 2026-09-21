// Display-ready shapes for the entity tables. Pure: no Phaser, no DOM, no
// game state — every consumer (wave popover, codex, tooltips) reads the same
// description of what a thing is, so the three surfaces cannot drift.
import { ENEMY_DEFS }                             from '../data/enemies.js';
import { TOWER_DEFS }                             from '../data/towers.js';
import { HEROES }                                 from '../data/heroes.js';
import { describeEnemyMatchups, describeMatchups } from '../data/weaknessMatrix.js';

const TIER_KEYS = ['tier2', 'tier3', 'tier4A', 'tier4B'];

// describeEnemyMatchups returns bare tower types plus 'hero:<id>'-prefixed
// hero ids; every consumer of this module wants a name+icon to render, not a
// string to parse, so resolve that here once instead of three times downstream.
function describeMatchupEntry(entry) {
  if (entry.startsWith('hero:')) {
    const heroId = entry.slice('hero:'.length);
    const hero = HEROES[heroId];
    return { kind: 'hero', type: heroId, name: hero.shortName, icon: hero.portraitChar };
  }
  const tower = TOWER_DEFS[entry];
  return { kind: 'tower', type: entry, name: tower.name, icon: tower.icon };
}

function describeEnemyEntry(type) {
  const enemy = ENEMY_DEFS[type];
  return { kind: 'enemy', type, name: enemy.name, icon: enemy.icon };
}

export function describeEnemy(type) {
  if (!Object.hasOwn(ENEMY_DEFS, type)) return null;
  const def = ENEMY_DEFS[type];
  const { vulnerableTo, resists } = describeEnemyMatchups(type);
  return {
    kind: 'enemy',
    type:   def.type,
    name:   def.name,
    icon:   def.icon,
    hp:     def.hp,
    speed:  def.speed,
    armor:  def.armor,
    reward: def.reward,
    flying: def.flying,
    vulnerableTo: vulnerableTo.map(describeMatchupEntry),
    resists:      resists.map(describeMatchupEntry),
  };
}

export function describeTower(type) {
  if (!Object.hasOwn(TOWER_DEFS, type)) return null;
  const def = TOWER_DEFS[type];
  // Tier-1, unbranched matchups only. These sit on the same object as the
  // full tier-4 ladder but TIER4_OVERRIDES can invert them at tier 4 (e.g.
  // cannon is weak vs skitter at base, but tier4A Artillery is 2x *against*
  // skitter) — so these describe the base tower, not the branched one.
  const { effective, weak } = describeMatchups({ kind: 'tower', type, tier: 1, branch: null });
  return {
    kind: 'tower',
    type,
    name:         def.name,
    icon:         def.icon,
    cost:         def.cost,
    range:        def.range,
    damage:       def.damage,
    fireRate:     def.fireRate,
    splashRadius: def.splashRadius,
    pierce:       def.pierce,
    slow:         def.slow,
    // The barracks deals no direct damage; its output is its squad. Consumers
    // use this to choose a soldier stat block over a damage row.
    dealsDirectDamage: def.damage > 0,
    // Deep-copied: these would otherwise be returned by reference to the live
    // balance table, letting a consumer mutate game balance for the session.
    soldierStats: def.soldierStats ? structuredClone(def.soldierStats) : null,
    ability:      def.ability      ? structuredClone(def.ability)      : null,
    tiers: TIER_KEYS.map(key => ({
      key,
      label:         def[key].label,
      cost:          def[key].cost,
      damage:        def[key].damage       ?? null,
      range:         def[key].range        ?? null,
      splashRadius:  def[key].splashRadius ?? null,
      fireRate:      def[key].fireRate     ?? null,
      slow:          def[key].slow         ?? null,
      passiveEffect: def[key].passiveEffect ?? null,
    })),
    effectiveAtBase: effective.map(describeEnemyEntry),
    weakAtBase:      weak.map(describeEnemyEntry),
  };
}
