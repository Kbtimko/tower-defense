import { describe, it, expect } from 'vitest';
import { ANCHOR_TIERS, anchoredPlan, runT4Sweep, sweepMaps } from './t4Sweep.js';
import { rankSlots } from './buildPolicy.js';
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';
import { MAP_WAVES } from '../data/waves.js';

const zones = [{ cx: 0, cy: 0 }, { cx: 100, cy: 0 }, { cx: 200, cy: 0 }];
const path = [{ x: 100, y: 10 }, { x: 110, y: 10 }, { x: 200, y: 10 }];
const bestSlot = rankSlots(zones, path)[0];

function stub() {
  const calls = [];
  const plan = ctx => { calls.push(ctx); return [{ type: 'archer', slotIndex: 99 }]; };
  return { plan, calls };
}
const mkCtx = (over = {}) => ({
  gold: 10000, towers: [], slotsUsed: new Set(), buildZones: zones, path, waveNumber: 1, map: {}, waves: [], ...over,
});
const anchorTower = level => ({ type: 'mage', level, tag: 'anchor' });

describe('ANCHOR_TIERS', () => {
  it('lists the three anchor depths', () => expect(ANCHOR_TIERS).toEqual(['T3', '4A', '4B']));
});

describe('anchoredPlan', () => {
  it('buys the anchor first at the top-ranked free slot, tagged, capped at T3', () => {
    const { plan, calls } = stub();
    const out = anchoredPlan(plan, { type: 'mage', tier: 'T3' })(mkCtx());
    expect(out[0]).toEqual({ type: 'mage', slotIndex: bestSlot, maxTier: 3, tag: 'anchor' });
    expect(out[0]).not.toHaveProperty('branch');
    expect(calls[0].slotsUsed.has(bestSlot)).toBe(true);
    expect(calls[0].gold).toBe(10000 - TOWER_DEFS.mage.cost);
  });

  it('skips a used slot and carries the branch with maxTier 4 for 4B', () => {
    const { plan } = stub();
    const ctx = mkCtx({ slotsUsed: new Set([bestSlot]) });
    const out = anchoredPlan(plan, { type: 'mage', tier: '4B' })(ctx);
    expect(out[0].slotIndex).toBe(rankSlots(zones, path).find(i => i !== bestSlot));
    expect(out[0]).toMatchObject({ maxTier: 4, branch: 'B' });
  });

  it('holds the gold when the anchor is unaffordable', () => {
    const { plan, calls } = stub();
    const out = anchoredPlan(plan, { type: 'mage', tier: '4A' })(mkCtx({ gold: TOWER_DEFS.mage.cost - 1 }));
    expect(out).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('does not mutate the ctx slot set', () => {
    const { plan } = stub();
    const ctx = mkCtx();
    anchoredPlan(plan, { type: 'mage', tier: 'T3' })(ctx);
    expect(ctx.slotsUsed.size).toBe(0);
  });

  it('upgrades the anchor stepwise, branch on the tier-4 step, then runs the base plan on the rest', () => {
    const { plan, calls } = stub();
    const ctx = mkCtx({ towers: [{ type: 'archer', level: 1 }, anchorTower(1)], gold: 1000, slotsUsed: new Set([0, 1]) });
    const out = anchoredPlan(plan, { type: 'mage', tier: '4B' })(ctx);
    const m = TOWER_DEFS.mage;
    expect(out.slice(0, 3)).toEqual([
      { upgrade: true, towerIndex: 1 },
      { upgrade: true, towerIndex: 1 },
      { upgrade: true, towerIndex: 1, branch: 'B' },
    ]);
    expect(out[3]).toEqual({ type: 'archer', slotIndex: 99 });
    expect(calls[0].gold).toBe(1000 - m.tier2.cost - m.tier3.cost - m.tier4B.cost);
  });

  it('stops upgrading when the next step is unaffordable', () => {
    const { plan, calls } = stub();
    const m = TOWER_DEFS.mage;
    const ctx = mkCtx({ towers: [anchorTower(1)], gold: m.tier2.cost + m.tier3.cost - 1 });
    const out = anchoredPlan(plan, { type: 'mage', tier: '4A' })(ctx);
    expect(out.filter(p => p.upgrade)).toHaveLength(1);
    expect(calls[0].gold).toBe(m.tier3.cost - 1);
  });

  it('never upgrades past the anchor tier', () => {
    const { plan } = stub();
    const out = anchoredPlan(plan, { type: 'mage', tier: 'T3' })(mkCtx({ towers: [anchorTower(1)] }));
    expect(out.filter(p => p.upgrade)).toHaveLength(2);
    const done = anchoredPlan(plan, { type: 'mage', tier: 'T3' })(mkCtx({ towers: [anchorTower(3)] }));
    expect(done.filter(p => p.upgrade)).toHaveLength(0);
  });

  it('never upgrades past the map maxTierAllowed', () => {
    const { plan } = stub();
    const out = anchoredPlan(plan, { type: 'mage', tier: '4A' })(
      mkCtx({ towers: [anchorTower(1)], map: { maxTierAllowed: 2 } }));
    expect(out.filter(p => p.upgrade)).toHaveLength(1);
  });
});

describe('sweepMaps', () => {
  it('is every map that allows tier 4', () => {
    expect(sweepMaps()).toEqual(MAPS.filter(m => (m.maxTierAllowed ?? 4) === 4));
  });
});

describe('runT4Sweep', () => {
  it('returns a baseline and one row per tower type and anchor tier on a real map', () => {
    const map = sweepMaps()[0];
    const res = runT4Sweep(map, MAP_WAVES[map.id]);
    expect(res.map).toBe(map);
    expect(res.baseline.label).toEqual(expect.any(String));
    expect(res.rows).toHaveLength(Object.keys(TOWER_DEFS).length * 3);
    for (const r of res.rows) {
      expect(r.multiplier === null || typeof r.multiplier === 'number').toBe(true);
      expect(r.livesKept).toBeGreaterThanOrEqual(0);
      expect(r.livesKept).toBeLessThanOrEqual(1);
    }
  }, 120000);
});
