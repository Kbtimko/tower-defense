import { describe, it, expect } from 'vitest';
import { greedyBuildPlan, OPENINGS, upgradeCost } from './buildPolicy.js';
import { simulateMap } from './simulate.js';
import { MAPS } from '../data/maps.js';
import { MAP_WAVES } from '../data/waves.js';
import { TOWER_DEFS } from '../data/towers.js';

const zones = [{ cx: 0, cy: 0 }, { cx: 5, cy: 0 }, { cx: 10, cy: 0 }];
const path  = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];

const titanWaves   = [[{ type: 'titan',   count: 4, interval: 1000 }]];
const skitterWaves = [[{ type: 'skitter', count: 20, interval: 500 }]];
const droneWaves   = [[{ type: 'drone',   count: 10, interval: 1000 }]];
const phantomWaves = [[{ type: 'phantom', count: 12, interval: 500 }]];
const isBarracks = x => x.type === 'barracks';

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

describe('greedyBuildPlan opening', () => {
  // The shared `plan` helper zeroes barracksTarget; these tests are about the
  // barracks, so they put the standard target of 1 back.
  const open = (over = {}) => plan({ barracksTarget: 1, ...over });

  it("defaults to 'start', which buys the barracks first", () => {
    expect(open({ waves: phantomWaves })).toEqual(open({ waves: phantomWaves, opening: 'start' }));
    expect(open({ waves: phantomWaves, opening: 'start' })[0].type).toBe('barracks');
  });

  it("'none' never buys a barracks", () => {
    expect(open({ waves: droneWaves, opening: 'none' }).some(isBarracks)).toBe(false);
  });

  it("'beforeGround' skips the barracks ahead of an all-flying wave", () => {
    // Tier-1 soldiers cannot block flyers: map 9's wave 1 is 12 phantoms.
    expect(open({ waves: phantomWaves, opening: 'beforeGround' }).some(isBarracks)).toBe(false);
  });

  it("'beforeGround' buys the barracks ahead of a wave with any ground enemy", () => {
    const mixed = [[
      { type: 'phantom', count: 12, interval: 500 },
      { type: 'drone',   count: 1,  interval: 500 },
    ]];
    expect(open({ waves: mixed, opening: 'beforeGround' })[0].type).toBe('barracks');
  });

  it("'beforeGround' reads only the upcoming wave", () => {
    const waves = [phantomWaves[0], droneWaves[0]];
    expect(open({ waves, waveNumber: 1, opening: 'beforeGround' }).some(isBarracks)).toBe(false);
    expect(open({ waves, waveNumber: 2, opening: 'beforeGround' })[0].type).toBe('barracks');
  });

  it("'beforeGround' buys nothing past the last wave", () => {
    expect(open({ waves: droneWaves, waveNumber: 99, opening: 'beforeGround' }).some(isBarracks)).toBe(false);
  });

  it("'beforeGround' does not count an unknown enemy type as ground", () => {
    const unknown = [[{ type: 'not-an-enemy', count: 5, interval: 500 }]];
    expect(open({ waves: unknown, opening: 'beforeGround' }).some(isBarracks)).toBe(false);
  });

  it("'beforeGround' behaves as 'start' with no wave table", () => {
    // simulate.test.js and soldiers.test.js call the policy with hand-built
    // contexts that carry no waves; they must keep their meaning.
    expect(open({ opening: 'beforeGround' })).toEqual(open({ opening: 'start' }));
  });

  it('keeps counting a barracks already on the board toward the target', () => {
    const p = open({
      waves: droneWaves, opening: 'beforeGround',
      towers: [{ type: 'barracks', level: 1 }], slotsUsed: new Set([0]),
    });
    expect(p.some(isBarracks)).toBe(false);
  });

  it('rejects an unknown opening instead of silently playing the default', () => {
    expect(() => open({ waves: droneWaves, opening: 'beforeGrond' })).toThrow(/opening/);
  });

  it('exports every opening it accepts', () => {
    for (const opening of OPENINGS) {
      expect(() => open({ waves: droneWaves, opening })).not.toThrow();
    }
  });
});

describe('greedyBuildPlan barracks depth (barracksTier)', () => {
  // One barracks already standing in slot 0, drones coming, plenty of gold.
  const depth = (over = {}) => greedyBuildPlan({
    gold: 1000, slotsUsed: new Set([0]), buildZones: zones, path,
    towers: [{ type: 'barracks', level: 1 }], barracksTarget: 1,
    waves: droneWaves, waveNumber: 1, map: { maxTierAllowed: 4 }, ...over,
  });
  const leadingUpgrades = p => { let n = 0; while (p[n]?.upgrade) n++; return n; };

  it('upgrades a standing barracks to the target tier before buying anything', () => {
    const p = depth({ barracksTier: 3 });
    expect(leadingUpgrades(p)).toBe(2);                       // T1 -> T2 -> T3
    expect(p.slice(0, 2).every(x => x.towerIndex === 0)).toBe(true);
    expect(p[2].type).toBeDefined();                          // then a purchase
  });

  it('defaults to tier 1: nothing jumps the queue', () => {
    expect(depth()[0].upgrade).toBeUndefined();
  });

  it('stops the depth pass at the map tier ceiling (via upgradeCost)', () => {
    expect(leadingUpgrades(depth({ barracksTier: 3, map: { maxTierAllowed: 2 } }))).toBe(1);
  });

  it('skips an unaffordable tier and spends the gold elsewhere', () => {
    // Barracks T2 costs 65; 60 buys an archer instead of being held.
    const p = depth({ barracksTier: 3, gold: 60 });
    expect(p.some(x => x.upgrade)).toBe(false);
    expect(p[0].type).toBe('archer');
  });

  it('does not upgrade a barracks bought in the same round', () => {
    const p = depth({ towers: [], slotsUsed: new Set(), barracksTier: 3 });
    expect(p[0].type).toBe('barracks');
    expect(p.some(x => x.upgrade)).toBe(false);
  });

  it('hands the scored upgrade pass the levels it already bought', () => {
    // The proof relies on the scored pass buying barracks tiers at score 0 when
    // nothing else is upgradeable. If that pass is ever capped for barracks,
    // switch this test to a firing tower to keep guarding stale levels.
    // Capped at T3, so the depth pass stops at the cap. A scored pass reading
    // the STALE level (T1) would buy a third barracks upgrade past the cap.
    const p = depth({ barracksTier: 3, map: { maxTierAllowed: 3 }, slotsUsed: new Set([0, 1, 2]) });
    expect(p.filter(x => x.upgrade && x.towerIndex === 0)).toHaveLength(2);
  });

  it('never spends more than it has across depth upgrades and purchases', () => {
    const gold = 300;
    const p = depth({ barracksTier: 3, gold });
    let level = 1, spent = 0;
    for (const x of p) {
      if (x.upgrade) { spent += upgradeCost({ type: 'barracks', level }, 4); level++; }
      else spent += TOWER_DEFS[x.type].cost;
    }
    expect(spent).toBeLessThanOrEqual(gold);
  });
});

describe('greedyBuildPlan defaults', () => {
  it("reproduces today's policy on a real map: opening 'start', barracksTier 1", () => {
    // Map 6 buys and fights with a barracks, so both defaults are exercised.
    const map = MAPS[6], waves = MAP_WAVES[6];
    const implicit = simulateMap({ map, waves, buildPlan: greedyBuildPlan });
    const explicit = simulateMap({
      map, waves,
      buildPlan: ctx => greedyBuildPlan({ ...ctx, opening: 'start', barracksTier: 1 }),
    });
    expect(explicit).toEqual(implicit);
  });
});
