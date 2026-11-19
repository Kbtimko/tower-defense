import { describe, it, expect, afterEach } from 'vitest';
import { simulateMap } from './simulate.js';
import { greedyBuildPlan } from './buildPolicy.js';
import { MAPS } from '../data/maps.js';
import { MAP_WAVES } from '../data/waves.js';
import { TOWER_DEFS } from '../data/towers.js';

const pick = r => ({
  wavesSurvived: r.wavesSurvived, livesRemaining: r.livesRemaining,
  kills: r.kills, leaked: r.leaked, goldFinal: r.goldFinal,
});

describe('below tier 4 is unchanged', () => {
  it('maps 0, 4 and 8 capped at tier 3 play exactly as before the abilities', () => {
    const out = {};
    for (const i of [0, 4, 8]) {
      out[`map${i}`] = pick(simulateMap({
        map: { ...MAPS[i], maxTierAllowed: 3 }, waves: MAP_WAVES[i], buildPlan: greedyBuildPlan,
      }));
    }
    expect(out).toMatchInlineSnapshot(`
      {
        "map0": {
          "goldFinal": 130,
          "kills": 95,
          "leaked": 9,
          "livesRemaining": 16,
          "wavesSurvived": 10,
        },
        "map4": {
          "goldFinal": 350,
          "kills": 222,
          "leaked": 13,
          "livesRemaining": 5,
          "wavesSurvived": 14,
        },
        "map8": {
          "goldFinal": 76,
          "kills": 90,
          "leaked": 12,
          "livesRemaining": 0,
          "wavesSurvived": 6,
        },
      }
    `);
  });
});

// A straight corridor with one slot at the midpoint, so every enemy walks past
// the lone tier-4 tower under test.
const corridor = {
  id: 99, name: 'Corridor', startGold: 2000, startLives: 30,
  rewardMult: 1, maxTierAllowed: 4,
  waypoints: [[0, 0.5], [0.5, 0.5], [1, 0.5]],
  towerSlots: [[0.5, 0.5]],
};

// Buy one tower and take it straight to tier 4 on the first send.
const tierFour = (type, branch) => ({ slotsUsed }) => {
  if (slotsUsed.has(0)) return [];
  return [
    { type, slotIndex: 0, branch },
    { upgrade: true, towerIndex: 0, branch },
    { upgrade: true, towerIndex: 0, branch },
    { upgrade: true, towerIndex: 0, branch },
  ];
};
const run = (type, branch, waves, over = {}) => simulateMap({
  map: corridor, waves, buildPlan: tierFour(type, branch), hero: null, ...over,
});

describe('tier-4 abilities in the simulator', () => {
  const saved = {
    bossStun: TOWER_DEFS.sniper.tier4A.bossStun,
    mageB: { ...TOWER_DEFS.mage.tier4B },
    cluster: TOWER_DEFS.cannon.tier4A.cluster,
  };
  afterEach(() => {
    TOWER_DEFS.sniper.tier4A.bossStun = saved.bossStun;
    TOWER_DEFS.mage.tier4B = { ...saved.mageB };
    TOWER_DEFS.cannon.tier4A.cluster = saved.cluster;
  });

  it('a stunned enemy holds position and trades no melee', () => {
    // Four titans against a lone 4A sniper: the 1s freeze on each hit buys the
    // extra shots that kill the fourth before it reaches the exit (picked by
    // sweeping counts/intervals; 4 at 2000ms is the smallest that separates).
    const titan = [[{ type: 'titan', count: 4, interval: 2000 }]];
    const stunned = run('sniper', 'A', titan);
    TOWER_DEFS.sniper.tier4A.bossStun = 0;
    const unstunned = run('sniper', 'A', titan);
    expect(stunned.leaked).toBeLessThan(unstunned.leaked);
  });

  it('frost mage splash slows in the sim', () => {
    // Titans, not drones: a drone dies to the 85-damage hit, and a slow only
    // lands on a survivor, so a drone pack cannot tell slow from no slow.
    const titans = [[{ type: 'titan', count: 4, interval: 500 }]];
    const slowed = run('mage', 'B', titans);
    delete TOWER_DEFS.mage.tier4B.slow;
    const unslowed = run('mage', 'B', titans);
    expect(slowed.kills).toBeGreaterThan(unslowed.kills);
    expect(slowed.leaked).toBeLessThan(unslowed.leaked);
  });

  it('a bomblet on an already-killed enemy pays no second reward', () => {
    // Zero spread puts every bomblet on the target, so each one overlaps a
    // drone the main splash has already killed.
    TOWER_DEFS.cannon.tier4A.cluster = { ...saved.cluster, spread: 0 };
    const one = [[{ type: 'drone', count: 1, interval: 1000 }]];
    const withCluster = run('cannon', 'A', one);
    TOWER_DEFS.cannon.tier4A.cluster = null;
    const without = run('cannon', 'A', one);
    expect(withCluster.kills).toBe(1);
    expect(withCluster.goldFinal).toBe(without.goldFinal);
  });
});
