import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Geom: { Circle: class { constructor(x, y, r) { this.x = x; this.y = y; this.r = r; } } } } }));

import { ParticleSpawner, MUZZLE_TINTS } from './ParticleSpawner.js';

function makeScene() {
  const created = [];
  const emitter = {
    config: null,
    explode: vi.fn(),
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
  it('spawnMuzzleFlash creates an emitter at tower position with type-correct tint', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    sp.spawnMuzzleFlash(120, 80, 'cannon');
    expect(scene.add.particles).toHaveBeenCalled();
    const call = scene._created[0];
    expect(call.x).toBe(120); expect(call.y).toBe(80);
    expect(call.config.tint).toBe(MUZZLE_TINTS.cannon);
  });

  it('spawnMuzzleFlash falls back to white for unknown tower types', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    sp.spawnMuzzleFlash(0, 0, 'unknown-type');
    expect(scene._created[0].config.tint).toBe(MUZZLE_TINTS.default);
  });

  it('spawnProjectileTrail starts an emitter following the projectile', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    const projectile = { x: 0, y: 0 };
    const trail = sp.spawnProjectileTrail(projectile, 'rocket');
    expect(scene._emitter.startFollow).toHaveBeenCalledWith(projectile);
    expect(trail).toBe(scene._emitter);
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
