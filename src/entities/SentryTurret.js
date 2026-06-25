import Phaser from 'phaser';
import { Projectile } from './Projectile.js';
import { EntitySprite } from '../systems/EntitySprite.js';

const RANGE     = 100;
const DAMAGE    = 15;
const RATE      = 1.0;
const LIFESPAN  = 12;
const COLOR     = 0xff9933;

export class SentryTurret extends Phaser.GameObjects.Container {
  constructor(scene, { x, y, ownerHeroId }) {
    super(scene, x, y);
    this.ownerHeroId = ownerHeroId;
    this.range       = RANGE;
    this.damage      = DAMAGE;
    this.rate        = RATE;
    this.lifespan    = LIFESPAN;
    this._cooldown   = 0;
    this._body       = scene.add.graphics();
    this.add(this._body);
    this._drawBody();
    scene.add.existing(this);
    this.setDepth(3);
    this._sprite = new EntitySprite(this, scene, {
      category: 'sentry', type: 'default', initialState: 'idle',
    });
    if (this._sprite.active) this._body.setVisible(false);
  }

  _drawBody() {
    const g = this._body;
    g.clear();
    g.fillStyle(0x666666, 1);
    g.fillCircle(0, 0, 7);
    g.fillStyle(0x444444, 1);
    g.fillRect(0, -1, 8, 3);
    g.lineStyle(2, COLOR, 1);
    g.strokeCircle(0, 0, 7);
  }

  _nearestEnemyInRange(enemies) {
    let best = null, bestD = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d <= this.range && d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  update(dt, enemies) {
    this.lifespan -= dt;
    if (this.lifespan <= 0) { this.destroy(); return false; }
    this._cooldown -= dt;
    if (this._cooldown <= 0) {
      const target = this._nearestEnemyInRange(enemies);
      if (target) {
        this.scene.projectiles.push(new Projectile(this.scene, {
          x: this.x, y: this.y, target,
          damage: this.damage, splashRadius: 0, pierce: false, slowFactor: 0,
          color: COLOR, towerType: 'archer', tier: 1, branch: null,
        }));
        this._cooldown += 1 / this.rate;
        this._sprite?.setState('attack');
      } else {
        // No target this tick — clamp to 0 so a long idle period doesn't accrue
        // negative cooldown debt and burst-fire when an enemy finally appears.
        this._cooldown = 0;
      }
    }
    return true;
  }
}
