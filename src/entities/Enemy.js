import Phaser from 'phaser';
import { getWeaknessMultiplier } from '../data/weaknessMatrix.js';
import { SFX_KEYS } from '../systems/AudioManager.js';
import { enemyHitSfxKey } from '../systems/sfxKeys.js';
import { EntitySprite } from '../systems/EntitySprite.js';

export class Enemy extends Phaser.GameObjects.Container {
  constructor(scene, { def, scaleFactor = 1, startX, startY }) {
    super(scene, startX, startY);

    this.def           = def;
    // Index into PathManager.path — the DENSE sampled curve (~12 points per
    // waypoint span), not the raw waypoints. Only compared ordinally.
    this.waypointIndex = 0;
    this.maxHp         = def.hp * scaleFactor;
    this.hp            = this.maxHp;
    this.armor         = def.armor;
    this.reward        = def.reward;
    this.dead          = false;
    this.statusEffects = {
      slow:       { active: false, timer: 0, factor: 1 },
      stun:       { active: false, timer: 0 },
      burn:       { active: false, timer: 0, dps: 0, tickAccum: 0 },
      vulnerable: { active: false, timer: 0, multiplier: 1 },
    };

    this._body    = scene.add.graphics();
    this._overlay = scene.add.graphics();  // status rings — always visible
    this._hpBar   = scene.add.graphics();
    this.add([this._body, this._overlay, this._hpBar]);
    scene.add.existing(this);
    this.setDepth(14); // above the static road/build-pad layer (depth 10)
    this._redrawBody();
    this._redrawStatusOverlay();
    this._redrawHpBar();

    this._sprite = new EntitySprite(this, scene, {
      category: 'enemy', type: def.type, initialState: 'move',
    });
    if (this._sprite.active) this._body.setVisible(false);
  }

  get currentSpeed() {
    return this.statusEffects.slow.active
      ? this.def.speed * this.statusEffects.slow.factor
      : this.def.speed;
  }

  update(dt) {
    if (this.statusEffects.slow.active) {
      this.statusEffects.slow.timer -= dt;
      if (this.statusEffects.slow.timer <= 0) {
        this.statusEffects.slow = { active: false, timer: 0, factor: 1 };
        this._redrawStatusOverlay();
      }
    }
    if (this.statusEffects.stun.active) {
      this.statusEffects.stun.timer -= dt;
      if (this.statusEffects.stun.timer <= 0) {
        this.statusEffects.stun = { active: false, timer: 0 };
        this._redrawStatusOverlay();
      }
    }
    if (this.statusEffects.burn.active) {
      this.statusEffects.burn.timer -= dt;
      this.statusEffects.burn.tickAccum += dt;
      while (this.statusEffects.burn.tickAccum >= 1 && this.statusEffects.burn.active) {
        this.statusEffects.burn.tickAccum -= 1;
        this.takeDamage(this.statusEffects.burn.dps, { source: { kind: 'status', type: 'burn' } });
      }
      if (this.statusEffects.burn.timer <= 0) {
        this.statusEffects.burn = { active: false, timer: 0, dps: 0, tickAccum: 0 };
      }
    }
    if (this.statusEffects.vulnerable.active) {
      this.statusEffects.vulnerable.timer -= dt;
      if (this.statusEffects.vulnerable.timer <= 0) {
        this.statusEffects.vulnerable = { active: false, timer: 0, multiplier: 1 };
      }
    }
  }

  takeDamage(amount, opts = false) {
    // Back-compat: callers used to pass `pierce` as a bare boolean.
    const optsObj = (opts && typeof opts === 'object') ? opts : { pierce: Boolean(opts) };
    const armor = optsObj.pierce ? 0 : this.armor;
    const afterArmor = Math.max(1, amount - armor);
    const mult = getWeaknessMultiplier(optsObj.source, this.def.type);
    const vulnMult = this.statusEffects.vulnerable.active ? this.statusEffects.vulnerable.multiplier : 1;
    const dmg = Math.max(1, Math.floor(afterArmor * mult * vulnMult));
    this.hp -= dmg;
    const justDied = this.hp <= 0 && !this.dead;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    this._redrawHpBar();

    const am = this.scene.game?.registry?.get('audio');
    if (am) am.playSfx(enemyHitSfxKey(this.def.type, SFX_KEYS), { detune: (Math.random() - 0.5) * 100 });
    this.scene.events.emit('damage-dealt', {
      target: this,
      amount: dmg,
      isCrit: optsObj.isCrit ?? false,
      isAoe:  optsObj.isAoe  ?? false,
      abilityLabel: optsObj.abilityLabel ?? null,
    });

    if (justDied) {
      const t = this.def?.type;
      const isLarge = t === 'brute' || t === 'titan';
      if (am) am.playSfx(isLarge ? 'enemy-death-large' : 'enemy-death-small');
      if (t === 'titan') this.scene.events.emit('boss-died', { bossType: t });
    }
  }

