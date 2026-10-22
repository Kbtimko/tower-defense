import Phaser from 'phaser';
import { projectileFx, arcOffset } from '../systems/fxResolve.js';
import { PROJECTILE_DRAW as D } from '../data/fx.js';

// Pooled: the constructor builds the display children once, reset() re-arms
// them for each shot. The container's x/y are always the true ground position;
// any lift (cannon arc) is a y offset on the art child only.
export class Projectile extends Phaser.GameObjects.Container {
  constructor(scene, opts) {
    super(scene, opts.x, opts.y);

    this.shadow = scene.add.graphics();
    // Not `body`: Container reserves that name for its physics body.
    this.art   = scene.add.graphics();
    this.glow   = scene.add.image(0, 0, 'fx-glow');
    this.glow.setBlendMode('ADD');
    this.add([this.shadow, this.art, this.glow]);
    scene.add.existing(this);
    this.setDepth(16); // above the static road/build-pad layer (depth 10)

    this._trail = null;
    this.reset(opts);
  }

  reset({ x, y, target, damage, splashRadius = 0, pierce = false, slowFactor = 0, color = 0xffffff,
          towerType = 'default', tier = 1, branch = null, fxType = null }) {
    this.x = x;
    this.y = y;
    this.target       = target;
    this.targetX      = target ? target.x : x;
    this.targetY      = target ? target.y : y;
    this.damage       = damage;
    this.splashRadius = splashRadius;
    this.pierce       = pierce;
    this.slowFactor   = slowFactor;
    this.color        = color;
    this.towerType    = towerType;
    this.tier         = tier;
    this.branch       = branch;
    this.dead         = false;
    this.speed        = 280;

    // fxType only picks visuals; towerType is the gameplay damage source.
    this.fx = projectileFx(fxType ?? towerType, tier, branch);
    this.startDist = Math.max(1, Math.hypot(this.targetX - x, this.targetY - y));

    this._drawBody();
    this.setVisible(true);
    this.setActive(true);

    // Task 4: replaced by the shared trail emitter.
    this.destroyTrail();
    if (this.scene.particleSpawner) {
      this._trail = this.scene.particleSpawner.spawnProjectileTrail(this, towerType);
    }
    this.updateVisual();
  }

  _drawBody() {
    const { shape, color, size } = this.fx;
    const g = this.art;
    g.clear();
    // A pooled instance may be reused from a lifted cannon shell.
    this.art.y = this.glow.y = 0;
    this.glow.setVisible(shape === 'bolt');
    switch (shape) {
      case 'arrow': {
        g.lineStyle(size.width, color, 1);
        g.lineBetween(-size.length, 0, 0, 0);
        g.fillStyle(color, 1);
        g.fillTriangle(D.arrowHead, 0, 0, -size.width * 1.5, 0, size.width * 1.5);
        break;
      }
      case 'shell':
        g.fillStyle(color, 1);
        g.fillCircle(0, 0, size);
        g.lineStyle(1, D.rimColor, 1);
        g.strokeCircle(0, 0, size);
        break;
      case 'bolt':
        g.fillStyle(color, 1);
        g.fillCircle(0, 0, size);
        g.fillStyle(D.coreColor, 1);
        g.fillCircle(0, 0, size * D.coreRatio);
        this.glow.setTint(color);
        this.glow.setDisplaySize(size * D.glowRadiusRatio * 2, size * D.glowRadiusRatio * 2);
        break;
      case 'shard': {
        const half = size.length / 2, w = size.length * D.shardWidthRatio;
        g.fillStyle(color, 1);
        g.fillPoints([
          { x: half, y: 0 }, { x: 0, y: -w }, { x: -half, y: 0 }, { x: 0, y: w },
        ], true);
        break;
      }
      case 'tracer':
        g.lineStyle(size.width, color, 1);
        g.lineBetween(-size.length, 0, 0, 0);
        break;
    }

    this.shadow.clear();
    this.shadow.setVisible(!!this.fx.shadow);
    this.shadow.setScale(1);
    if (this.fx.shadow) {
      this.shadow.fillStyle(D.shadow.color, D.shadow.alpha);
      this.shadow.fillEllipse(0, 0, D.shadow.width, D.shadow.height);
    }
  }

  // Called after GameScene moves the projectile. Visual only: never touches x/y.
  updateVisual() {
    const dx = this.targetX - this.x, dy = this.targetY - this.y;
    // Keep the last heading at point-blank rather than snapping to 0.
    if (dx !== 0 || dy !== 0) this.art.rotation = this.glow.rotation = Math.atan2(dy, dx);

    const peak = this.fx.arc ?? 0;
    if (peak > 0) {
      const progress = 1 - Math.hypot(dx, dy) / this.startDist;
      const lift = arcOffset(progress, peak);
      this.art.y = this.glow.y = -lift;
      this.shadow.setScale(1 - (1 - D.shadow.minScale) * (lift / peak));
    }
  }

  deactivate() {
    this.destroyTrail();
    this.setVisible(false);
    this.setActive(false);
  }

  destroyTrail() {
    if (this._trail && this._trail.destroy) {
      this._trail.destroy();
      this._trail = null;
    }
  }
}
