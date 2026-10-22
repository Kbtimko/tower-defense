import Phaser from 'phaser';
import { TRAIL_FX, MUZZLE_FX, IMPACT_FX } from '../data/fx.js';
import { projectileFx } from './fxResolve.js';

// Just above projectiles (depth 16) so effects read over the shot.
const FX_DEPTH = 17;

// Data fields line up with ParticleEmitter config keys; emitting:false keeps
// the shared emitter idle until explode / emitParticleAt drives it.
function emitterConfig(def) {
  const { tint, lifespan, quantity, speed, scale, alpha, blendMode } = def;
  return { tint, lifespan, quantity, speed, scale, alpha, blendMode, emitting: false };
}

export class ParticleSpawner {
  constructor(scene) {
    this._scene = scene;
    // One emitter per effect for the scene's lifetime (no per-shot allocation).
    this._emitters = new Map();
  }

  _emitter(cacheKey, def) {
    let emitter = this._emitters.get(cacheKey);
    if (!emitter) {
      emitter = this._scene.add.particles(0, 0, def.texture, emitterConfig(def));
      emitter.setDepth(FX_DEPTH);
      this._emitters.set(cacheKey, emitter);
    }
    return emitter;
  }

  // `towerType` may also be a MUZZLE_FX key directly (soldiers have no tower def).
  spawnMuzzleFlash(x, y, towerType, tier = 1, branch = null) {
    const key = MUZZLE_FX[towerType] ? towerType : projectileFx(towerType, tier, branch).muzzle;
    const def = MUZZLE_FX[key];
    this._emitter(`muzzle:${key}`, def).explode(def.quantity, x, y);
  }

  spawnImpact(impactKey, x, y) {
    const fx = IMPACT_FX[impactKey];
    if (!fx) return;
    const layers = Array.isArray(fx) ? fx : [fx];
    layers.forEach((def, i) => {
      this._emitter(`impact:${impactKey}:${i}`, def).explode(def.quantity, x, y);
    });
  }

  // Emits at the drawn position (ground y plus the art's arc lift) so smoke
  // follows a lobbed shell rather than its shadow.
  emitTrail(projectile, dt) {
    const key = projectile.fx.trail;
    const def = TRAIL_FX[key];
    if (!def || !def.rate) return;
    projectile._trailAcc += def.rate * dt;
    const n = Math.floor(projectile._trailAcc);
    if (n < 1) return;
    projectile._trailAcc -= n;
    this._emitter(`trail:${key}`, def)
      .emitParticleAt(projectile.x, projectile.y + projectile.art.y, n);
  }

  destroy() {
    for (const emitter of this._emitters.values()) emitter.destroy();
    this._emitters.clear();
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
