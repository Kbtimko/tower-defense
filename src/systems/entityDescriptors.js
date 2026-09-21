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

const ABILITY_SLOTS = ['q', 'w', 'e'];

// The static form: what an ability IS, with no live state. A codex entry uses
// this; the HUD calls describeAbility directly with the current level and
// cooldown, because those change between renders.
function staticAbility(def, slot) {
  const a = def.abilities[slot];
  return {
    kind: 'ability',
    slot,
    hotkey:      slot.toUpperCase(),
    id:          a.id,
    label:       a.label,
    icon:        a.icon,
    cooldown:    a.cooldown,
    aim:         a.aim,
    effect:      a.tooltip,
    unlockLevel: def.stats.abilityUnlockLevels[slot],
  };
}

export function describeHero(id) {
  if (!Object.hasOwn(HEROES, id)) return null;
  const def = HEROES[id];
  // Same convention as describeTower: hand consumers display-ready matchup
  // entries, not the raw multiplier map, so a bare 0.5 vs 1.5 doesn't have to
  // be interpreted downstream.
  const { effective, weak } = describeMatchups({ kind: 'hero', heroId: id });
  return {
    kind: 'hero',
    id:             def.id,
    displayName:    def.displayName,
    shortName:      def.shortName,
    role:           def.role,
    portraitChar:   def.portraitChar,
    bodyColor:      def.bodyColor,
    strokeColor:    def.strokeColor,
    // stats.abilityUnlockLevels is a nested object, not a flat value, so a
    // shallow spread would still alias it to the live balance table.
    stats:            { ...def.stats, abilityUnlockLevels: { ...def.stats.abilityUnlockLevels } },
    unlockMapAfter:   def.unlockMapAfter,
    abilities:        ABILITY_SLOTS.map(slot => staticAbility(def, slot)),
    effectiveAgainst: effective.map(describeEnemyEntry),
    weakAgainst:      weak.map(describeEnemyEntry),
  };
}

// def must already be a resolved hero definition (e.g. HEROES.rael) — this
// function is called every tick by the HUD, so it validates only the slot,
// not hero identity; use describeHero(id) when starting from an id.
export function describeAbility(def, slot, opts = {}) {
  if (!def?.abilities || !Object.hasOwn(def.abilities, slot)) return null;
  const { level = 1, heroUnlocked = true, cooldownRemaining = 0 } = opts;
  const base = staticAbility(def, slot);

  if (!heroUnlocked) {
    return {
      ...base,
      state: 'locked_hero',
      cooldownRemaining: 0,
      lockReason: def.unlockMapAfter == null
        ? `${def.displayName} is locked`
        : `Clear Map ${def.unlockMapAfter + 1} to unlock ${def.displayName}`,
    };
  }
  if (level < base.unlockLevel) {
    return {
      ...base,
      state: 'locked_level',
      cooldownRemaining: 0,
      lockReason: `Unlocks at level ${base.unlockLevel}`,
    };
  }
  if (cooldownRemaining > 0) {
    return { ...base, state: 'cooldown', cooldownRemaining, lockReason: null };
  }
  return { ...base, state: 'available', cooldownRemaining: 0, lockReason: null };
}
