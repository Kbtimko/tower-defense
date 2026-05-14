import { TOWER_DEFS } from '../data/towers.js';

export class TowerPlacementManager {
  constructor(zones, economy, entityFactory) {
    this.zones    = zones;
    this.economy  = economy;
    this._factory = entityFactory;
    this.towers   = [];
    this._nextId  = 0;
  }

  getZones()  { return this.zones; }
  getTowers() { return this.towers; }

  getTowerAtZone(zoneIndex) {
    return this.towers.find(t => t.zoneIndex === zoneIndex) ?? null;
  }

  placeTower(zoneIndex, type, scene) {
    const zone = this.zones[zoneIndex];
    if (!zone || zone.occupied) return null;
    const def = TOWER_DEFS[type];
    if (!def || !this.economy.spend(def.cost)) return null;
    const tower = this._factory(type, scene, { type, x: zone.cx, y: zone.cy, def, zoneIndex });
    tower.id       = this._nextId++;
    tower.totalCost = def.cost;
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
