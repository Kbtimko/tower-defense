// Barracks soldiers in the headless model: they must block, trade melee and
// respawn the way GameScene._updateEnemies does, or the deficit numbers the
// balance report prints are measuring a defence the game does not have.
import { describe, it, expect } from 'vitest';
import { simulateMap } from './simulate.js';
import { greedyBuildPlan } from './buildPolicy.js';
import { TOWER_DEFS } from '../data/towers.js';

// A straight corridor with a single slot at the midpoint: every enemy must walk
// past whatever is built there, so blocking is unambiguous.
const corridor = {
  id: 99, name: 'Corridor', startGold: 200, startLives: 30,
  rewardMult: 1, maxTierAllowed: 1,
  waypoints: [[0, 0.5], [0.5, 0.5], [1, 0.5]],
  towerSlots: [[0.5, 0.5]],
};

const wave = (type, count) => [[{ type, count, interval: 900 }]];
const buildNothing = () => [];
const buildBarracks = ({ slotsUsed }) => (slotsUsed.has(0) ? [] : [{ type: 'barracks', slotIndex: 0 }]);
// Buy the barracks, then pour every wave's gold into upgrading it.
const barracksToTier = tier => ({ towers, slotsUsed }) => {
  if (!slotsUsed.has(0)) return [{ type: 'barracks', slotIndex: 0 }];
  return towers[0].level < tier ? [{ upgrade: true, towerIndex: 0 }] : [];
};
const run = (over = {}) => simulateMap({
  map: corridor, waves: wave('drone', 6), buildPlan: buildNothing, hero: null, ...over,
});

describe('soldier blocking in the simulator', () => {
  it('reports no blocking at all when nothing is built', () => {
    const r = run();
    expect(r.blockedSeconds).toBe(0);
    expect(r.soldierDeaths).toBe(0);
    expect(r.leaked).toBe(6);
  });

  it('halts enemies that a tower-only defence would let walk past', () => {
    const r = run({ buildPlan: buildBarracks });
    expect(r.blockedSeconds).toBeGreaterThan(0);
    // A lone tier-1 squad stops some of a pack of six and is overrun by the rest.
    expect(r.leaked).toBeGreaterThan(0);
    expect(r.leaked).toBeLessThan(6);
  });

  it('takes melee damage from what it blocks, and respawns to block again', () => {
    // One squad is 3 soldiers; more deaths than that can only mean they came
    // back, and blocking continues after the squad is first wiped.
    const squad = TOWER_DEFS.barracks.soldierStats.tier1.count;
    const r = run({ waves: wave('drone', 12), buildPlan: buildBarracks });
    expect(r.soldierDeaths).toBeGreaterThan(squad);
    expect(r.blockedSeconds).toBeGreaterThan(0);
  });

  it('kills what it blocks once the soldiers hit hard enough to finish a drone', () => {
    // No towers and no hero here, so every kill is melee damage from a soldier.
    const r = simulateMap({
      map: { ...corridor, maxTierAllowed: 3, startGold: 1000 },
      waves: [wave('drone', 1)[0], wave('drone', 1)[0], wave('drone', 1)[0]],
      buildPlan: barracksToTier(3), hero: null,
    });
    expect(r.kills).toBeGreaterThan(0);
  });

  it('lets flyers straight past ground soldiers', () => {
    const r = run({ waves: wave('phantom', 6), buildPlan: buildBarracks });
    expect(r.blockedSeconds).toBe(0);
    expect(r.leaked).toBe(6);
  });

  it('blocks flyers once the barracks reaches Vanguard (tier 4A)', () => {
    const r = simulateMap({
      map: { ...corridor, maxTierAllowed: 4, startGold: 1000 },
      // Waves 1-3 buy and upgrade the barracks to Vanguard; wave 4 is the flyers.
      waves: [...Array(3).fill(wave('drone', 1)[0]), wave('phantom', 4)[0]],
      buildPlan: barracksToTier(4), hero: null,
    });
    expect(r.blockedSeconds).toBeGreaterThan(0);
    expect(r.leaked).toBeLessThan(5);
  });

  it('costs the blocked enemy time it would otherwise spend advancing', () => {
    // Blocking is qualitative, not extra DPS: a halted enemy stops covering
    // ground and sits inside tower range instead.
    expect(run({ buildPlan: buildBarracks }).blockedSeconds)
      .toBeGreaterThan(run().blockedSeconds);
  });
});

describe('greedyBuildPlan with barracks', () => {
  const zones = [{ cx: 0, cy: 0 }, { cx: 5, cy: 0 }, { cx: 10, cy: 0 }];
  const path  = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
  const plan  = (over = {}) => greedyBuildPlan({
    gold: 1000, slotsUsed: new Set(), buildZones: zones, path, towers: [], ...over,
  });

  it('opens with a barracks by default', () => {
    expect(plan()[0].type).toBe('barracks');
  });

  it('builds exactly one barracks, then goes back to damage-per-gold', () => {
    const p = plan();
    expect(p.filter(x => x.type === 'barracks').length).toBe(1);
    expect(p.length).toBe(zones.length);
  });

  it('counts barracks already on the board towards the target', () => {
    const p = greedyBuildPlan({
      gold: 1000, slotsUsed: new Set([0]), buildZones: zones, path,
      towers: [{ type: 'barracks', level: 1 }],
    });
    expect(p.some(x => x.type === 'barracks')).toBe(false);
  });

  it('buys none when the target is zero (the old tower-only defence)', () => {
    expect(plan({ barracksTarget: 0 }).some(x => x.type === 'barracks')).toBe(false);
  });

  it('saves up rather than spending the barracks money on a cheaper tower', () => {
    const p = plan({ gold: TOWER_DEFS.barracks.cost - 1 });
    expect(p).toEqual([]);
  });

  it('honours a target above one', () => {
    const p = plan({ barracksTarget: 2 });
    expect(p.filter(x => x.type === 'barracks').length).toBe(2);
  });
});
