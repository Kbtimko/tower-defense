// The campaign's economy SHAPE, not its numbers.
//
// Every dial used to move against the player at once: startGold fell 130 -> 100
// across the campaign while the board doubled and enemy HP rose 8.3x, so map 9
// opened with one tower on twenty slots. These assertions describe the shape a
// sane ramp has, so a future retune cannot quietly restore the collapse.
// Deliberately no literal values — see the spec for why.
import { describe, it, expect } from 'vitest';
import { MAPS } from './maps.js';
import { MAP_WAVES } from './waves.js';
import { TOWER_DEFS } from './towers.js';
import { goldCeiling } from '../sim/economy.js';

const CHEAPEST = Math.min(
  ...Object.values(TOWER_DEFS).filter(d => d.fireRate > 0).map(d => d.cost),
);

// What it costs to fill AND fully upgrade a board to the map's own tier cap.
// The existing cheapestFullBoardCost cannot see tier 4 — an archer costs 110
// taken to tier 2 but 310 taken to tier 4 — which is exactly why the collapse
// went unnoticed.
function depthBoardCost(map) {
  const def = TOWER_DEFS.archer;
  let per = def.cost;
  for (let t = 2; t <= (map.maxTierAllowed ?? 4); t++) {
    const tier = def[t === 4 ? 'tier4A' : `tier${t}`];
    if (tier) per += tier.cost;
  }
  return per * map.towerSlots.length;
}

const depthRatio = (map) =>
  goldCeiling(map, MAP_WAVES[map.id]).total / depthBoardCost(map);

const byId = (id) => MAPS.find(m => m.id === id);
const late = () => MAPS.filter(m => m.id >= 3).sort((a, b) => a.id - b.id);

describe('campaign economy ramp', () => {
  it('never shrinks the opening hand as the campaign goes on', () => {
    const gold = late().map(m => m.startGold);
    for (let i = 1; i < gold.length; i++) {
      expect(gold[i]).toBeGreaterThanOrEqual(gold[i - 1]);
    }
  });

  it('gives every map at least a two-tower opening hand', () => {
    // PR #34's own stated rule. Maps 6-9 violated it at 110/100 gold.
    for (const m of MAPS) {
      expect(m.startGold).toBeGreaterThanOrEqual(2 * CHEAPEST);
    }
  });

  it('does not let purchasing power collapse across the late campaign', () => {
    // Spread, not a monotonic test: rounding rewardMult to 2dp puts +/-0.017 of
    // jitter around the target, and a strict non-increasing assertion would fail
    // on a correct ramp.
    //
    // Map 5 is excluded: its rewardMult is a recorded per-map override (see the
    // comment in maps.js) that deliberately trades a uniform board-based depth
    // ratio for a monotonic gold-per-HP curve, because map 5's board is bigger
    // than map 4's but its threat is not. The two invariants disagree only for
    // this one map, and gold-per-HP is the one that matters here.
    const ratios = late().filter(m => m.id !== 5).map(depthRatio);
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThanOrEqual(0.05);
  });

  it('never makes a late map relatively richer than the early campaign', () => {
    const early = depthRatio(byId(2));
    for (const m of late()) {
      expect(depthRatio(m)).toBeLessThanOrEqual(early);
    }
  });

  it('scales the opening hand with the board, not a flat floor', () => {
    // The invariant this whole change exists for. Without it a FLAT campaign
    // passes every other assertion here: startGold 120 on every map satisfies
    // non-decreasing, clears the two-tower floor, and can still hold a uniform
    // depth ratio — while map 9 opens with 120 gold on twenty slots.
    for (const m of MAPS) {
      expect(m.startGold).toBeGreaterThanOrEqual(0.2 * CHEAPEST * m.towerSlots.length);
    }
  });

  it('leaves the on-ramp maps exactly as PR #71 calibrated them', () => {
    // Backlog #18 records the standing decision that this calibration STANDS.
    expect(byId(0).startGold).toBe(130);
    expect(byId(0).rewardMult).toBe(0.35);
    expect(byId(1).startGold).toBe(130);
    expect(byId(1).rewardMult).toBe(0.35);
    expect(byId(2).startGold).toBe(170);
    expect(byId(2).rewardMult).toBe(0.40);
  });
});
