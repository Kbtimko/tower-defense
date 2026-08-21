import Phaser from 'phaser';
import { EntitySprite } from '../systems/EntitySprite.js';
import { pointAtProgress } from '../systems/pathGeometry.js';
import {
  SOLDIER_ATTACK_RATE, soldierMaxHp, soldierRespawnDuration, damageSoldier, tickSoldier,
} from '../systems/soldierCombat.js';

export class Soldier extends Phaser.GameObjects.Container {
  constructor(scene, { barracks, pathProgress, pathPoints, soldierStats, modifiers = {} }) {
    super(scene, 0, 0);

    const maxHp = soldierMaxHp(soldierStats, modifiers);
    this.barracks        = barracks;
    this.pathProgress    = pathProgress;
    this.hp              = maxHp;
    this.maxHp           = maxHp;
    this.damage          = soldierStats.damage;
    this.respawnDuration = soldierRespawnDuration(soldierStats, modifiers);
    this.canBlockFlyers  = soldierStats.canBlockFlyers;
    this.attackRate      = SOLDIER_ATTACK_RATE;
    this.attackTimer     = 0;
    this.dead            = false;
    this.respawnTimer    = 0;

    this._body  = scene.add.graphics();
    this._hpBar = scene.add.graphics();
    this.add([this._body, this._hpBar]);
    scene.add.existing(this);
    this.setDepth(13); // above the static road/build-pad layer (depth 10)

    this._drawBody();
    this._sprite = new EntitySprite(this, scene, {
      category: 'soldier', type: 'default', initialState: 'idle',
    });
    if (this._sprite.active) this._body.setVisible(false);
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
    const { x, y } = pointAtProgress(pathPoints, progress);
    this.x = x;
    this.y = y;
  }

  takeDamage(amount) {
    if (this.dead) return;
    if (damageSoldier(this, amount)) {
      this._body.setVisible(false);
      if (this._sprite?.active) this._sprite.sprite.setVisible(false);
      this._hpBar.clear();
      return;
    }
    this._redrawHpBar();
  }

  respawn() {
    this.dead         = false;
    this.hp           = this.maxHp;
    this.respawnTimer = 0;
    if (this._sprite?.active) this._sprite.sprite.setVisible(true);
    else this._body.setVisible(true);
    this._redrawHpBar();
  }

  heal() {
    if (this.dead) return;
    this.hp = this.maxHp;
    this._redrawHpBar();
  }

  update(dt) {
    if (tickSoldier(this, dt)) this.respawn();
  }
}
