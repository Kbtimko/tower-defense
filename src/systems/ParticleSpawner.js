import Phaser from 'phaser';

export const MUZZLE_TINTS = {
  default:  0xffffff,
  archer:   0xffffff,
  cannon:   0xffdd66,
  mage:     0x66ccff,
  ice:      0xaaddff,
  sniper:   0xffffff,
  barracks: 0xffffff,
};

const TRAIL_CONFIG = {
  default: { lifespan: 250, scale: { start: 0.4, end: 0 }, alpha: { start: 1,   end: 0 }, frequency: 16, tint: 0xffffff },
  rocket:  { lifespan: 250, scale: { start: 0.6, end: 0 }, alpha: { start: 0.8, end: 0 }, frequency: 24, tint: 0xaaaaaa },
  laser:   { lifespan: 250, scale: { start: 0.5, end: 0 }, alpha: { start: 1,   end: 0 }, frequency: 12, tint: 0x66ccff },
};

export class ParticleSpawner {
  constructor(scene) {
    this._scene = scene;
  }

  spawnMuzzleFlash(x, y, towerType) {
    const tint = MUZZLE_TINTS[towerType] ?? MUZZLE_TINTS.default;
    const config = {
      tint,
      lifespan: 80,
      speed: { min: 40, max: 80 },
      scale: { start: 0.6, end: 0 },
      quantity: 3,
      angle: { min: 0, max: 360 },
      blendMode: 'ADD',
    };
    const emitter = this._scene.add.particles(x, y, 'spark', config);
    if (emitter.explode) emitter.explode(3, x, y);
    this._scene.time.delayedCall(150, () => emitter.destroy && emitter.destroy());
    return emitter;
  }

  spawnProjectileTrail(projectile, towerType) {
    const config = TRAIL_CONFIG[towerType] ?? TRAIL_CONFIG.default;
    const emitter = this._scene.add.particles(projectile.x, projectile.y, 'spark', config);
    if (emitter.startFollow) emitter.startFollow(projectile);
    return emitter;
  }

  spawnHeroAbilityVFX(ability, x, y, radius) {
    if (ability === 'airstrike') {
      const e = this._scene.add.particles(x, y, 'spark', {
        tint: 0xff6633, lifespan: 400, speed: { min: 60, max: 180 },
        scale: { start: 1.0, end: 0 }, quantity: 30, blendMode: 'ADD',
        angle: { min: 0, max: 360 },
      });
      if (e.explode) e.explode(30, x, y);
      this._scene.time.delayedCall(500, () => e.destroy && e.destroy());
      this.spawnAirstrikeRing(x, y);
      return e;
    }
    if (ability === 'emp') {
      const e = this._scene.add.particles(x, y, 'spark', {
        tint: 0x66ccff, lifespan: 600, speed: { min: 80, max: 200 },
        scale: { start: 0.5, end: 0 }, quantity: 20, blendMode: 'ADD',
        angle: { min: 0, max: 360 },
      });
      if (e.explode) e.explode(20, x, y);
      this._scene.time.delayedCall(700, () => e.destroy && e.destroy());
      this.spawnEMPRing(x, y, radius);
      return e;
    }
    if (ability === 'overcharge') {
      const e = this._scene.add.particles(x, y, 'spark', {
        tint: 0xffcc44, lifespan: 6000, speed: { min: 20, max: 40 },
        scale: { start: 0.4, end: 0 }, frequency: 125, blendMode: 'ADD',
        emitZone: { type: 'edge', source: new Phaser.Geom.Circle(0, 0, 24), quantity: 8 },
      });
      this._scene.time.delayedCall(6000, () => e.destroy && e.destroy());
      return e;
    }
  }

  spawnAirstrikeRing(x, y) {
    const ring = this._scene.add.graphics();
    ring.lineStyle(3, 0xff6633, 1);
    ring.strokeCircle(0, 0, 1);
    ring.setPosition(x, y);
    ring.setDepth(15);
    this._scene.tweens.add({
      targets: ring,
      scale: { from: 0, to: 60 },
      alpha: { from: 1, to: 0 },
      duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy && ring.destroy(),
    });
    return ring;
  }

  spawnEMPRing(x, y, radius) {
    const ring = this._scene.add.graphics();
    ring.lineStyle(3, 0x66ccff, 1);
    ring.strokeCircle(0, 0, 1);
    ring.setPosition(x, y);
    ring.setDepth(15);
    this._scene.tweens.add({
      targets: ring,
      scale: { from: 0, to: radius },
      alpha: { from: 1, to: 0 },
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy && ring.destroy(),
    });
    return ring;
  }
}
