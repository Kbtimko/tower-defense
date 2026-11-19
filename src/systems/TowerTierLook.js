// A tower's tier marks (#49): glowing core (T2+, art-less towers only, #73a), rising embers (T3+), tier
// pips (T1-T3) or a branch badge (T4). They are children of the tower
// container so they move, sort and die with it; the T4 ring is a scene layer
// instead (spec S5). No Phaser import, like EntitySprite, so a plain scene
// stub can test it.
import {
  TIER_CORE, TIER_EMBERS, TIER_PIPS, TIER_FALLBACK_GROUND, towerAccent,
} from '../data/tierLooks.js';
import { FONTS } from '../data/theme.js';
import { hexToInt } from '../ui/theme.js';
import { corePulse, emberPose } from './tierLookMath.js';
import { tierVariant } from './spriteKeys.js';

const BLEND_ADD = 1; // Phaser.BlendModes.ADD
// Not taken from expectedTowerLook: the capture compares snapshot() against it,
// which would be a tautology if the render read it too.
const PIPS_BY_VARIANT = { t1: 1, t2: 2, t3: 3, t4a: 'A', t4b: 'B' };

export class TowerTierLook {
  constructor(container, scene, { type, sprite }) {
    this.container = container;
    this.scene = scene;
    this.sprite = sprite;
    this.accent = towerAccent(type);
    this._glow = null;
    this._hot = null;
    this._embers = [];
    this._pips = null;
    this._badgeText = null;
    this._pipsShown = null;
    this._ground = TIER_FALLBACK_GROUND;
  }

  ground() {
    return this.sprite.groundSpec() ?? TIER_FALLBACK_GROUND;
  }

  centreY() {
    return this.sprite.pivotOffsetY();
  }

  // Tower calls this after the sprite's variant and tier scale are set, so the
  // ground read here is the new tier's. The core is dropped over real art, which
  // carries its own glow; _setCore(false) also removes one drawn before art loaded.
  setTier(level, branch) {
    this._ground = this.ground();
    this._setCore(level >= TIER_CORE.fromTier && !this.sprite.active);
    this._setEmbers(level >= TIER_EMBERS.fromTier ? TIER_EMBERS.count : 0);
    this._drawPips(PIPS_BY_VARIANT[tierVariant(level, branch)]);
  }

  _addImage(key) {
    const img = this.scene.add.image(0, 0, key).setBlendMode(BLEND_ADD);
    this.container.add(img);
    return img;
  }

  _setCore(on) {
    if (!on) {
      if (this._glow) { this._glow.destroy(); this._hot.destroy(); }
      this._glow = this._hot = null;
      return;
    }
    if (!this._glow) {
      this._glow = this._addImage('fx-glow').setTint(this.accent);
      this._hot = this._addImage('fx-ember');
    }
    const size = TIER_CORE.sizeFrac * this._ground.width;
    const hot = TIER_CORE.hotFrac * size;
    const y = this.centreY();
    this._glow.setPosition(0, y).setDisplaySize(size, size);
    this._hot.setPosition(0, y).setDisplaySize(hot, hot);
  }

  _setEmbers(count) {
    while (this._embers.length > count) this._embers.pop().destroy();
    while (this._embers.length < count) {
      // Hidden until the first updateLook poses it, so it never flashes at the origin.
      this._embers.push(
        this._addImage('fx-ember').setTint(this.accent)
          .setDisplaySize(TIER_EMBERS.sizePx, TIER_EMBERS.sizePx).setAlpha(0),
      );
    }
  }

  // Redrawn only here, never per frame.
  _drawPips(pips) {
    if (!this._pips) {
      this._pips = this.scene.add.graphics();
      this.container.add(this._pips);
    }
    const g = this._pips.clear();
    const { radius, gapPx, outlinePx, minY, gapBelowFootPx, badge } = TIER_PIPS;
    const outline = hexToInt(TIER_PIPS.outline);
    // In front of the pad rim or the foot, whichever is lower (R9).
    const y = Math.max(minY, this._ground.footY) + gapBelowFootPx;
    g.lineStyle(outlinePx, outline).fillStyle(this.accent);

    if (typeof pips === 'number') {
      if (this._badgeText) { this._badgeText.destroy(); this._badgeText = null; }
      const step = 2 * radius + gapPx;
      for (let i = 0; i < pips; i++) {
        const x = (i - (pips - 1) / 2) * step;
        g.fillCircle(x, y, radius);
        // Stroke outside the dot, like the mockup's ring-shadow outline.
        g.strokeCircle(x, y, radius + outlinePx / 2);
      }
    } else {
      // An em box per letter keeps the badge size independent of font loading.
      const w = badge.fontPx + 2 * badge.padX;
      const h = badge.fontPx + 2 * badge.padY;
      g.fillRoundedRect(-w / 2, y - h / 2, w, h, badge.cornerPx);
      g.strokeRoundedRect(-w / 2, y - h / 2, w, h, badge.cornerPx);
      if (!this._badgeText) {
        this._badgeText = this.scene.add.text(0, y, pips, {
          fontFamily: FONTS.body, fontStyle: 'bold',
          fontSize: `${badge.fontPx}px`, color: badge.ink,
        }).setOrigin(0.5);
        this.container.add(this._badgeText);
      }
      this._badgeText.setText(pips).setPosition(0, y);
    }
    this._pipsShown = pips;
  }

  // Per frame: alpha and position only, nothing created.
  updateLook(tSec, reduced) {
    if (this._glow) {
      const a = corePulse(tSec, TIER_CORE, reduced);
      this._glow.setAlpha(a);
      this._hot.setAlpha(a);
    }
    for (let i = 0; i < this._embers.length; i++) {
      const p = emberPose(tSec, i, TIER_EMBERS, this._ground, reduced);
      this._embers[i].setPosition(p.dx, p.dy).setAlpha(p.alpha);
    }
  }

  snapshot() {
    return {
      core: this._glow != null,
      embers: this._embers.length,
      emberDy: this._embers.map((e) => e.y),
      pips: this._pipsShown,
    };
  }
}
