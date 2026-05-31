import { HEROES, HERO_ORDER } from './heroes.js';

export const WEAKNESS_MATRIX = {
  archer:   {                       skitter: 1.25, brute: 0.75, colossus: 0.75, phantom: 1.25, titan: 0.5  },
  mage:     { drone:  1.25,                                     colossus: 1.25, phantom: 1.5,  titan: 1.25 },
  cannon:   { drone:  0.75, skitter: 0.5,  brute: 1.5, colossus: 1.5,  phantom: 0.5,  titan: 1.25 },
  ice:      {                                                                                  titan: 0.75 },
  sniper:   {               skitter: 0.75, brute: 1.25, colossus: 1.5, phantom: 0.75, titan: 1.5  },
  barracks: {               skitter: 1.25, brute: 1.25,                phantom: 0.5,  titan: 0.75 },
};

export const TIER4_OVERRIDES = {
  archer: { B: {                       brute: 1.25, colossus: 1.25                          } },
  mage:   { B: {                       brute: 1.5,  colossus: 1.5                           } },
  cannon: { A: { skitter: 2.0                                                               } },
  ice:    { B: {                       brute: 1.5,  colossus: 1.5                           } },
  sniper: { A: {                                    colossus: 2.0,                titan: 2.5 } },
};

export function getWeaknessMultiplier(source, enemyType) {
  if (!source) return 1.0;
  if (source.kind === 'status') return 1.0;
  if (source.kind === 'hero') {
    return HEROES[source.heroId]?.matchups?.[enemyType] ?? 1.0;
  }
  if (source.kind === 'tower') {
    if (source.tier === 4 && source.branch) {
      const override = TIER4_OVERRIDES[source.type]?.[source.branch]?.[enemyType];
      if (override !== undefined) return override;
    }
    return WEAKNESS_MATRIX[source.type]?.[enemyType] ?? 1.0;
  }
  return 1.0;
}

const ENEMY_TYPES         = ['drone', 'skitter', 'brute', 'colossus', 'phantom', 'titan'];
const EFFECTIVE_THRESHOLD = 1.25;
const WEAK_THRESHOLD      = 0.75;

export function describeMatchups(source) {
  const effective = [], weak = [];
  if (!source) return { effective, weak };
  for (const enemy of ENEMY_TYPES) {
    const m = getWeaknessMultiplier(source, enemy);
    if (m >= EFFECTIVE_THRESHOLD) effective.push(enemy);
    else if (m <= WEAK_THRESHOLD)  weak.push(enemy);
  }
  return { effective, weak };
}

const TOWER_TYPES = ['archer', 'mage', 'cannon', 'ice', 'sniper', 'barracks'];

export function describeEnemyMatchups(enemyType) {
  const vulnerableTo = [], resists = [];
  for (const towerType of TOWER_TYPES) {
    const m = getWeaknessMultiplier({ kind:'tower', type:towerType, tier:1, branch:null }, enemyType);
    if (m >= EFFECTIVE_THRESHOLD) vulnerableTo.push(towerType);
    else if (m <= WEAK_THRESHOLD)  resists.push(towerType);
  }
  for (const heroId of HERO_ORDER) {
    const m = getWeaknessMultiplier({ kind:'hero', heroId }, enemyType);
    if (m >= EFFECTIVE_THRESHOLD) vulnerableTo.push(`hero:${heroId}`);
    else if (m <= WEAK_THRESHOLD)  resists.push(`hero:${heroId}`);
  }
  return { vulnerableTo, resists };
}

