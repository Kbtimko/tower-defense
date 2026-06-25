import Phaser from 'phaser';
import { TOWER_DEFS } from '../data/towers.js';
import { EntitySprite } from '../systems/EntitySprite.js';

export class Tower extends Phaser.GameObjects.Container {
  constructor(scene, { type, x, y, def, zoneIndex, modifiers = {} }) {
    super(scene, x, y);

    this._rangeMult   = modifiers.towerRangeMult  ?? 1;
    this._damageMult  = modifiers.towerDamageMult ?? 1;
    this.type         = type;
    this.level        = 1;
    this.branch       = null;
    this.damage       = Math.round(def.damage * this._damageMult);
    this.range        = Math.round(def.range  * this._rangeMult);
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
    this._sprite = new EntitySprite(this, scene, {
      category: 'tower', type, initialState: 'idle',
    });
    if (this._sprite.active) { this._bg.setVisible(false); this._icon.setVisible(false); }
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
    const key     = tier === 4 && branch ? `tier4${branch}` : `tier${tier}`;
    const tierDef = TOWER_DEFS[this.type][key];
    if (!tierDef) return;
    this.level = tier;
    if (branch)                             this.branch       = branch;
    if (tierDef.damage       !== undefined) this.damage       = Math.round(tierDef.damage * this._damageMult);
    if (tierDef.range        !== undefined) this.range        = Math.round(tierDef.range  * this._rangeMult);
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
