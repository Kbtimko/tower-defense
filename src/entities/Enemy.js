import Phaser from 'phaser';

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
    this.statusEffects = { slow: { active: false, timer: 0, factor: 1 } };

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
  }

  takeDamage(amount, pierce = false) {
    const armor = pierce ? 0 : this.armor;
    this.hp -= Math.max(1, amount - armor);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    this._redrawHpBar();
  }

  applyStatus({ type, duration, factor }) {
    if (type === 'slow') {
      this.statusEffects.slow = { active: true, timer: duration, factor };
      this._redrawBody();
    }
  }

  _redrawBody() {
    const r = this.def.radius;
    this._body.clear();
    this._body.fillStyle(0x000000, 0.25);
    this._body.fillEllipse(0, r + 2, r * 1.5, 6);
    this._body.fillStyle(this.def.color, 1);
    this._body.fillCircle(0, 0, r);
    if (this.statusEffects.slow.active) {
      this._body.lineStyle(2, 0x00eeff, 1);
      this._body.strokeCircle(0, 0, r);
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
}
