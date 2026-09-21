import { describe, it, expect } from 'vitest';
import { buildCatalog, progressFromSave } from './codexCatalog.js';
import { TOWER_DEFS } from '../data/towers.js';
import { HERO_ORDER, HEROES } from '../data/heroes.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { MAP_WAVES } from '../data/waves.js';

function enemyTypesInWaves(waves) {
  const seen = new Set();
  for (const wave of waves) for (const group of wave) seen.add(group.type);
  return seen;
}

// First map id (ascending) whose wave table introduces `type` — derived from
// the real data instead of assumed, since map composition has already been
// retuned once during this project.
function firstMapIntroducing(type) {
  for (const id of ALL_MAP_IDS) {
    if (enemyTypesInWaves(MAP_WAVES[id]).has(type)) return id;
  }
  return null;
}

const ALL_MAP_IDS     = Object.keys(MAP_WAVES).map(Number).sort((a, b) => a - b);
const MAP0_ENEMY_TYPES = [...enemyTypesInWaves(MAP_WAVES[0])].sort();

const NOTHING = { reachedMapIds: [0], unlockedHeroIds: [HERO_ORDER[0]] };
const ALL     = { reachedMapIds: ALL_MAP_IDS, unlockedHeroIds: [...HERO_ORDER] };

describe('buildCatalog', () => {
  it('lists every tower, hero and enemy regardless of progress', () => {
    const c = buildCatalog(NOTHING);
    expect(c.towers.length).toBe(Object.keys(TOWER_DEFS).length);
    expect(c.heroes.length).toBe(HERO_ORDER.length);
    expect(c.enemies.length).toBe(Object.keys(ENEMY_DEFS).length);
  });

  // All six towers are purchasable from wave 1, so gating them would be a lie.
  it('marks every tower encountered even on a fresh save', () => {
    for (const t of buildCatalog(NOTHING).towers) expect(t.encountered).toBe(true);
  });

  it('marks only map-0 enemies encountered on a fresh save', () => {
    const c = buildCatalog(NOTHING);
    const seen = c.enemies.filter(e => e.encountered).map(e => e.type).sort();
    expect(seen).toEqual(MAP0_ENEMY_TYPES);
    // Independent check, not routed through enemyTypesInWaves: a bug in that
    // helper's iteration would be mirrored by the same bug in the
    // implementation's own iteration and this test would still pass. Verified
    // by hand against src/data/waves.js MAP_WAVES[0] — do not re-derive this.
    expect(seen).toEqual(['brute', 'drone', 'skitter']);
  });

  it('tolerates null and undefined progress (the shape progressFromSave returns for a bad save)', () => {
    for (const progress of [null, undefined]) {
      const c = buildCatalog(progress);
      expect(c.enemies.length).toBe(Object.keys(ENEMY_DEFS).length);
      expect(c.enemies.every(e => e.encountered === false)).toBe(true);
      expect(c.towers.every(t => t.encountered === true)).toBe(true);
    }
  });

  it('composes with progressFromSave on a missing/malformed save without throwing', () => {
    expect(() => buildCatalog(progressFromSave(null))).not.toThrow();
    expect(() => buildCatalog(progressFromSave(undefined))).not.toThrow();
    const c = buildCatalog(progressFromSave(null));
    expect(c.enemies.every(e => e.encountered === false)).toBe(true);
    expect(c.towers.every(t => t.encountered === true)).toBe(true);
  });

  it('marks an enemy encountered once the map introducing it is reached, and not an enemy introduced later', () => {
    const earlierType = MAP0_ENEMY_TYPES[0];
    const earlierMap   = firstMapIntroducing(earlierType);
    // Find some enemy type whose first map is strictly later than earlierMap,
    // so we have a real "not yet encountered" case to assert against.
    const laterType = Object.keys(ENEMY_DEFS)
      .map(type => ({ type, firstMap: firstMapIntroducing(type) }))
      .filter(({ firstMap }) => firstMap !== null && firstMap > earlierMap)
      .sort((a, b) => b.firstMap - a.firstMap)[0];
    expect(laterType).toBeTruthy(); // guards the test's own premise

    const reachedUpToEarlier = ALL_MAP_IDS.filter(id => id <= earlierMap);
    const c = buildCatalog({ reachedMapIds: reachedUpToEarlier, unlockedHeroIds: [] });
    expect(c.enemies.find(e => e.type === earlierType).encountered).toBe(true);
    expect(c.enemies.find(e => e.type === laterType.type).encountered).toBe(false);
  });

  it('marks everything encountered at full progress', () => {
    const c = buildCatalog(ALL);
    for (const group of [c.towers, c.heroes, c.enemies]) {
      for (const entry of group) expect(entry.encountered).toBe(true);
    }
  });

  it('gates heroes on the unlocked list', () => {
    const c = buildCatalog(NOTHING);
    expect(c.heroes.find(h => h.id === HERO_ORDER[0]).encountered).toBe(true);
    expect(c.heroes.find(h => h.id === HERO_ORDER[1]).encountered).toBe(false);
  });

  it('carries the full descriptor on every entry', () => {
    const c = buildCatalog(ALL);
    expect(c.enemies[0].hp).toBeGreaterThan(0);
    expect(c.towers[0].tiers.length).toBe(4);
    expect(c.heroes[0].abilities.length).toBe(3);
  });

  it('tolerates an empty progress object', () => {
    const c = buildCatalog({});
    expect(c.enemies.every(e => e.encountered === false)).toBe(true);
    expect(c.towers.every(t => t.encountered === true)).toBe(true);
  });

  it('ignores a reached map id that is not a real map, instead of reaching Object.prototype', () => {
    // Object.prototype keys (e.g. 'constructor', 'toString') must not resolve
    // through a bare MAP_WAVES[id] lookup and leak every enemy as encountered.
    const c = buildCatalog({ reachedMapIds: [0, 999, 'constructor'], unlockedHeroIds: [] });
    const seen = c.enemies.filter(e => e.encountered).map(e => e.type).sort();
    expect(seen).toEqual(MAP0_ENEMY_TYPES);
  });

  it('does not let a mutated catalog entry reach the underlying data tables', () => {
    const c = buildCatalog(ALL);
    const tower = c.towers[0];
    const originalLabel = TOWER_DEFS[tower.type].tier2.label;
    tower.tiers[0].label = 'MUTATED';
    expect(TOWER_DEFS[tower.type].tier2.label).toBe(originalLabel);

    const hero = c.heroes[0];
    const originalUnlockLevel = HEROES[hero.id].stats.abilityUnlockLevels.q;
    hero.stats.abilityUnlockLevels.q = 999;
    expect(HEROES[hero.id].stats.abilityUnlockLevels.q).toBe(originalUnlockLevel);

    const enemy = c.enemies[0];
    const originalHp = ENEMY_DEFS[enemy.type].hp;
    enemy.hp = 999999;
    expect(ENEMY_DEFS[enemy.type].hp).toBe(originalHp);
    // hp is a primitive so the above can't catch a shared-reference bug;
    // vulnerableTo is the enemy entry's one nested structure, so mutate that
    // and confirm a fresh build for the same type isn't affected.
    const originalVulnerableCount = enemy.vulnerableTo.length;
    enemy.vulnerableTo.push({ kind: 'tower', type: 'bogus', name: 'bogus', icon: '?' });
    const freshEnemy = buildCatalog(ALL).enemies.find(e => e.type === enemy.type);
    expect(freshEnemy.vulnerableTo.length).toBe(originalVulnerableCount);
  });
});

describe('progressFromSave', () => {
  it('reads reached maps and unlocked heroes from a SaveManager-shaped object', () => {
    const fakeSave = {
      isUnlocked:     (id) => id <= 3,
      isHeroUnlocked: (id) => id === 'rael' || id === 'engineer',
    };
    const p = progressFromSave(fakeSave);
    expect(p.reachedMapIds).toEqual([0, 1, 2, 3]);
    expect(p.unlockedHeroIds).toEqual(['rael', 'engineer']);
  });

  it('returns null for a missing or malformed save, matching the null-on-bad-input convention', () => {
    expect(progressFromSave(null)).toBeNull();
    expect(progressFromSave(undefined)).toBeNull();
    expect(progressFromSave({})).toBeNull();
    expect(progressFromSave({ isUnlocked: () => true })).toBeNull(); // missing isHeroUnlocked
  });
});
