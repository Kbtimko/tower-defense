// Tier-4 sweep: how much does ONE tower taken to T3, 4A or 4B move a map?
//
// The anchor is bought first and levelled ahead of everything else; the map's
// best strategy then spends whatever gold is left. Holding the rest of the
// defence at the map's own best isolates the anchor's contribution.
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';
import { simulateMap } from './simulate.js';
import { findWinMultiplier, WIN_MULTIPLIER_MAX } from './deficit.js';
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
    let towers = ctx.towers;

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
      let level = ctx.towers[anchorIndex].level;
      for (let next = level + 1; next <= cap; next++) {
        const key = next === 4 ? `tier4${branch}` : `tier${next}`;
        const cost = def[key]?.cost;
        if (cost === undefined || cost > gold) break;
        purchases.push({ upgrade: true, towerIndex: anchorIndex, ...(next === 4 && { branch }) });
        gold -= cost;
        level = next;
      }
      // The upgrades apply before the base plan's purchases, so show it the
      // anchor already upgraded or it budgets for a step that is paid for.
      towers = ctx.towers.map((t, i) => (i === anchorIndex ? { ...t, level } : t));
    }

    return [...purchases, ...(basePlan({ ...ctx, towers, gold, slotsUsed }) ?? [])];
  };
}

// Observes ctx.towers at each build phase. Purchases apply inside the build
// before wave k, so a tier first seen at the start of phase k was bought before
// wave k-1; one bought in the final build is only visible after the run, via
// the live array.
export function watchAnchor(plan, goal) {
  let phase = 0;
  let reachedAt = null;
  let towers = [];
  const atGoal = () => towers.some(t => t.tag === ANCHOR_TAG && t.level >= goal);
  const watched = ctx => {
    phase++;
    towers = ctx.towers;
    if (reachedAt === null && atGoal()) reachedAt = phase - 1;
    return plan(ctx);
  };
  return { plan: watched, reached: () => reachedAt ?? (phase > 0 && atGoal() ? phase : null) };
}

export function sweepMaps() {
  return MAPS.filter(m => (m.maxTierAllowed ?? 4) === 4);
}

export function runT4Sweep(map, waves, { waveTiming } = {}) {
  const { best } = bestStrategy(map, waves, { waveTiming });
  const basePlan = strategyPlan(best.strategy);

  const livesMult = best.multiplier ?? WIN_MULTIPLIER_MAX;
  const baselineRun = simulateMap({ map, waves, buildPlan: basePlan, waveTiming, damageMult: livesMult });
  const rows = [];
  for (const type of Object.keys(TOWER_DEFS)) {
    for (const tier of ANCHOR_TIERS) {
      const buildPlan = anchoredPlan(basePlan, { type, tier });
      // At 1x most maps are lost by wave 1-2 and every row reads 0% lives, so
      // lives are measured where the baseline wins; the multiplier column stays
      // the anchored plan's own win multiplier.
      const run = simulateMap({ map, waves, buildPlan, waveTiming, damageMult: livesMult });
      const multiplier = findWinMultiplier(map, waves, { buildPlan, waveTiming });
      // Reach is read from a run at the row's own win multiplier: at livesMult
      // the anchor can die before the tier it would hold in the winning run.
      const { plan: watched, reached } = watchAnchor(buildPlan, targetLevel(tier));
      simulateMap({ map, waves, buildPlan: watched, waveTiming, damageMult: multiplier ?? WIN_MULTIPLIER_MAX });
      rows.push({
        type, tier, multiplier,
        livesKept: run.livesRemaining / map.startLives,
        reachedWave: reached(),
      });
    }
  }

  return {
    map,
    livesMult,
    baseline: { label: strategyLabel(best.strategy), multiplier: best.multiplier, livesKept: baselineRun.livesRemaining / map.startLives },
    rows,
  };
}
