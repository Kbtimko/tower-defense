import { describe, it, expect } from 'vitest';
import { greedyBuildPlan } from './buildPolicy.js';
import { TOWER_DEFS } from '../data/towers.js';

const zones = [{ cx: 0, cy: 0 }, { cx: 5, cy: 0 }, { cx: 10, cy: 0 }];
const path  = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];

const titanWaves   = [[{ type: 'titan',   count: 4, interval: 1000 }]];
const skitterWaves = [[{ type: 'skitter', count: 20, interval: 500 }]];
const droneWaves   = [[{ type: 'drone',   count: 10, interval: 1000 }]];

// barracksTarget: 0 isolates the damage ranking from the opening-barracks rule.
const plan = (over = {}) => greedyBuildPlan({
  gold: 1000, slotsUsed: new Set(), buildZones: zones, path, towers: [],
  barracksTarget: 0, waveNumber: 1, ...over,
});

describe('greedyBuildPlan purchase pass', () => {
  it('does not open with an archer when titans are what is coming', () => {
    // The defect this whole plan exists for: towerValue ranks archer FIRST,
    // and archer lands 1 damage a shot on a titan.
    expect(plan({ waves: titanWaves })[0].type).not.toBe('archer');
  });

  it('opens with an archer when the mix is skitters', () => {
    // Proves the choice tracks the mix instead of becoming a new fixed order.
    expect(plan({ waves: skitterWaves })[0].type).toBe('archer');
  });

  it('ranks by value per GOLD, not by raw damage per second', () => {
    // A drone mix separates the two metrics: raw DPS favours the sniper (24 vs
    // 15) while value per gold favours the archer (0.2500 vs 0.2000). An
    // implementation that forgot to divide by cost would open with a sniper and
    // this is the only test that would notice.
    expect(plan({ waves: droneWaves })[0].type).toBe('archer');
  });

  it('reproduces the naive ranking when matchupAware is off', () => {
    const naiveFirst = plan({ waves: titanWaves, matchupAware: false })[0].type;
    const noWaves    = plan({})[0].type;
    expect(naiveFirst).toBe(noWaves);
  });

  it('falls back to the naive ranking when ctx carries no waves', () => {
    // simulate.test.js and soldiers.test.js call this function directly with
    // hand-built contexts that have no wave table. They must keep their meaning.
    expect(plan({}).length).toBeGreaterThan(0);
    expect(plan({})[0].type).toBe(plan({ matchupAware: false })[0].type);
  });

  it('falls back when the wave table is exhausted', () => {
    const p = plan({ waves: titanWaves, waveNumber: 99 });
    expect(p.length).toBeGreaterThan(0);
  });

  it('still never spends more gold than it has', () => {
    const p = plan({ waves: titanWaves, gold: 130 });
    const spent = p.reduce((s, x) => s + (x.type ? TOWER_DEFS[x.type].cost : 0), 0);
    expect(spent).toBeLessThanOrEqual(130);
  });

  it('still never reuses an occupied slot', () => {
    const p = plan({ waves: titanWaves, slotsUsed: new Set([0]) });
    expect(p.every(x => x.slotIndex !== 0)).toBe(true);
  });

  it('still opens with a barracks when one is wanted', () => {
    const p = plan({ waves: titanWaves, barracksTarget: 1 });
    expect(p[0].type).toBe('barracks');
  });

  it('is deterministic — the same context yields the same plan', () => {
    // simulateMap has a determinism test that runs through this policy. A
    // comparator without a stable tie-break could reorder equal-scoring towers
    // between runs and make that test flake intermittently.
    const a = plan({ waves: titanWaves });
    const b = plan({ waves: titanWaves });
    expect(a).toEqual(b);
  });
});

describe('greedyBuildPlan upgrade pass', () => {
  const upgradeOnly = (over = {}) => greedyBuildPlan({
    gold: 400, slotsUsed: new Set([0, 1, 2]), buildZones: zones, path,
    barracksTarget: 0, waveNumber: 1, ...over,
  });

  it('prefers the upgrade that buys more damage over the merely cheapest', () => {
    // Ice T2 is the cheapest upgrade on the board (55g) but ice lands 1 damage
    // a shot on a titan at every tier below 4. Against titans the sniper
    // upgrade must win despite costing more.
    const p = upgradeOnly({
      waves: titanWaves,
      towers: [{ type: 'ice', level: 1 }, { type: 'sniper', level: 1 }],
    });
    const first = p.find(x => x.upgrade);
    expect(first).toBeDefined();
    expect(first.towerIndex).toBe(1);
  });

  it('still respects the map tier ceiling', () => {
    const p = upgradeOnly({
      waves: titanWaves, map: { maxTierAllowed: 1 },
      towers: [{ type: 'sniper', level: 1 }],
    });
    expect(p.some(x => x.upgrade)).toBe(false);
  });

  it('never spends more than the budget on upgrades', () => {
    const p = upgradeOnly({
      gold: 60, waves: titanWaves,
      towers: [{ type: 'sniper', level: 1 }, { type: 'ice', level: 1 }],
    });
    expect(p.filter(x => x.upgrade).length).toBeLessThanOrEqual(1);
  });

  it('falls back to cheapest-first with no wave table', () => {
    const p = upgradeOnly({ towers: [{ type: 'ice', level: 1 }, { type: 'sniper', level: 1 }] });
    const first = p.find(x => x.upgrade);
    expect(first.towerIndex).toBe(0);   // ice T2 at 55g is the cheapest
  });
});
