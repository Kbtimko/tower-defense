import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Geom: { Circle: class { constructor(x, y, r) { this.x = x; this.y = y; this.r = r; } } } } }));

import { ParticleSpawner } from './ParticleSpawner.js';
import { TRAIL_FX, MUZZLE_FX, IMPACT_FX, SOLDIER_MUZZLE } from '../data/fx.js';
import { projectileFx } from './fxResolve.js';

function makeScene() {
  const created = [];
  const emitter = {
    config: null,
    explode: vi.fn(),
    emitParticleAt: vi.fn(),
    setDepth: vi.fn(function () { return this; }),
    stop: vi.fn(),
    startFollow: vi.fn(),
    destroy: vi.fn(),
  };
  const graphic = {
    lineStyle:    vi.fn(function () { return this; }),
    strokeCircle: vi.fn(function () { return this; }),
    setPosition:  vi.fn(function () { return this; }),
    setDepth:     vi.fn(function () { return this; }),
    destroy:      vi.fn(),
  };
  return {
    _emitter: emitter,
    _created: created,
    _graphic: graphic,
    add: {
      particles: vi.fn((x, y, key, config) => {
        emitter.config = config;
        created.push({ x, y, key, config });
        return emitter;
      }),
      graphics: vi.fn(() => graphic),
    },
    tweens: { add: vi.fn() },
    time:   { delayedCall: vi.fn((ms, cb) => cb()) },
  };
}

describe('ParticleSpawner', () => {
  describe('shared emitters', () => {
    it('spawnMuzzleFlash explodes the shared emitter for the resolved muzzle at the tower', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      const def = MUZZLE_FX[projectileFx('cannon', 1, null).muzzle];
      sp.spawnMuzzleFlash(120, 80, 'cannon', 1, null);
      expect(scene._created).toHaveLength(1);
      expect(scene._created[0].key).toBe(def.texture);
      expect(scene._created[0].config.emitting).toBe(false);
      expect(scene._created[0].config.tint).toBe(def.tint);
      expect(scene._emitter.explode).toHaveBeenCalledWith(def.quantity, 120, 80);
    });

    it('spawnMuzzleFlash accepts the soldier muzzle key', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      sp.spawnMuzzleFlash(5, 6, SOLDIER_MUZZLE);
      expect(scene._emitter.explode).toHaveBeenCalledWith(MUZZLE_FX[SOLDIER_MUZZLE].quantity, 5, 6);
    });

    it('reuses one emitter per effect: no growth in add.particles after warm-up', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      const proj = { x: 0, y: 0, art: { y: 0 }, fx: { trail: 'smoke' }, _trailAcc: 0 };
      const warm = () => {
        sp.spawnMuzzleFlash(1, 1, 'cannon', 1, null);
        sp.spawnImpact('spark', 1, 1);
        sp.emitTrail(proj, 1);
      };
      warm();
      const n = scene.add.particles.mock.calls.length;
      for (let i = 0; i < 20; i++) warm();
      expect(scene.add.particles.mock.calls.length).toBe(n);
    });

    it('spawnImpact explodes the configured quantity at the hit point', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      sp.spawnImpact('spark', 30, 40);
      expect(scene._emitter.explode).toHaveBeenCalledWith(IMPACT_FX.spark.quantity, 30, 40);
    });

    it('layered impacts (explosion) get one emitter per layer, all exploded', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      sp.spawnImpact('explosion', 7, 9);
      expect(scene._created).toHaveLength(IMPACT_FX.explosion.length);
      expect(scene._created.map(c => c.key)).toEqual(IMPACT_FX.explosion.map(l => l.texture));
      IMPACT_FX.explosion.forEach(l =>
        expect(scene._emitter.explode).toHaveBeenCalledWith(l.quantity, 7, 9));
    });

    it('spawnImpact ignores an unknown key', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      expect(() => sp.spawnImpact('nope', 0, 0)).not.toThrow();
      expect(scene.add.particles).not.toHaveBeenCalled();
    });

    it('emitTrail with trail none emits nothing and creates no emitter', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      sp.emitTrail({ x: 0, y: 0, art: { y: 0 }, fx: { trail: 'none' }, _trailAcc: 0 }, 1);
      expect(scene.add.particles).not.toHaveBeenCalled();
      expect(scene._emitter.emitParticleAt).not.toHaveBeenCalled();
    });

    it('emitTrail emits at the drawn (lifted) position, accumulating dt by rate', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      const rate = TRAIL_FX.smoke.rate;
      const proj = { x: 100, y: 200, art: { y: -20 }, fx: { trail: 'smoke' }, _trailAcc: 0 };
      sp.emitTrail(proj, 1.5 / rate); // 1.5 particles worth: emit 1, carry 0.5
      expect(scene._emitter.emitParticleAt).toHaveBeenCalledWith(100, 180, 1);
      expect(proj._trailAcc).toBeCloseTo(0.5);
      scene._emitter.emitParticleAt.mockClear();
      sp.emitTrail(proj, 0.2 / rate); // 0.7 total: nothing yet
      expect(scene._emitter.emitParticleAt).not.toHaveBeenCalled();
    });

    it('destroy destroys every shared emitter once', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      sp.spawnImpact('explosion', 0, 0);
      sp.spawnMuzzleFlash(0, 0, 'archer', 1, null);
      sp.destroy();
      expect(scene._emitter.destroy).toHaveBeenCalledTimes(3);
      sp.destroy();
      expect(scene._emitter.destroy).toHaveBeenCalledTimes(3);
    });
  });

  it('spawnHeroAbilityVFX dispatches by ability name', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    sp.spawnHeroAbilityVFX('airstrike', 50, 50, 60);
    sp.spawnHeroAbilityVFX('emp',       50, 50, 80);
    sp.spawnHeroAbilityVFX('overcharge', 50, 50, 0);
    expect(scene.add.particles).toHaveBeenCalledTimes(3);
  });

  it('airstrike VFX also spawns an expanding 60px orange ring', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    sp.spawnHeroAbilityVFX('airstrike', 50, 50, 60);
    expect(scene.add.graphics).toHaveBeenCalledTimes(1);
    expect(scene._graphic.lineStyle).toHaveBeenCalledWith(3, 0xff6633, 1);
    const tween = scene.tweens.add.mock.calls[0][0];
    expect(tween.scale).toEqual({ from: 0, to: 60 });
    expect(tween.duration).toBe(400);
  });

  it('emp VFX also spawns an expanding blue ring sized to the passed radius', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    sp.spawnHeroAbilityVFX('emp', 30, 30, 100);
    expect(scene.add.graphics).toHaveBeenCalledTimes(1);
    expect(scene._graphic.lineStyle).toHaveBeenCalledWith(3, 0x66ccff, 1);
    const tween = scene.tweens.add.mock.calls[0][0];
    expect(tween.scale).toEqual({ from: 0, to: 100 });
    expect(tween.duration).toBe(600);
  });

  it('overcharge VFX does NOT spawn a ring graphic', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    sp.spawnHeroAbilityVFX('overcharge', 50, 50, 0);
    expect(scene.add.graphics).not.toHaveBeenCalled();
  });
});
