// Tier-4 sweep: how much does ONE tower taken to T3, 4A or 4B move a map?
//
// The anchor is bought first and levelled ahead of everything else; the map's
// best strategy then spends whatever gold is left. Holding the rest of the
// defence at the map's own best isolates the anchor's contribution.
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';
import { simulateMap } from './simulate.js';
import { findWinMultiplier } from './deficit.js';
import { bestStrategy, strategyPlan, strategyLabel } from './strategy.js';
import { rankSlots } from './buildPolicy.js';

export const ANCHOR_TIERS = Object.freeze(['T3', '4A', '4B']);

const ANCHOR_TAG = 'anchor';

const targetLevel = tier => (tier === 'T3' ? 3 : 4);
const branchOf = tier => (tier === '4A' ? 'A' : tier === '4B' ? 'B' : undefined);

export function anchoredPlan(basePlan, { type, tier }) {
  const goal = targetLevel(tier);
  const branch = branchOf(tier);
  const def = TOWER_DEFS[type];

  return ctx => {
    const anchorIndex = ctx.towers.findIndex(t => t.tag === ANCHOR_TAG);
    const purchases = [];
    let gold = ctx.gold;
    const slotsUsed = new Set(ctx.slotsUsed);

    if (anchorIndex === -1) {
      // Hold the gold until the anchor is affordable: the base plan would
      // otherwise spend it on towers the anchor is meant to precede.
      if (def.cost > gold) return [];
      const slot = rankSlots(ctx.buildZones, ctx.path).find(i => !ctx.slotsUsed.has(i));
      if (slot === undefined) return basePlan(ctx);
      purchases.push({
        type, slotIndex: slot, maxTier: goal, tag: ANCHOR_TAG,
        ...(branch && { branch }),
      });
      gold -= def.cost;
      slotsUsed.add(slot);
    } else {
      // The sim applies upgrades in order against its own gold, so mirror its
      // refusals here: stop at the first step that is capped or unaffordable.
      const cap = Math.min(ctx.map?.maxTierAllowed ?? 4, goal);
      for (let next = ctx.towers[anchorIndex].level + 1; next <= cap; next++) {
        const key = next === 4 ? `tier4${branch}` : `tier${next}`;
        const cost = def[key]?.cost;
        if (cost === undefined || cost > gold) break;
        purchases.push({ upgrade: true, towerIndex: anchorIndex, ...(next === 4 && { branch }) });
        gold -= cost;
      }
    }

    return [...purchases, ...(basePlan({ ...ctx, gold, slotsUsed }) ?? [])];
  };
}

// Observes ctx.towers at each build phase: the first phase that starts with the
// anchor at its target level is the wave it "reached" the tier.
function watchAnchor(plan, goal) {
  let phase = 0;
  let reachedAt = null;
  const watched = ctx => {
    phase++;
    if (reachedAt === null && ctx.towers.some(t => t.tag === ANCHOR_TAG && t.level >= goal)) reachedAt = phase;
    return plan(ctx);
  };
  return { plan: watched, reached: () => reachedAt };
}

export function sweepMaps() {
  return MAPS.filter(m => (m.maxTierAllowed ?? 4) === 4);
}

export function runT4Sweep(map, waves, { waveTiming } = {}) {
  const { best } = bestStrategy(map, waves, { waveTiming });
  const basePlan = strategyPlan(best.strategy);

  const livesMult = best.multiplier ?? 8;
  const rows = [];
  for (const type of Object.keys(TOWER_DEFS)) {
    for (const tier of ANCHOR_TIERS) {
      const buildPlan = anchoredPlan(basePlan, { type, tier });
      // At 1x most maps are lost by wave 1-2 and every row reads 0% lives, so
      // lives are measured where the baseline wins; the multiplier column stays
      // the anchored plan's own win multiplier.
      const { plan: watched, reached } = watchAnchor(buildPlan, targetLevel(tier));
      const run = simulateMap({ map, waves, buildPlan: watched, waveTiming, damageMult: livesMult });
      rows.push({
        type, tier,
        multiplier: findWinMultiplier(map, waves, { buildPlan, waveTiming }),
        livesKept: run.livesRemaining / map.startLives,
        reachedWave: reached(),
      });
    }
  }

  return {
    map,
    livesMult,
    baseline: { label: strategyLabel(best.strategy), multiplier: best.multiplier, livesKept: best.livesKept },
    rows,
  };
}
