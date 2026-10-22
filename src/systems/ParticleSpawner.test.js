import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Geom: { Circle: class { constructor(x, y, r) { this.x = x; this.y = y; this.r = r; } } } } }));

import { ParticleSpawner, TINT_AT_SPAWN } from './ParticleSpawner.js';
import { TRAIL_FX, MUZZLE_FX, IMPACT_FX, SOLDIER_MUZZLE, STATUS_FX, STATUS_EMIT_FX, DEATH_FX, PROJECTILE_FX } from '../data/fx.js';
import { projectileFx } from './fxResolve.js';

function makeScene() {
  const created = [];
  const emitter = {
    config: null,
    explode: vi.fn(),
    emitParticleAt: vi.fn(),
    setParticleTint: vi.fn(),
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
      const proj = { x: 0, y: 0, drawnY: 0, fx: { trail: 'smoke' }, _trailAcc: 0 };
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
      sp.emitTrail({ x: 0, y: 0, drawnY: 0, fx: { trail: 'none' }, _trailAcc: 0 }, 1);
      expect(scene.add.particles).not.toHaveBeenCalled();
      expect(scene._emitter.emitParticleAt).not.toHaveBeenCalled();
    });

    it('emitTrail emits at the drawn (lifted) position, accumulating dt by rate', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      const rate = TRAIL_FX.smoke.rate;
      const proj = { x: 100, y: 200, drawnY: 180, fx: { trail: 'smoke' }, _trailAcc: 0 };
      sp.emitTrail(proj, 1.5 / rate); // 1.5 particles worth: emit 1, carry 0.5
      expect(scene._emitter.emitParticleAt).toHaveBeenCalledWith(100, 180, 1);
      expect(proj._trailAcc).toBeCloseTo(0.5);
      scene._emitter.emitParticleAt.mockClear();
      sp.emitTrail(proj, 0.2 / rate); // 0.7 total: nothing yet
      expect(scene._emitter.emitParticleAt).not.toHaveBeenCalled();
    });

    it('emitStatus burn accumulates dt by emberRate and emits at the enemy', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      const rate = STATUS_FX.burn.emberRate;
      const enemy = { x: 50, y: 60, _statusAcc: 0, _artHalfWidth: 0 };
      sp.emitStatus('burn', enemy, 1.5 / rate);
      expect(scene._emitter.emitParticleAt).toHaveBeenCalledWith(50, 60, 1);
      expect(enemy._statusAcc).toBeCloseTo(0.5);
      scene._emitter.emitParticleAt.mockClear();
      sp.emitStatus('burn', enemy, 0.2 / rate);
      expect(scene._emitter.emitParticleAt).not.toHaveBeenCalled();
    });

    it('emitStatus spreads embers across the art width', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      const enemy = { x: 100, y: 60, _statusAcc: 1, _artHalfWidth: 40 };
      const rnd = vi.spyOn(Math, 'random');
      rnd.mockReturnValue(0);
      sp.emitStatus('burn', enemy, 0);
      rnd.mockReturnValue(1);
      enemy._statusAcc = 1;
      sp.emitStatus('burn', enemy, 0);
      rnd.mockRestore();
      const reach = 40 * STATUS_EMIT_FX.burn.spread;
      expect(scene._emitter.emitParticleAt).toHaveBeenNthCalledWith(1, 100 - reach, 60, 1);
      expect(scene._emitter.emitParticleAt).toHaveBeenNthCalledWith(2, 100 + reach, 60, 1);
    });

    it('emitStatus shares one emitter across enemies and unknown kinds emit nothing', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      sp.emitStatus('burn', { x: 0, y: 0, _statusAcc: 1, _artHalfWidth: 0 }, 0);
      sp.emitStatus('burn', { x: 5, y: 5, _statusAcc: 1, _artHalfWidth: 0 }, 0);
      expect(scene.add.particles).toHaveBeenCalledTimes(1);
      sp.emitStatus('nope', { x: 0, y: 0, _statusAcc: 1, _artHalfWidth: 0 }, 1);
      expect(scene.add.particles).toHaveBeenCalledTimes(1);
    });

    it('burn embers rise and forward gravityY to the emitter config', () => {
      const scene = makeScene();
      const sp = new ParticleSpawner(scene);
      sp.emitStatus('burn', { x: 0, y: 0, _statusAcc: 1, _artHalfWidth: 0 }, 0);
      expect(STATUS_EMIT_FX.burn.gravityY).toBeLessThan(0);
      expect(scene._created[0].config.gravityY).toBe(STATUS_EMIT_FX.burn.gravityY);
      expect(scene._created[0].key).toBe('fx-ember');
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

  describe('spawnDeath', () => {
    const layerCount = (key) => (Array.isArray(IMPACT_FX[key]) ? IMPACT_FX[key].length : 1);

    it('plays every immediate step now and schedules each delayed step exactly once', () => {
      for (const cls of Object.keys(DEATH_FX)) {
        const scene = makeScene();
        const calls = [];
        scene.time.delayedCall = vi.fn((ms, cb) => calls.push({ ms, cb }));
        const sp = new ParticleSpawner(scene);
        sp.spawnDeath(cls, 10, 20, 0xff0000);

        const immediate = DEATH_FX[cls].filter((s) => s.delay === 0);
        const delayed = DEATH_FX[cls].filter((s) => s.delay > 0);
        const explodesNow = immediate.reduce((n, s) => n + layerCount(s.effect), 0);
        expect(scene._emitter.explode).toHaveBeenCalledTimes(explodesNow);
        expect(calls.map((c) => c.ms)).toEqual(delayed.map((s) => s.delay));

        calls.forEach((c) => c.cb());
        const all = DEATH_FX[cls].reduce((n, s) => n + layerCount(s.effect), 0);
        expect(scene._emitter.explode).toHaveBeenCalledTimes(all);
      }
    });

    it('explodes at the death position', () => {
      const scene = makeScene();
      new ParticleSpawner(scene).spawnDeath('small', 33, 44, 0x00ff00);
      expect(scene._emitter.explode).toHaveBeenCalledWith(IMPACT_FX.pop.quantity, 33, 44);
    });

    it('tints the pop with the enemy colour before exploding', () => {
      const scene = makeScene();
      new ParticleSpawner(scene).spawnDeath('small', 1, 2, 0x12ab34);
      expect(scene._emitter.setParticleTint).toHaveBeenCalledWith(0x12ab34);
      expect(scene._emitter.setParticleTint.mock.invocationCallOrder[0])
        .toBeLessThan(scene._emitter.explode.mock.invocationCallOrder[0]);
    });

    it('tints the large and boss deathBurst with the enemy colour', () => {
      for (const cls of ['large', 'boss']) {
        const scene = makeScene();
        scene.time.delayedCall = vi.fn((ms, cb) => cb());
        new ParticleSpawner(scene).spawnDeath(cls, 1, 2, 0x12ab34);
        expect(scene._emitter.setParticleTint, cls).toHaveBeenCalledWith(0x12ab34);
      }
    });

    it('never tints an effect that a projectile impact also uses (shared emitter)', () => {
      const impacts = new Set();
      for (const fx of Object.values(PROJECTILE_FX)) {
        impacts.add(fx.impact);
        for (const b of Object.values(fx.branches ?? {})) if (b.impact) impacts.add(b.impact);
      }
      for (const key of TINT_AT_SPAWN) expect(impacts.has(key), key).toBe(false);
    });

    it('large/boss deaths use deathBurst, not the mage burst', () => {
      for (const cls of ['large', 'boss']) {
        const effects = DEATH_FX[cls].map((s) => s.effect);
        expect(effects, cls).toContain('deathBurst');
        expect(effects, cls).not.toContain('burst');
      }
    });

    it('does nothing for an unknown class', () => {
      const scene = makeScene();
      new ParticleSpawner(scene).spawnDeath('nope', 1, 2, 0);
      expect(scene._emitter.explode).not.toHaveBeenCalled();
    });
  });
});
