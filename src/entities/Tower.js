import Phaser from 'phaser';
import { TOWER_DEFS } from '../data/towers.js';

export class Tower extends Phaser.GameObjects.Container {
  constructor(scene, { type, x, y, def, zoneIndex }) {
    super(scene, x, y);

    this.type         = type;
    this.level        = 1;
    this.branch       = null;
    this.damage       = def.damage;
    this.range        = def.range;
    this.fireRate     = def.fireRate;
    this.splashRadius = def.splashRadius;
    this.pierce       = def.pierce;
    this.slow         = def.slow;
    this.cooldown     = 0;
    this.totalCost    = def.cost;
    this.zoneIndex    = zoneIndex;

    this._bg        = scene.add.graphics();
    this._icon      = scene.add.text(0, 0, def.icon, { fontSize: '16px', fontFamily: 'Georgia' }).setOrigin(0.5);
    this._rangeRing = scene.add.graphics();

    this.add([this._bg, this._rangeRing, this._icon]);
    scene.add.existing(this);
    this.setDepth(2);
    this._rangeRing.setVisible(false);
    this._redraw();
  }

  _redraw() {
    const def = TOWER_DEFS[this.type];
    const sw  = [1.5, 2, 3, 4][this.level - 1];
    this._bg.clear();
    this._bg.fillStyle(0x2a2a3a, 1);
    this._bg.fillCircle(0, 0, 18);
    this._bg.lineStyle(sw, def.color, 1);
    this._bg.strokeCircle(0, 0, 18);

    this._rangeRing.clear();
    this._rangeRing.lineStyle(1, 0xffd700, 0.25);
    this._rangeRing.strokeCircle(0, 0, this.range);
  }

  upgrade(tier, branch = null) {
    const tierDef = TOWER_DEFS[this.type]['tier' + tier];
    if (!tierDef) return;
    this.level = tier;
    if (branch)                             this.branch       = branch;
    if (tierDef.damage       !== undefined) this.damage       = tierDef.damage;
    if (tierDef.range        !== undefined) this.range        = tierDef.range;
    if (tierDef.splashRadius !== undefined) this.splashRadius = tierDef.splashRadius;
    if (tierDef.slow         !== undefined) this.slow         = tierDef.slow;
    if (tierDef.fireRate     !== undefined) this.fireRate     = tierDef.fireRate;
    if (tierDef.pierce       !== undefined) this.pierce       = tierDef.pierce;
    this._redraw();
  }

  sell() {
    const refund = Math.floor(this.totalCost * 0.6);
    this.destroy();
    return refund;
  }

  showRange() { this._rangeRing.setVisible(true); }
  hideRange()  { this._rangeRing.setVisible(false); }
}
