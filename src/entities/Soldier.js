import Phaser from 'phaser';

export class Soldier extends Phaser.GameObjects.Container {
  constructor(scene, { barracks, pathProgress, pathPoints, soldierStats, modifiers = {} }) {
    super(scene, 0, 0);

    const maxHp = soldierStats.hp + (modifiers.soldierMaxHpBonus ?? 0);
    this.barracks        = barracks;
    this.pathProgress    = pathProgress;
    this.hp              = maxHp;
    this.maxHp           = maxHp;
    this.damage          = soldierStats.damage;
    this.respawnDuration = soldierStats.respawnDuration * (modifiers.soldierRespawnMult ?? 1);
    this.canBlockFlyers  = soldierStats.canBlockFlyers;
    this.attackRate      = 1;
    this.attackTimer     = 0;
    this.dead            = false;
    this.respawnTimer    = 0;

    this._body  = scene.add.graphics();
    this._hpBar = scene.add.graphics();
    this.add([this._body, this._hpBar]);
    scene.add.existing(this);
    this.setDepth(3);

    this._drawBody();
    this.setPathProgress(pathProgress, pathPoints);
  }

  _drawBody() {
    this._body.clear();
    this._body.fillStyle(0x4caf50, 1);
    this._body.fillCircle(0, -8, 4);
    this._body.fillRect(-3, -4, 6, 8);
    this._body.lineStyle(1, 0x81c784, 1);
    this._body.strokeCircle(0, -8, 4);
  }

  _redrawHpBar() {
    this._hpBar.clear();
    if (this.hp >= this.maxHp) return;
    const w = 14, h = 2, ox = -7, oy = -17;
    this._hpBar.fillStyle(0x333333, 1);
    this._hpBar.fillRect(ox, oy, w, h);
    this._hpBar.fillStyle(0x4caf50, 1);
    this._hpBar.fillRect(ox, oy, Math.max(0, w * (this.hp / this.maxHp)), h);
  }

  setPathProgress(progress, pathPoints) {
    this.pathProgress = progress;
    let totalLen = 0;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      totalLen += Math.hypot(
        pathPoints[i + 1].x - pathPoints[i].x,
        pathPoints[i + 1].y - pathPoints[i].y
      );
    }
    let target = progress * totalLen;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const dx  = pathPoints[i + 1].x - pathPoints[i].x;
      const dy  = pathPoints[i + 1].y - pathPoints[i].y;
      const len = Math.hypot(dx, dy);
      if (target <= len || i === pathPoints.length - 2) {
        const t = len > 0 ? Math.min(1, target / len) : 0;
        this.x = pathPoints[i].x + t * dx;
        this.y = pathPoints[i].y + t * dy;
        return;
      }
      target -= len;
    }
    this.x = pathPoints[pathPoints.length - 1].x;
    this.y = pathPoints[pathPoints.length - 1].y;
  }

  takeDamage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    this._redrawHpBar();
    if (this.hp <= 0) {
      this.dead         = true;
      this.respawnTimer = this.respawnDuration;
      this._body.setVisible(false);
      this._hpBar.clear();
    }
  }

  respawn() {
    this.dead         = false;
    this.hp           = this.maxHp;
    this.respawnTimer = 0;
    this._body.setVisible(true);
    this._redrawHpBar();
  }

  heal() {
    if (this.dead) return;
    this.hp = this.maxHp;
    this._redrawHpBar();
  }

  update(dt) {
    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (!this.dead) return;
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) this.respawn();
  }
}
