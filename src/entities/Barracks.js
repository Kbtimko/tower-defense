import { Tower } from './Tower.js';
import { Soldier } from './Soldier.js';
import { TOWER_DEFS } from '../data/towers.js';

export class Barracks extends Tower {
  constructor(scene, { type, x, y, def, zoneIndex }) {
    super({ type, x, y, def, zoneIndex });
    this.soldiers            = [];
    this.soldierPathProgress = 0.5;
    this.soldierStats        = def.soldierStats.tier1;
  }

  spawnSoldiers(scene, pathPoints) {
    const count = this.soldierStats.count;
    for (let i = 0; i < count; i++) {
      this.soldiers.push(new Soldier(scene, {
        barracks:     this,
        pathProgress: this.soldierPathProgress,
        pathPoints,
        soldierStats: this.soldierStats,
      }));
    }
  }

  repositionSoldiers(newProgress, pathPoints) {
    this.soldierPathProgress = newProgress;
    for (const soldier of this.soldiers) {
      soldier.setPathProgress(newProgress, pathPoints);
    }
  }

  upgrade(tier, branch = null) {
    super.upgrade(tier, branch);
    const key         = tier === 4 && branch ? `tier4${branch}` : `tier${tier}`;
    this.soldierStats = TOWER_DEFS.barracks.soldierStats[key] ?? this.soldierStats;
  }

  _rebuildSoldiers(scene, pathPoints) {
    for (const s of this.soldiers) s.destroy();
    this.soldiers = [];
    this.spawnSoldiers(scene, pathPoints);
  }

  destroy() {
    for (const s of this.soldiers) s.destroy();
    this.soldiers = [];
    super.destroy();
  }
}
