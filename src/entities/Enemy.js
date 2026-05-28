import Phaser from 'phaser';
import { getWeaknessMultiplier } from '../data/weaknessMatrix.js';

export class Enemy extends Phaser.GameObjects.Container {
  constructor(scene, { def, scaleFactor = 1, startX, startY }) {
    super(scene, startX, startY);

    this.def           = def;
    this.waypointIndex = 0;
    this.maxHp         = def.hp * scaleFactor;
    this.hp            = this.maxHp;
    this.armor         = def.armor;
    this.reward        = def.reward;
    this.dead          = false;
    this.statusEffects = {
      slow: { active: false, timer: 0, factor: 1 },
      stun: { active: false, timer: 0 },
    };

    this._body  = scene.add.graphics();
    this._hpBar = scene.add.graphics();
    this.add([this._body, this._hpBar]);
    scene.add.existing(this);
    this.setDepth(3);
    this._redrawBody();
    this._redrawHpBar();
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
        this._redrawBody();
      }
    }
    if (this.statusEffects.stun.active) {
      this.statusEffects.stun.timer -= dt;
      if (this.statusEffects.stun.timer <= 0) {
        this.statusEffects.stun = { active: false, timer: 0 };
        this._redrawBody();
      }
    }
  }

  takeDamage(amount, opts = false) {
    // Back-compat: callers used to pass `pierce` as a bare boolean.
    const optsObj = (opts && typeof opts === 'object') ? opts : { pierce: Boolean(opts) };
    const armor = optsObj.pierce ? 0 : this.armor;
    const afterArmor = Math.max(1, amount - armor);
    const mult = getWeaknessMultiplier(optsObj.source, this.def.type);
    const dmg = Math.max(1, Math.floor(afterArmor * mult));
    this.hp -= dmg;
    const justDied = this.hp <= 0 && !this.dead;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    this._redrawHpBar();

    const am = this.scene.game?.registry?.get('audio');
    if (am) am.playSfx('enemy-hit', { detune: (Math.random() - 0.5) * 100 });
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

  applyStatus({ type, duration, factor }) {
    if (type === 'slow') {
      this.statusEffects.slow = { active: true, timer: duration, factor };
      this._redrawBody();
    }
    if (type === 'stun') {
      this.statusEffects.stun = { active: true, timer: duration };
      this._redrawBody();
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
      // Glow ring
      this._body.fillStyle(this.def.color, 0.2);
      this._body.fillPoints(this._hexPoints(r * 1.5), true);
      // Body
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r), true);
    } else if (t === 'skitter') {
      // Glow oval
      this._body.fillStyle(this.def.color, 0.2);
      this._body.fillEllipse(0, 0, r * 2.8, r * 2.0);
      // Body
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._diamondPoints(r * 1.4, r), true);
      // Legs — start at 60%/50% of radius from center, extend to 120%/110%
      this._body.lineStyle(1.5, this.def.color, 0.8);
      for (const [lx, ly] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        this._body.lineBetween(lx * r * 0.6, ly * r * 0.5, lx * r * 1.2, ly * r * 1.1);
      }
    } else if (t === 'brute') {
      // Glow ring
      this._body.fillStyle(this.def.color, 0.15);
      this._body.fillPoints(this._hexPoints(r * 1.3), true);
      // Dark armor base
      this._body.fillStyle(0x334433, 1);
      this._body.fillPoints(this._hexPoints(r), true);
      // Lighter center plate
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r * 0.65), true);
    } else if (t === 'phantom') {
      // Outer translucent ring — ghostly form
      this._body.fillStyle(this.def.color, 0.15);
      this._body.fillCircle(0, 0, r * 1.8);
      this._body.lineStyle(2, this.def.color, 0.7);
      this._body.strokeCircle(0, 0, r * 1.4);
      // Solid inner core
      this._body.fillStyle(this.def.color, 0.9);
      this._body.fillCircle(0, 0, r * 0.6);
    } else if (t === 'titan') {
      // Triple-layer hexagon: dark armor shell, mid layer, bright core
      this._body.fillStyle(0x1a0000, 1);
      this._body.fillPoints(this._hexPoints(r), true);
      this._body.fillStyle(0x660000, 1);
      this._body.fillPoints(this._hexPoints(r * 0.72), true);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r * 0.44), true);
    } else {
      // Fallback for unknown types (colossus)
      this._body.fillStyle(this.def.color, 1);
      this._body.fillCircle(0, 0, r);
    }

    if (this.statusEffects.slow.active) {
      this._body.lineStyle(2, 0x00eeff, 1);
      if (t === 'drone' || t === 'brute') {
        this._body.strokePoints(this._hexPoints(r + 2), true);
      } else if (t === 'skitter') {
        this._body.strokePoints(this._diamondPoints(r * 1.4 + 2, r + 2), true);
      } else {
        this._body.strokeCircle(0, 0, r + 2);
      }
    }

    // White stun ring
    if (this.statusEffects.stun.active) {
      this._body.lineStyle(2, 0xffffff, 0.85);
      this._body.strokeCircle(0, 0, this.def.radius + 3);
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
