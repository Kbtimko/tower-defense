// How the modelled player spends gold between waves.
//
// Kept separate from the simulator so the defence strategy can be swapped or
// tested on its own. The default models a competent-but-not-optimal player:
// rank the slots by how much of the path they actually cover, then fill the
// best free slot with the best tower currently affordable.
import { TOWER_DEFS } from '../data/towers.js';
import { remainingEnemyWeights, towerSpecAt, towerDpsAgainst, towerValueAgainst } from './matchupValue.js';

// How many sampled path points fall inside a tower's range from this slot.
// A slot that covers more of the route gets more shots at every enemy.
export function slotCoverage(zone, path, range) {
  let n = 0;
  for (const p of path) {
    if (Math.hypot(p.x - zone.cx, p.y - zone.cy) <= range) n++;
  }
  return n;
}

// Slot indices ordered best-first for a reference range.
export function rankSlots(buildZones, path, range = 120) {
  return buildZones
    .map((zone, index) => ({ index, coverage: slotCoverage(zone, path, range) }))
    .sort((a, b) => b.coverage - a.coverage || a.index - b.index)
    .map(s => s.index);
}

// Damage per second per gold — the yardstick for "best tower I can afford".
// Ignores splash and slow, so it under-rates cannon and ice; that is fine for a
// pessimistic model.
export function towerValue(type) {
  const def = TOWER_DEFS[type];
  return (def.damage * def.fireRate) / def.cost;
}

const BUYABLE = Object.keys(TOWER_DEFS).filter(t => TOWER_DEFS[t].fireRate > 0);

// Barracks are bought by an explicit rule rather than by towerValue, which is
// damage-per-gold and scores a fireRate-0 tower at zero. Blocking is not DPS:
// a halted enemy stops advancing altogether, so no damage metric can price it.
// One barracks is the standard opening a real player makes; it is a parameter
// so the report can show what the defence looks like with more or none.
const DEFAULT_BARRACKS_TARGET = 1;

// Cost of taking a tower from its current level to the next one, or null if it
// is already at the map's ceiling.
export function upgradeCost(tower, maxTier) {
  const nextTier = tower.level + 1;
  if (nextTier > maxTier) return null;
  const tierDef = TOWER_DEFS[tower.type][nextTier === 4 ? 'tier4A' : `tier${nextTier}`];
  return tierDef ? tierDef.cost : null;
}

// Greedy: fill the highest-coverage free slots with the best affordable tower,
// then spend whatever is left upgrading the towers already down. Models a
// player who widens the board first and deepens it once out of room — which is
// what the tower slots and per-map maxTierAllowed are designed around.
export function greedyBuildPlan({
  gold, slotsUsed, buildZones, path, towers = [], map = {},
  barracksTarget = DEFAULT_BARRACKS_TARGET,
  waves = null, waveNumber = 1, matchupAware = true,
}) {
  const ranked = rankSlots(buildZones, path);

  // Rank by the damage a tower will ACTUALLY land against what is still coming.
  // With no wave table — several tests call this function directly with a
  // hand-built context — fall back to the static damage-per-gold ranking so
  // those callers keep the behaviour they were written against.
  const weights = matchupAware ? remainingEnemyWeights(waves, waveNumber - 1) : new Map();
  const byValue = weights.size > 0
    ? [...BUYABLE].sort((a, b) =>
        towerValueAgainst(towerSpecAt(b), weights) - towerValueAgainst(towerSpecAt(a), weights)
        || a.localeCompare(b))
    : [...BUYABLE].sort((a, b) => towerValue(b) - towerValue(a));
  const maxTier = map.maxTierAllowed ?? 4;

  const purchases = [];
  let budget = gold;
  const taken = new Set(slotsUsed);

  let barracks = towers.filter(t => t.type === 'barracks').length;

  for (const slotIndex of ranked) {
    if (taken.has(slotIndex)) continue;
    // Below target, hold the gold for a barracks rather than spending it on a
    // cheaper tower — otherwise a greedy pass buys archers forever and the
    // opening barracks never happens on a poor map.
    const wantBarracks = barracks < barracksTarget;
    const pick = wantBarracks ? 'barracks' : byValue.find(t => TOWER_DEFS[t].cost <= budget);
    if (!pick || TOWER_DEFS[pick].cost > budget) break;
    if (wantBarracks) barracks++;
    budget -= TOWER_DEFS[pick].cost;
    taken.add(slotIndex);
    purchases.push({ type: pick, slotIndex });
  }

  // Upgrade pass. Each round buys the upgrade with the best marginal damage
  // gain per gold, so the budget goes where it actually raises throughput —
  // buying the CHEAPEST upgrade is how a tier-3 map spends most of its gold on
  // towers that cannot hurt what is coming. With no wave table, fall back to
  // cheapest-first so direct callers keep their original behaviour.
  const levels = towers.map(t => t.level);
  for (;;) {
    let bestIdx = -1, bestCost = Infinity, bestScore = -Infinity;
    for (let i = 0; i < towers.length; i++) {
      const level = levels[i];
      const cost = upgradeCost({ ...towers[i], level }, maxTier);
      if (cost === null || cost > budget) continue;

      if (weights.size === 0) {
        if (cost < bestCost) { bestCost = cost; bestIdx = i; }
        continue;
      }
      const type   = towers[i].type;
      const branch = towers[i].branch ?? null;
      const before = towerDpsAgainst(towerSpecAt(type, level, branch), weights);
      const after  = towerDpsAgainst(towerSpecAt(type, level + 1, branch), weights);
      const score  = (after - before) / cost;
      if (score > bestScore || (score === bestScore && cost < bestCost)) {
        bestScore = score; bestCost = cost; bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    budget -= bestCost;
    levels[bestIdx]++;
    purchases.push({ upgrade: true, towerIndex: bestIdx });
  }

  return purchases;
}
