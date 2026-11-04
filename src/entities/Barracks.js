import { Tower } from './Tower.js';
import { Soldier } from './Soldier.js';
import { TOWER_DEFS } from '../data/towers.js';
import { SOLDIER_MARCH } from '../data/soldiers.js';
import { pathLength } from '../systems/pathGeometry.js';
import { contactTest } from '../systems/soldierMarch.js';

export class Barracks extends Tower {
  constructor(scene, { type, x, y, def, zoneIndex, modifiers = {} }) {
    super(scene, { type, x, y, def, zoneIndex, modifiers });
    this._modifiers          = modifiers;
    this.soldiers            = [];
    this.soldierPathProgress = 0.5;
    this.soldierStats        = def.soldierStats.tier1;
    this.rallyFlag           = null;
  }

  // spawnProgress[i] overrides where soldier i appears (a mid-march rebuild);
  // anyone without an entry starts on the rally point.
  spawnSoldiers(scene, pathPoints, spawnProgress = null) {
    this.pathPoints  = pathPoints;
    this.totalLength = pathLength(pathPoints);
    for (let i = 0; i < this.soldierStats.count; i++) {
      this.soldiers.push(new Soldier(scene, {
        barracks:     this,
        pathProgress: spawnProgress?.[i] ?? this.soldierPathProgress,
        pathPoints,
        soldierStats: this.soldierStats,
        modifiers:    this._modifiers,
      }));
    }
  }

  // An order, not a teleport: soldiers walk there in update(). Anyone already
  // fighting gets a disengage window so the fight can't pin it in place; an
  // order onto its own spot is no move at all, so it keeps holding the line.
  setRallyPoint(progress, enemies = []) {
    for (const s of this.soldiers) {
      if (progress === s.pathProgress) continue;
      // Engagement is judged as if no window were open, without touching the soldier.
      const probe = { dead: s.dead, canBlockFlyers: s.canBlockFlyers, disengageLeftPx: 0, x: s.x, y: s.y };
      if (contactTest(probe, enemies)({ x: s.x, y: s.y })) s.disengageLeftPx = SOLDIER_MARCH.disengagePx;
    }
    this.soldierPathProgress = progress;
    this.rallyFlag = { progress, fadeLeftMs: null };
  }

  upgrade(tier, branch = null) {
    super.upgrade(tier, branch);
    const key         = tier === 4 && branch ? `tier4${branch}` : `tier${tier}`;
    this.soldierStats = TOWER_DEFS.barracks.soldierStats[key] ?? this.soldierStats;
  }

  // An upgrade mid-march must not snap the squad to the flag: live soldiers
  // rebuild where they stand and keep walking, the dead (and any new extra) at the target.
  _rebuildSoldiers(scene, pathPoints) {
    const spawnProgress = this.soldiers.map(s => (s.dead ? this.soldierPathProgress : s.pathProgress));
    for (const s of this.soldiers) s.destroy();
    this.soldiers = [];
    this.spawnSoldiers(scene, pathPoints, spawnProgress);
  }

  destroy() {
    for (const s of this.soldiers) s.destroy();
    this.soldiers = [];
    super.destroy();
  }
}
