import { TowerPlacementManager } from './TowerPlacementManager.js';
import { TOWER_DEFS } from '../data/towers.js';

const makeEconomy = (gold = 500) => ({
  gold,
  spend(cost) { if (this.gold < cost) return false; this.gold -= cost; return true; },
  earn(amount) { this.gold += amount; },
});

const makeFactory = () =>
  (type, _scene, opts) => ({
    type, zoneIndex: opts.zoneIndex,
    level: 1, branch: null, totalCost: opts.def.cost ?? 0,
    upgrade(tier, branch) { this.level = tier; if (branch) this.branch = branch; },
    destroy() {},
  });

describe('TowerPlacementManager', () => {
  it('getZones returns the zones array', () => {
    const zones = [{ cx: 100, cy: 100, radius: 22, occupied: false }];
    const mgr = new TowerPlacementManager(zones, makeEconomy(), makeFactory());
    expect(mgr.getZones()).toBe(zones);
  });

  it('getTowers returns empty array initially', () => {
    const mgr = new TowerPlacementManager([], makeEconomy(), makeFactory());
    expect(mgr.getTowers()).toEqual([]);
  });

  it('placeTower marks zone occupied, deducts gold, assigns id', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const economy = makeEconomy(500);
    const mgr = new TowerPlacementManager([zone], economy, makeFactory());
    const tower = mgr.placeTower(0, 'archer', null);
    expect(tower).not.toBeNull();
    expect(tower.type).toBe('archer');
    expect(tower.id).toBe(0);
    expect(zone.occupied).toBe(true);
    expect(economy.gold).toBe(500 - TOWER_DEFS.archer.cost);
  });

  it('placeTower returns null when gold insufficient', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const economy = makeEconomy(50);
    const mgr = new TowerPlacementManager([zone], economy, makeFactory());
    expect(mgr.placeTower(0, 'archer', null)).toBeNull();
    expect(zone.occupied).toBe(false);
    expect(economy.gold).toBe(50);
  });

  it('placeTower returns null when zone already occupied', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: true };
    const mgr = new TowerPlacementManager([zone], makeEconomy(500), makeFactory());
    expect(mgr.placeTower(0, 'archer', null)).toBeNull();
  });

  it('getTowerAtZone returns tower with matching zoneIndex', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const mgr = new TowerPlacementManager([zone], makeEconomy(500), makeFactory());
    const tower = mgr.placeTower(0, 'archer', null);
    expect(mgr.getTowerAtZone(0)).toBe(tower);
  });

  it('getTowerAtZone returns null when zone empty', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const mgr = new TowerPlacementManager([zone], makeEconomy(500), makeFactory());
    expect(mgr.getTowerAtZone(0)).toBeNull();
  });

  it('sellTower frees zone, earns 60% refund, removes from array', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const economy = makeEconomy(500);
    const mgr = new TowerPlacementManager([zone], economy, makeFactory());
    const tower = mgr.placeTower(0, 'archer', null); // spends 60g → economy.gold = 440
    mgr.sellTower(tower);
    expect(economy.gold).toBe(440 + Math.floor(60 * 0.6)); // 440 + 36 = 476
    expect(zone.occupied).toBe(false);
    expect(mgr.getTowers()).toHaveLength(0);
  });

  it('upgradeTower spends gold, updates totalCost, calls tower.upgrade with branch', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const economy = makeEconomy(500);
    const mgr = new TowerPlacementManager([zone], economy, makeFactory());
    const tower = mgr.placeTower(0, 'archer', null); // spends 60g
    mgr.upgradeTower(tower, 4, 'A');
    const t4aCost = TOWER_DEFS.archer.tier4A.cost; // 120
    expect(economy.gold).toBe(500 - 60 - t4aCost);
    expect(tower.totalCost).toBe(60 + t4aCost);
    expect(tower.level).toBe(4);
    expect(tower.branch).toBe('A');
  });

  it('upgradeTower returns false when gold insufficient', () => {
    const zone = { cx: 100, cy: 100, radius: 22, occupied: false };
    const economy = makeEconomy(60); // only enough to place
    const mgr = new TowerPlacementManager([zone], economy, makeFactory());
    const tower = mgr.placeTower(0, 'archer', null); // now economy.gold = 0
    const result = mgr.upgradeTower(tower, 2, null); // tier2 costs 50, economy has 0
    expect(result).toBe(false);
    expect(tower.level).toBe(1);
  });
});

describe('TowerPlacementManager.getNearestSlot', () => {
  const zones = [
    { cx: 100, cy: 100, radius: 22, occupied: false },
    { cx: 200, cy: 100, radius: 22, occupied: true  },
    { cx: 300, cy: 100, radius: 22, occupied: false },
  ];

  it('returns the nearest free slot within snapPx', () => {
    const mgr = new TowerPlacementManager(zones, makeEconomy(), makeFactory());
    const result = mgr.getNearestSlot(105, 100, 22, true);
    expect(result).not.toBeNull();
    expect(result.slotIndex).toBe(0);
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });

  it('returns null when no slot within snapPx', () => {
    const mgr = new TowerPlacementManager(zones, makeEconomy(), makeFactory());
    expect(mgr.getNearestSlot(500, 500, 22, true)).toBeNull();
  });

  it('with requireFree=true, skips occupied slots even if they are nearer', () => {
    const mgr = new TowerPlacementManager(zones, makeEconomy(), makeFactory());
    // (210,100) is closest to occupied slot 1 (10px away) but slot 0 (110px) and slot 2 (90px) are free
    const result = mgr.getNearestSlot(210, 100, 100, true);
    expect(result).not.toBeNull();
    expect(result.slotIndex).toBe(2);
  });

  it('with requireFree=false, returns the nearest slot regardless of occupied state', () => {
    const mgr = new TowerPlacementManager(zones, makeEconomy(), makeFactory());
    const result = mgr.getNearestSlot(210, 100, 100, false);
    expect(result).not.toBeNull();
    expect(result.slotIndex).toBe(1);
  });
});
