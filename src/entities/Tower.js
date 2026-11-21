import Phaser from 'phaser';
import { TOWER_DEFS, sellRefund } from '../data/towers.js';
import { T4_EFFECT_KEYS } from '../systems/towerShot.js';
import { EntitySprite } from '../systems/EntitySprite.js';
import { unitDepth } from '../systems/grounding.js';
import { setBaseFireRate } from '../systems/fireRateMods.js';
import { popScale } from '../systems/juiceMath.js';
import { FONTS } from '../data/theme.js';
import { TowerTierLook } from '../systems/TowerTierLook.js';
import { tierVariant } from '../systems/spriteKeys.js';
import { TIER_SCALE } from '../data/tierLooks.js';
import { addText } from '../ui/hiDpiText.js';

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
    // Neutral until a tier-4 block sets them, so towerShot can read every tower alike.
    this.shots        = 1;
    this.chain        = null;
    this.cluster      = null;
    this.slowedMult   = 1;
    this.bossStun     = 0;
    this.cooldown     = 0;
    this.totalCost    = def.cost;
    this.zoneIndex    = zoneIndex;
    this._pop         = null;  // active BUILD_POP/UPGRADE_POP block, or null
    this._popT        = 0;

    this._bg        = scene.add.graphics();
    this._icon      = addText(scene, 0, 0, def.icon, { fontSize: '16px', fontFamily: FONTS.body }).setOrigin(0.5);
    this._rangeRing = scene.add.graphics();

    this.add([this._bg, this._rangeRing, this._icon]);
    scene.add.existing(this);
    // Y-sorted inside the unit band so a lower unit draws in front.
    this.setDepth(unitDepth(this.y));
    this._rangeRing.setVisible(false);
    this._redraw();
    this._sprite = new EntitySprite(this, scene, {
      category: 'tower', type, initialState: 'idle',
    });
    // _redraw ran before the sprite existed, so the fallback disc is on the
    // canvas; redraw now that `_sprite.active` is known. The tier ring stays.
    if (this._sprite.active) { this._redraw(); this._icon.setVisible(false); }
    this._look = new TowerTierLook(this, scene, { type, sprite: this._sprite });
    this._applyTier();
  }

  // Variant and scale first: the look caches the ground it reads in setTier.
  _applyTier() {
    const v = tierVariant(this.level, this.branch);
    this._sprite.setVariant(v);
    this._sprite.setTierScale(TIER_SCALE.tower[v]);
    this._look.setTier(this.level, this.branch);
  }

  updateLook(tSec, reduced) {
    this._look.updateLook(tSec, reduced);
  }

  footY() {
    return this._look.ground().footY;
  }

  // The drawn centre (S6): muzzle flash and projectiles leave the art, while
  // targeting still measures from x/y.
  muzzlePoint() {
    return { x: this.x, y: this.y + this._sprite.pivotOffsetY() };
  }

  // Read from the live sprite rather than pivotOffsetY(), so a non-zero drift
  // means the art really left its foot (R19).
  lookSnapshot() {
    const footY = this.footY();
    const s = this._sprite.tierScale();
    const footDriftPx = this._sprite.active ? this._sprite.sprite.y + footY * s - footY : 0;
    return {
      type: this.type, level: this.level, branch: this.branch,
      ...this._look.snapshot(), scale: s, footDriftPx,
    };
  }

  _redraw() {
    const def = TOWER_DEFS[this.type];
    const sw  = [1.5, 2, 3, 4][this.level - 1];
    this._bg.clear();
    // With sprite art the disc would be an opaque plate behind the sprite; the
    // ring alone still carries tier, which is encoded ONLY in this stroke width.
    if (!this._sprite?.active) {
      this._bg.fillStyle(0x2a2a3a, 1);
      this._bg.fillCircle(0, 0, 18);
    }
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
    if (tierDef.fireRate     !== undefined) setBaseFireRate(this, tierDef.fireRate);
    if (tierDef.pierce       !== undefined) this.pierce       = tierDef.pierce;
    for (const k of T4_EFFECT_KEYS) if (tierDef[k] !== undefined) this[k] = tierDef[k];
    this._redraw();
    this._applyTier();
  }

  // `pop` is a BUILD_POP/UPGRADE_POP block; passing data (not a string tag)
  // means a typo can't silently become an upgrade pop.
  startPop(pop) {
    this._pop  = pop;
    this._popT = 0;
  }

  // Driven by GameScene._updateTowers (towers have no update of their own).
  // Squashing the sprite keeps the manifest and tier scale; (1, 1) restores it exactly.
  updatePop(dt) {
    if (!this._pop) return;
    this._popT += dt;
    if (this._popT >= this._pop.duration) {
      this._pop = null;
      this._sprite.setSquash(1, 1);
      return;
    }
    const s = popScale(this._popT, this._pop.duration, this._pop.peak);
    this._sprite.setSquash(s, s);
  }

  sell() {
    const refund = sellRefund(this.totalCost);
    this.destroy();
    return refund;
  }

  showRange() { this._rangeRing.setVisible(true); }
  hideRange()  { this._rangeRing.setVisible(false); }
}
