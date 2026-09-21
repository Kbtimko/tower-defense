// Display-ready shapes for the entity tables. Pure: no Phaser, no DOM, no
// game state — every consumer (wave popover, codex, tooltips) reads the same
// description of what a thing is, so the three surfaces cannot drift.
import { ENEMY_DEFS }                             from '../data/enemies.js';
import { TOWER_DEFS }                             from '../data/towers.js';
import { describeEnemyMatchups, describeMatchups } from '../data/weaknessMatrix.js';

const TIER_KEYS = ['tier2', 'tier3', 'tier4A', 'tier4B'];

export function describeEnemy(type) {
  const def = ENEMY_DEFS[type];
  if (!def) return null;
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
    vulnerableTo,
    resists,
  };
}

export function describeTower(type) {
  const def = TOWER_DEFS[type];
  if (!def) return null;
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
    soldierStats:      def.soldierStats ?? null,
    ability:           def.ability ?? null,
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
    effective,
    weak,
  };
}
