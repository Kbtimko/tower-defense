// The codex catalogue. Encounter state is DERIVED from progress the game
// already stores — no new save field, no migration. "Reached" means the map is
// unlocked, not cleared, so an enemy you are currently losing to is documented.
import { TOWER_DEFS }  from '../data/towers.js';
import { HERO_ORDER }  from '../data/heroes.js';
import { ENEMY_DEFS }  from '../data/enemies.js';
import { MAPS }        from '../data/maps.js';
import { MAP_WAVES }   from '../data/waves.js';
import { describeTower, describeHero, describeEnemy } from './entityDescriptors.js';

// save is expected to be SaveManager-shaped. Bad input (missing/null save, or
// a save object that doesn't expose the two lookups) returns null, matching
// the null-on-unknown-input convention entityDescriptors uses for bad ids.
export function progressFromSave(save) {
  if (!save || typeof save.isUnlocked !== 'function' || typeof save.isHeroUnlocked !== 'function') {
    return null;
  }
  return {
    reachedMapIds:   MAPS.filter(m => save.isUnlocked(m.id)).map(m => m.id),
    unlockedHeroIds: HERO_ORDER.filter(id => save.isHeroUnlocked(id)),
  };
}

function enemyTypesOnMaps(mapIds) {
  const seen = new Set();
  for (const id of mapIds) {
    // mapIds is progress data and can be caller-controlled; MAP_WAVES is a
    // plain object literal, so a bare MAP_WAVES[id] would reach
    // Object.prototype for keys like 'constructor'. Object.hasOwn keeps the
    // lookup to the table's own entries (same guard as wavePreview.js).
    if (!Object.hasOwn(MAP_WAVES, id)) continue;
    for (const wave of MAP_WAVES[id]) {
      for (const group of wave) seen.add(group.type);
    }
  }
  return seen;
}

export function buildCatalog({ reachedMapIds = [], unlockedHeroIds = [] } = {}) {
  const seenEnemies = enemyTypesOnMaps(reachedMapIds);
  const heroSet     = new Set(unlockedHeroIds);

  return {
    // Every tower is purchasable from the first wave of the first map, so
    // there is nothing to discover and nothing to gate.
    towers:  Object.keys(TOWER_DEFS).map(t => ({ ...describeTower(t), encountered: true })),
    heroes:  HERO_ORDER.map(id      => ({ ...describeHero(id),  encountered: heroSet.has(id) })),
    enemies: Object.keys(ENEMY_DEFS).map(t => ({ ...describeEnemy(t), encountered: seenEnemies.has(t) })),
  };
}
