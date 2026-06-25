import Phaser from 'phaser';

export class Projectile extends Phaser.GameObjects.Container {
  constructor(scene, { x, y, target, damage, splashRadius = 0, pierce = false, slowFactor = 0, color = 0xffffff, towerType = 'default', tier = 1, branch = null }) {
    super(scene, x, y);

    this.target      = target;
    this.targetX     = target ? target.x : x;
    this.targetY     = target ? target.y : y;
    this.damage      = damage;
    this.splashRadius = splashRadius;
    this.pierce      = pierce;
    this.slowFactor  = slowFactor;
    this.color       = color;
    this.tier        = tier;
    this.branch      = branch;
    this.dead        = false;
    this.speed       = 280;

    const radius = splashRadius > 0 ? 5 : 3;
    const dot = scene.add.graphics();
    dot.fillStyle(color, 1);
    dot.fillCircle(0, 0, radius);
    if (slowFactor > 0) {
      dot.lineStyle(1, 0xaaffff, 1);
      dot.strokeCircle(0, 0, radius);
    }
    this.add(dot);
    scene.add.existing(this);
    this.setDepth(16); // above the static road/build-pad layer (depth 10)

    this.towerType = towerType;
    this._trail = null;
    if (scene.particleSpawner) {
      this._trail = scene.particleSpawner.spawnProjectileTrail(this, towerType);
    }
  }

  destroyTrail() {
    if (this._trail && this._trail.destroy) {
      this._trail.destroy();
      this._trail = null;
    }
  }
}
