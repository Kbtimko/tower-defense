import { TOWER_DEFS } from '../data/towers.js';

export class Tower {
  constructor({ type, x, y, def, zoneIndex }) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.zoneIndex = zoneIndex;
    this.level = 1;
    this.branch = null;       // 'A' | 'B' — set when upgrading to tier 4
    this.totalCost = def.cost;

    this.damage = def.damage;
    this.range = def.range;
    this.fireRate = def.fireRate;
    this.splashRadius = def.splashRadius;
    this.pierce = def.pierce;
    this.slow = def.slow;
    this.cooldown = 0;        // seconds until next shot
  }

  upgrade(tier, branch = null) {
    const key     = tier === 4 && branch ? `tier4${branch}` : `tier${tier}`;
    const tierDef = TOWER_DEFS[this.type][key];
    if (!tierDef) return;
    this.level = tier;
    if (branch)                             this.branch       = branch;
    if (tierDef.damage       !== undefined) this.damage       = tierDef.damage;
    if (tierDef.range        !== undefined) this.range        = tierDef.range;
    if (tierDef.splashRadius !== undefined) this.splashRadius = tierDef.splashRadius;
    if (tierDef.slow         !== undefined) this.slow         = tierDef.slow;
    if (tierDef.fireRate     !== undefined) this.fireRate     = tierDef.fireRate;
    if (tierDef.pierce       !== undefined) this.pierce       = tierDef.pierce;
  }

  destroy() {
    // Placeholder for cleanup (Barracks will override)
  }
}
