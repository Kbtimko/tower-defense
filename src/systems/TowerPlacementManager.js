import { TOWER_DEFS } from '../data/towers.js';

export class TowerPlacementManager {
  constructor(zones, economy, entityFactory, modifiers = {}) {
    this.zones      = zones;
    this.economy    = economy;
    this._factory   = entityFactory;
    this._modifiers = modifiers;
    this.towers     = [];
    this._nextId    = 0;
  }

  getZones()  { return this.zones; }
  getTowers() { return this.towers; }

  getTowerAtZone(zoneIndex) {
    return this.towers.find(t => t.zoneIndex === zoneIndex) ?? null;
  }

  /**
   * Find the nearest slot to (worldX, worldY) within `snapPx` pixels.
   * If requireFree is true, skips occupied slots.
   * Returns { slotIndex, x, y } or null.
   */
  getNearestSlot(worldX, worldY, snapPx, requireFree = true) {
    let bestIdx = -1;
    let bestDist = snapPx;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (requireFree && z.occupied) continue;
      const d = Math.hypot(z.cx - worldX, z.cy - worldY);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx === -1) return null;
    return { slotIndex: bestIdx, x: this.zones[bestIdx].cx, y: this.zones[bestIdx].cy };
  }

  placeTower(zoneIndex, type, scene) {
    const zone = this.zones[zoneIndex];
    if (!zone || zone.occupied) return null;
    const def = TOWER_DEFS[type];
    if (!def) return null;
    const cost = Math.round(def.cost * (this._modifiers.towerCostMult ?? 1));
    if (!this.economy.spend(cost)) return null;
    const tower = this._factory(type, scene, { type, x: zone.cx, y: zone.cy, def, zoneIndex, modifiers: this._modifiers });
    tower.id       = this._nextId++;
    tower.totalCost = cost;
    zone.occupied  = true;
    this.towers.push(tower);
    return tower;
  }

  sellTower(tower) {
    const refund = Math.floor(tower.totalCost * 0.6);
    this.economy.earn(refund);
    this.zones[tower.zoneIndex].occupied = false;
    this.towers = this.towers.filter(t => t !== tower);
    tower.destroy();
  }

  upgradeTower(tower, tier, branch = null) {
    const def    = TOWER_DEFS[tower.type];
    const key    = tier === 4 && branch ? `tier4${branch}` : `tier${tier}`;
    const tierDef = def[key];
    if (!tierDef || !this.economy.spend(tierDef.cost)) return false;
    tower.totalCost += tierDef.cost;
    tower.upgrade(tier, branch);
    return true;
  }
}
