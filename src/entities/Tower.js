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
}
