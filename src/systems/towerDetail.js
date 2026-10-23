// What the tower inspector peek and the ring's branch peek say about a tower.
// Pure, so the wording is testable without a scene and both peeks cannot drift.
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';
import { describeMatchups, TIER4_OVERRIDES } from '../data/weaknessMatrix.js';
import { describeTowerArmour } from './armourLegibility.js';
import { shortEnemyName } from './entityDescriptors.js';
import { unlockMapNumber } from './radialItems.js';

// Reads the live tower (not a type/tier lookup): the placed entity already
// carries tier upgrades, meta multipliers and tier-4 overrides such as pierce.
export function describeTowerDetail(tower) {
  const def = TOWER_DEFS[tower.type];
  const branchLabel = tower.branch ? ` · ${def['tier4' + tower.branch]?.label ?? ''}` : '';
  return {
    name: `${def.icon} ${def.name}${branchLabel}`,
    level: `Level: ${tower.level}/4`,
    stats: tower.type === 'barracks' ? soldierLines(tower.soldierStats) : firingLines(tower),
    matchups: matchupLines(tower),
    armour: armourLine(tower),
  };
}

export function describeBranchPreview({ towerType, branch, damageMult = 1, locked, towerDefs = TOWER_DEFS }) {
  const def = towerDefs[towerType];
  const tierDef = def['tier4' + branch];
  // Mirror Tower.upgrade: the branch lands its table damage scaled by the
  // tower's meta-upgrade multiplier, and a branch-set pierce wins.
  const damage = Math.round((tierDef.damage ?? 0) * damageMult);
  const pierce = Boolean(tierDef.pierce ?? def.pierce);
  const headline = headlineOverride(towerType, branch);
  return {
    label: tierDef.label,
    effect: tierDef.passiveEffect,
    matchup: headline ? `⚡ ${headline.value}× vs ${headline.name}` : null,
    // Shown on a locked branch too, so the choice is legible before it unlocks.
    armourRows: describeTowerArmour({ damage, pierce }),
    lockText: locked ? `🔒 Unlocked on Map ${unlockMapNumber(4, MAPS)}` : null,
  };
}

// One line for the ring's upgrade/branch peek. Mirrors Tower.upgrade (table
// value × the tower's meta multiplier, rounded) and Barracks.upgrade (soldier
// stats by tier key), so the preview is what the purchase actually lands.
export function describeUpgradeDelta(tower, tier, branch = null) {
  const key = tier === 4 && branch ? `tier4${branch}` : `tier${tier}`;
  const arrow = (name, from, to) => `${name} ${from} → ${to}`;
  if (tower.type === 'barracks') {
    const now = tower.soldierStats;
    const next = TOWER_DEFS.barracks.soldierStats[key] ?? now;
    return [arrow('HP', now.hp, next.hp), arrow('DMG', now.damage, next.damage)].join(' · ');
  }
  const tierDef = TOWER_DEFS[tower.type][key];
  const parts = [];
  if (tierDef.damage !== undefined) parts.push(arrow('DMG', tower.damage, Math.round(tierDef.damage * (tower._damageMult ?? 1))));
  if (tierDef.range !== undefined) parts.push(arrow('RNG', tower.range, Math.round(tierDef.range * (tower._rangeMult ?? 1))));
  return parts.join(' · ');
}

function firingLines(tower) {
  return [
    `Damage: ${tower.damage}`,
    `Range: ${tower.range}`,
    `Fire rate: ${(tower.fireRate * 100).toFixed(0)}%`,
  ];
}

function soldierLines(ss) {
  return [
    `Soldiers: ${ss.count}`,
    `HP: ${ss.hp} each`,
    `DMG: ${ss.damage} each`,
    `Respawn: ${ss.respawnDuration}s`,
    `Blocks: ${ss.canBlockFlyers ? 'Ground + Air' : 'Ground'}`,
  ];
}

function matchupLines(tower) {
  const m = describeMatchups({ kind: 'tower', type: tower.type, tier: tower.level, branch: tower.branch });
  const names = (types) => types.map(shortEnemyName).join(', ');
  const lines = [];
  if (m.effective.length) lines.push({ tone: 'good', text: `Effective vs: ${names(m.effective)}` });
  if (m.weak.length)      lines.push({ tone: 'bad',  text: `Weak vs: ${names(m.weak)}` });
  return lines;
}

// Flat armour is subtracted before any multiplier, so a tower at or below an
// enemy's armour lands exactly 1 a shot — something the matchup line, read
// only from the multiplicative weakness matrix, cannot say.
function armourLine(tower) {
  const isBarracks = tower.type === 'barracks';
  // A barracks deals no damage itself; its soldiers are its damage.
  const damage = isBarracks ? (tower.soldierStats?.damage ?? 0) : tower.damage;
  const rows = describeTowerArmour({ damage, pierce: Boolean(tower.pierce) });
  if (!rows.length) return null;
  return { head: isBarracks ? '🛡 Armour absorbs (soldiers): ' : '🛡 Armour absorbs: ', rows };
}

function headlineOverride(towerType, branch) {
  const cells = TIER4_OVERRIDES[towerType]?.[branch];
  if (!cells || Object.keys(cells).length === 0) return null;
  let bestEnemy = null;
  let bestVal = -Infinity;
  for (const enemy of Object.keys(cells).sort()) { // alphabetical tiebreak
    const v = cells[enemy];
    if (v > bestVal) { bestVal = v; bestEnemy = enemy; }
  }
  return { enemy: bestEnemy, value: bestVal, name: shortEnemyName(bestEnemy) };
}