  applyStatus({ type, duration, factor, dps, multiplier }) {
    if (type === 'slow') {
      this.statusEffects.slow = { active: true, timer: duration, factor };
      this._redrawStatusOverlay();
    }
    if (type === 'stun') {
      this.statusEffects.stun = { active: true, timer: duration };
      this._redrawStatusOverlay();
    }
    if (type === 'burn') {
      const existing = this.statusEffects.burn;
      const newDps = existing.active ? Math.max(existing.dps, dps) : dps;
      this.statusEffects.burn = { active: true, timer: duration, dps: newDps, tickAccum: existing.active ? existing.tickAccum : 0 };
    }
    if (type === 'vulnerable') {
      this.statusEffects.vulnerable = { active: true, timer: duration, multiplier };
    }
  }

  _redrawBody() {
    const r = this.def.radius;
    this._body.clear();

    // Drop shadow
    this._body.fillStyle(0x000000, 0.25);
    this._body.fillEllipse(0, r + 2, r * 1.5, 6);

    const t = this.def.type;
    if (t === 'drone') {
      this._body.fillStyle(this.def.color, 0.2);
      this._body.fillPoints(this._hexPoints(r * 1.5), true);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r), true);
    } else if (t === 'skitter') {
      this._body.fillStyle(this.def.color, 0.2);
      this._body.fillEllipse(0, 0, r * 2.8, r * 2.0);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._diamondPoints(r * 1.4, r), true);
      this._body.lineStyle(1.5, this.def.color, 0.8);
      for (const [lx, ly] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        this._body.lineBetween(lx * r * 0.6, ly * r * 0.5, lx * r * 1.2, ly * r * 1.1);
      }
    } else if (t === 'brute') {
      this._body.fillStyle(this.def.color, 0.15);
      this._body.fillPoints(this._hexPoints(r * 1.3), true);
      this._body.fillStyle(0x334433, 1);
      this._body.fillPoints(this._hexPoints(r), true);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r * 0.65), true);
    } else if (t === 'phantom') {
      this._body.fillStyle(this.def.color, 0.15);
      this._body.fillCircle(0, 0, r * 1.8);
      this._body.lineStyle(2, this.def.color, 0.7);
      this._body.strokeCircle(0, 0, r * 1.4);
      this._body.fillStyle(this.def.color, 0.9);
      this._body.fillCircle(0, 0, r * 0.6);
    } else if (t === 'titan') {
      this._body.fillStyle(0x1a0000, 1);
      this._body.fillPoints(this._hexPoints(r), true);
      this._body.fillStyle(0x660000, 1);
      this._body.fillPoints(this._hexPoints(r * 0.72), true);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r * 0.44), true);
    } else {
      this._body.fillStyle(this.def.color, 1);
      this._body.fillCircle(0, 0, r);
    }
  }

  _redrawStatusOverlay() {
    const r = this.def.radius;
    const t = this.def.type;
    this._overlay.clear();
    if (this.statusEffects.slow.active) {
      this._overlay.lineStyle(2, 0x00eeff, 1);
      if (t === 'drone' || t === 'brute') {
        this._overlay.strokePoints(this._hexPoints(r + 2), true);
      } else if (t === 'skitter') {
        this._overlay.strokePoints(this._diamondPoints(r * 1.4 + 2, r + 2), true);
      } else {
        this._overlay.strokeCircle(0, 0, r + 2);
      }
    }
    if (this.statusEffects.stun.active) {
      this._overlay.lineStyle(2, 0xffffff, 0.85);
      this._overlay.strokeCircle(0, 0, r + 3);
    }
  }

  _redrawHpBar() {
    const r   = this.def.radius;
    const bw  = r * 2.2, bh = 4, bx = -bw / 2, by = -r - 8;
    const pct = this.hp / this.maxHp;
    this._hpBar.clear();
    this._hpBar.fillStyle(0x222222, 1);
    this._hpBar.fillRect(bx, by, bw, bh);
    this._hpBar.fillStyle(pct > 0.5 ? 0x2ecc40 : pct > 0.25 ? 0xf39c12 : 0xe74c3c, 1);
    this._hpBar.fillRect(bx, by, bw * pct, bh);
  }

  _hexPoints(r) {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
  }

  _diamondPoints(w, h) {
    return [{ x: 0, y: -h }, { x: w / 2, y: 0 }, { x: 0, y: h }, { x: -w / 2, y: 0 }];
  }
}
