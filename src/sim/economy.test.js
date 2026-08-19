import { describe, it, expect } from 'vitest';
import { goldCeiling, cheapestFullBoardCost, totalEnemyHp, goldPerHp } from './economy.js';
import { MAPS } from '../data/maps.js';
import { MAP_WAVES } from '../data/waves.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';

describe('goldCeiling', () => {
  it('sums start gold, kill rewards and wave-clear bonuses', () => {
    const map = { startGold: 100, rewardMult: 1 };
    const waves = [[{ type: 'drone', count: 2, interval: 1000 }]];
    const c = goldCeiling(map, waves);
    expect(c.startGold).toBe(100);
    expect(c.killGold).toBe(2 * ENEMY_DEFS.drone.reward);
    expect(c.clearGold).toBe(38);
    expect(c.total).toBe(100 + 2 * ENEMY_DEFS.drone.reward + 38);
  });

  it('applies rewardMult to kill and clear gold but not to start gold', () => {
    const map = { startGold: 100, rewardMult: 0.5 };
    const waves = [[{ type: 'drone', count: 2, interval: 1000 }]];
    const c = goldCeiling(map, waves);
    expect(c.startGold).toBe(100);
    expect(c.killGold).toBe(2 * Math.round(ENEMY_DEFS.drone.reward * 0.5));
    expect(c.clearGold).toBe(Math.round(38 * 0.5));
  });

  it('treats a missing rewardMult as 1', () => {
    const waves = [[{ type: 'drone', count: 1, interval: 1000 }]];
    expect(goldCeiling({ startGold: 0 }, waves).killGold).toBe(ENEMY_DEFS.drone.reward);
  });

  it('scales with killGoldMult (meta upgrades)', () => {
    const map = { startGold: 0, rewardMult: 1 };
    const waves = [[{ type: 'drone', count: 1, interval: 1000 }]];
    expect(goldCeiling(map, waves, 2).killGold).toBe(ENEMY_DEFS.drone.reward * 2);
  });

  it('ignores unknown enemy types rather than producing NaN', () => {
    const waves = [[{ type: 'not-a-real-enemy', count: 5, interval: 1000 }]];
    const c = goldCeiling({ startGold: 10, rewardMult: 1 }, waves);
    expect(Number.isFinite(c.total)).toBe(true);
    expect(c.killGold).toBe(0);
  });

  it('handles an empty wave list', () => {
    const c = goldCeiling({ startGold: 50, rewardMult: 1 }, []);
    expect(c.total).toBe(50);
  });
});

describe('cheapestFullBoardCost', () => {
  it('multiplies the cheapest firing tower by the slot count', () => {
    const cheapest = Math.min(
      ...Object.values(TOWER_DEFS).filter(d => d.fireRate > 0).map(d => d.cost),
    );
    expect(cheapestFullBoardCost({ towerSlots: [1, 2, 3] })).toBe(cheapest * 3);
  });

  it('is zero for a map with no slots', () => {
    expect(cheapestFullBoardCost({ towerSlots: [] })).toBe(0);
    expect(cheapestFullBoardCost({})).toBe(0);
  });
});

describe('totalEnemyHp', () => {
  it('applies the per-wave scale factor WaveManager uses', () => {
    const waves = [
      [{ type: 'drone', count: 1, interval: 1000 }],
      [{ type: 'drone', count: 1, interval: 1000 }],
    ];
    // wave 0 scale 1.0, wave 1 scale 1.13
    expect(totalEnemyHp(waves)).toBe(Math.round(ENEMY_DEFS.drone.hp * (1 + 1.13)));
  });

  it('is zero for no waves', () => {
    expect(totalEnemyHp([])).toBe(0);
  });
});

describe('goldPerHp', () => {
  it('is zero when there are no enemies rather than dividing by zero', () => {
    expect(goldPerHp({ startGold: 100, rewardMult: 1 }, [])).toBe(0);
  });

  it('produces a finite figure for every shipped map', () => {
    for (const map of MAPS) {
      const v = goldPerHp(map, MAP_WAVES[map.id]);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});
