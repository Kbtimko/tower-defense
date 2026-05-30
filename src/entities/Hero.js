import Phaser from 'phaser';
import { heroSource } from '../data/sourceBuilders.js';

const MOVE_SPEED     = 130;
const ATTACK_RANGE   = 40;
const ATTACK_RATE    = 1.5;
const ATTACK_DAMAGE  = 18;
const MAX_HP         = 150;
const RESPAWN_TIME   = 20;

export const HERO_STATS = {
  attackDamage: ATTACK_DAMAGE,
  attackRange:  ATTACK_RANGE,
  attackRate:   ATTACK_RATE,
  maxLevel:     3,
  abilityUnlockLevels: { q: 1, w: 2, e: 3 },
};

export class Hero extends Phaser.GameObjects.Container {
  constructor(scene, { x, y, pathPoints }, modifiers = {}) {
    super(scene, x, y);

    const maxHp = MAX_HP + (modifiers.heroMaxHpBonus ?? 0);
    this.hp           = maxHp;
    this.maxHp        = maxHp;
    this.level        = modifiers.heroStartLevel ?? 1;
    this._respawnTime = RESPAWN_TIME + (modifiers.heroRespawnDelta ?? 0);
    this.killCount    = 0;
    this.dead         = false;
    this.respawnTimer = 0;
    this.moving = false;

    this._pathPoints      = pathPoints || [];
    this._totalPathLength = 0;
    for (let i = 0; i < this._pathPoints.length - 1; i++) {
      this._totalPathLength += Math.hypot(
        this._pathPoints[i + 1].x - this._pathPoints[i].x,
        this._pathPoints[i + 1].y - this._pathPoints[i].y
      );
    }
    this.pathProgress   = 0;
    this.targetProgress = 0;

    this.overchargeTimer     = 0;
    this.airstrikeTimer      = 0;
    this.empTimer            = 0;
    this.overchargeActive    = false;
    this.overchargeRemaining = 0;

    this._attackTimer = 0;

    this._body  = scene.add.graphics();
    this._hpBar = scene.add.graphics();
    this.add([this._body, this._hpBar]);
    scene.add.existing(this);
    this.setDepth(4);
    this._drawBody();

    if (this._totalPathLength > 0) this.setPathPosition(0);
  }

  _drawBody() {
    this._body.clear();
    this._body.fillStyle(0x1a2a4a, 1);
    this._body.fillCircle(0, -10, 6);
    this._body.fillRect(-4, -4, 8, 10);
    this._body.lineStyle(2, 0x4fc3f7, 1);
    this._body.strokeCircle(0, -10, 6);
    this._body.strokeRect(-4, -4, 8, 10);
  }

  _redrawHpBar() {
    this._hpBar.clear();
    if (this.hp >= this.maxHp) return;
    const w = 16, h = 2, ox = -8, oy = -22;
    this._hpBar.fillStyle(0x333333, 1);
    this._hpBar.fillRect(ox, oy, w, h);
    this._hpBar.fillStyle(0x4fc3f7, 1);
    this._hpBar.fillRect(ox, oy, Math.max(0, w * (this.hp / this.maxHp)), h);
  }

  setPathPosition(progress) {
    this.pathProgress = progress;
    if (this._totalPathLength <= 0) return;
    let target = progress * this._totalPathLength;
    const pts = this._pathPoints;
    for (let i = 0; i < pts.length - 1; i++) {
      const dx  = pts[i + 1].x - pts[i].x;
      const dy  = pts[i + 1].y - pts[i].y;
      const len = Math.hypot(dx, dy);
      if (target <= len || i === pts.length - 2) {
        const t = len > 0 ? Math.min(1, target / len) : 0;
        this.x = pts[i].x + t * dx;
        this.y = pts[i].y + t * dy;
        return;
      }
      target -= len;
    }
    // Backstop: the `i === pts.length - 2` guard above is meant to always catch
    // the last segment, but match Soldier.setPathProgress in case the loop ever
    // exits without returning (defensive parity).
    this.x = pts[pts.length - 1].x;
    this.y = pts[pts.length - 1].y;
  }

  moveToProgress(progress) {
    if (this.dead) return;
    this.targetProgress = progress;
    this.moving = (progress !== this.pathProgress);
  }

  takeDamage(amount, _pierce = false) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this._redrawHpBar();
    if (this.hp <= 0) {
      this.dead         = true;
      this.respawnTimer = this._respawnTime;
      this._body.setVisible(false);
      this._hpBar.clear();
      const am = this.scene.game?.registry?.get('audio');
      if (am) am.playSfx('hero-death');
    }
  }

  respawn() {
    this.dead           = false;
    this.hp             = this.maxHp;
    this.respawnTimer   = 0;
    this.pathProgress   = 0;
    this.targetProgress = 0;
    this.moving         = false;
    this.setPathPosition(0);
    this._attackTimer = 1 / ATTACK_RATE;
    this._body.setVisible(true);
    this._redrawHpBar();
    const am = this.scene.game?.registry?.get('audio');
    if (am) am.playSfx('hero-respawn');
  }

  _registerKill() {
    this.killCount++;
    const prev = this.level;
    if (this.level < 2 && this.killCount >= 25) this.level = 2;
    if (this.level < 3 && this.killCount >= 75) this.level = 3;
    if (this.level !== prev) this.scene.events.emit('hero:level-up', { level: this.level });
  }

  overcharge() {
    if (this.dead || this.overchargeTimer > 0) return false;
    this.overchargeTimer     = 30;
    this.overchargeActive    = true;
    this.overchargeRemaining = 6;
    return true;
  }

  airstrike(x, y) {
    if (this.dead || this.airstrikeTimer > 0) return null;
    this.airstrikeTimer = 25;
    return { x, y, radius: 70, damage: 80 };
  }

  empPulse() {
    if (this.dead || this.empTimer > 0) return false;
    this.empTimer = 45;
    return true;
  }

  update(dt, enemies) {
    if (this.overchargeTimer    > 0) this.overchargeTimer    = Math.max(0, this.overchargeTimer    - dt);
    if (this.airstrikeTimer     > 0) this.airstrikeTimer     = Math.max(0, this.airstrikeTimer     - dt);
    if (this.empTimer           > 0) this.empTimer           = Math.max(0, this.empTimer           - dt);
    if (this.overchargeRemaining > 0) {
      this.overchargeRemaining = Math.max(0, this.overchargeRemaining - dt);
      if (this.overchargeRemaining === 0) this.overchargeActive = false;
    }

    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }

    if (this.moving && this._totalPathLength > 0) {
      const deltaProgress = (MOVE_SPEED * dt) / this._totalPathLength;
      const remaining     = this.targetProgress - this.pathProgress;
      if (Math.abs(remaining) <= deltaProgress) {
        this.pathProgress = this.targetProgress;
        this.moving       = false;
      } else {
        this.pathProgress += Math.sign(remaining) * deltaProgress;
      }
      this.setPathPosition(this.pathProgress);
    }

    this._attackTimer -= dt;
    if (this._attackTimer <= 0) {
      let nearest = null, nearestDist = Infinity;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d <= ATTACK_RANGE && d < nearestDist) { nearest = e; nearestDist = d; }
      }
      if (nearest) {
        nearest.takeDamage(ATTACK_DAMAGE, { source: heroSource() });
        if (nearest.dead) this._registerKill();
        const am = this.scene.game?.registry?.get('audio');
        if (am) am.playSfx('hero-attack');
        this._attackTimer = 1 / ATTACK_RATE;
      }
    }
  }
}
