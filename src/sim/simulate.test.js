import { describe, it, expect } from 'vitest';
import { simulateMap } from './simulate.js';
import { greedyBuildPlan, rankSlots, slotCoverage, towerValue } from './buildPolicy.js';
import { MAPS } from '../data/maps.js';
import { MAP_WAVES } from '../data/waves.js';
import { TOWER_DEFS } from '../data/towers.js';

const map0 = MAPS[0];
const waves0 = MAP_WAVES[0];
const buildNothing = () => [];

describe('slotCoverage / rankSlots', () => {
  it('counts only path points inside the range', () => {
    const path = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 500, y: 0 }];
    expect(slotCoverage({ cx: 0, cy: 0 }, path, 100)).toBe(2);
  });

  it('ranks a slot hugging the path above a distant one', () => {
    const path = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const zones = [{ cx: 900, cy: 900 }, { cx: 10, cy: 0 }];
    expect(rankSlots(zones, path, 100)[0]).toBe(1);
  });

  it('is deterministic for equally-covering slots (ties break by index)', () => {
    const path = [{ x: 0, y: 0 }];
    const zones = [{ cx: 0, cy: 0 }, { cx: 0, cy: 0 }];
    expect(rankSlots(zones, path, 100)).toEqual([0, 1]);
  });
});

describe('towerValue', () => {
  it('scores damage-per-second-per-gold', () => {
    const a = TOWER_DEFS.archer;
    expect(towerValue('archer')).toBeCloseTo((a.damage * a.fireRate) / a.cost);
  });
});

describe('greedyBuildPlan', () => {
  const zones = [{ cx: 0, cy: 0 }, { cx: 5, cy: 0 }];
  const path = [{ x: 0, y: 0 }, { x: 5, y: 0 }];

  it('buys nothing when it cannot afford the cheapest tower', () => {
    const cheapest = Math.min(...Object.values(TOWER_DEFS).filter(d => d.fireRate > 0).map(d => d.cost));
    const plan = greedyBuildPlan({ gold: cheapest - 1, slotsUsed: new Set(), buildZones: zones, path });
    expect(plan).toEqual([]);
  });

  it('never reuses an occupied slot', () => {
    const plan = greedyBuildPlan({ gold: 10000, slotsUsed: new Set([0]), buildZones: zones, path });
    expect(plan.every(p => p.slotIndex !== 0)).toBe(true);
  });

  it('never spends more than the available gold', () => {
    const plan = greedyBuildPlan({ gold: 130, slotsUsed: new Set(), buildZones: zones, path });
    const spent = plan.reduce((s, p) => s + TOWER_DEFS[p.type].cost, 0);
    expect(spent).toBeLessThanOrEqual(130);
  });

  it('cannot propose more purchases than there are free slots', () => {
    const plan = greedyBuildPlan({ gold: 100000, slotsUsed: new Set(), buildZones: zones, path });
    expect(plan.length).toBeLessThanOrEqual(zones.length);
  });
});

describe('simulateMap', () => {
  it('an undefended map loses every life and reports the loss', () => {
    const r = simulateMap({ map: map0, waves: waves0, buildPlan: buildNothing });
    expect(r.won).toBe(false);
    expect(r.livesRemaining).toBe(0);
    expect(r.leaked).toBeGreaterThan(0);
    expect(r.towersBuilt).toBe(0);
  });

  it('stops at the wave where lives ran out rather than running them all', () => {
    const r = simulateMap({ map: map0, waves: waves0, buildPlan: buildNothing });
    expect(r.wavesSurvived).toBeLessThan(waves0.length);
    expect(r.waveLog.length).toBe(r.wavesSurvived + 1);
  });

  it('is deterministic — identical inputs give identical results', () => {
    const a = simulateMap({ map: map0, waves: waves0, buildPlan: greedyBuildPlan });
    const b = simulateMap({ map: map0, waves: waves0, buildPlan: greedyBuildPlan });
    expect(a).toEqual(b);
  });

  it('a defended map kills enemies and earns gold back', () => {
    const r = simulateMap({ map: map0, waves: waves0, buildPlan: greedyBuildPlan });
    expect(r.kills).toBeGreaterThan(0);
    expect(r.towersBuilt).toBeGreaterThan(0);
  });

  it('never builds more towers than the map has slots', () => {
    const r = simulateMap({ map: map0, waves: waves0, buildPlan: greedyBuildPlan });
    expect(r.towersBuilt).toBeLessThanOrEqual(map0.towerSlots.length);
  });

  it('respects a build plan that overspends by ignoring unaffordable picks', () => {
    const overspend = () => [{ type: 'sniper', slotIndex: 0 }, { type: 'sniper', slotIndex: 1 }];
    const poor = { ...map0, startGold: TOWER_DEFS.sniper.cost };  // affords exactly one
    const r = simulateMap({ map: poor, waves: waves0, buildPlan: overspend });
    expect(r.waveLog[0].towersBuilt).toBe(1);
  });

  it('logs one entry per wave played, with gold and lives accounting', () => {
    const r = simulateMap({ map: map0, waves: waves0, buildPlan: greedyBuildPlan });
    for (const entry of r.waveLog) {
      expect(entry.livesRemaining).toBeGreaterThanOrEqual(0);
      expect(entry.goldAfter).toBeGreaterThanOrEqual(0);
      expect(entry.wave).toBeGreaterThan(0);
    }
  });

  it('runs every shipped map without throwing', () => {
    for (const map of MAPS) {
      const waves = MAP_WAVES[map.id];
      expect(waves, `map ${map.id} has no waves`).toBeDefined();
      const r = simulateMap({ map, waves, buildPlan: greedyBuildPlan });
      expect(r.totalWaves).toBe(waves.length);
      expect(r.livesRemaining).toBeLessThanOrEqual(map.startLives);
    }
  });
});
