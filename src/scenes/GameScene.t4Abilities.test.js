vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
      },
    },
  },
}));

vi.mock('../entities/Projectile.js', () => ({
  Projectile: class { constructor(scene, opts) { Object.assign(this, opts); } },
}));

import { describe, it, expect, vi } from 'vitest';
import GameScene from './GameScene.js';
import { TOWER_SLOW_DURATION } from '../data/towers.js';

const makeTower = (extra = {}) => ({
  type: 'archer', branch: null, x: 100, y: 100, range: 300, damage: 10, fireRate: 2,
  updatePop: () => {}, cooldown: 0, level: 4, splashRadius: 0, pierce: 0, slow: 0,
  muzzlePoint: () => ({ x: 100, y: 100 }),
  _sprite: { setFacing: vi.fn(), setState: vi.fn() },
  ...extra,
});
const makeEnemy = (x, y, { hp = 1000, waypointIndex = 1, type = 'drone', slowed = false } = {}) => {
  const e = {
    x, y, waypointIndex, hp, dead: false, reward: 1,
    def: { type, color: 0xffffff, radius: 10 },
    statusEffects: { slow: { active: slowed } },
    applyStatus: vi.fn(),
  };
  e.takeDamage = vi.fn((amt) => { e.hp -= amt; if (e.hp <= 0) e.dead = true; });
  return e;
};

const makeFireCtx = (towers, enemies, playSfx = vi.fn()) => ({
  placementManager: { getTowers: () => towers },
  enemies,
  projectiles: [],
  _projectilePool: { acquire: opts => ({ ...opts }) },
  particleSpawner: null,
  game: { registry: { get: () => ({ playSfx }) } },
});

const makeHitCtx = (enemies) => ({
  enemies, bolts: [], particles: [], kills: 0,
  particleSpawner: { spawnImpact: vi.fn() },
  economy: { earn: vi.fn() },
  _killReward: r => r,
  _updateHUD: () => {},
  _addParticle: vi.fn(),
  _dealDamage(...a) { return GameScene.prototype._dealDamage.apply(this, a); },
});
const makeProj = (target, extra = {}) => ({
  target, targetX: target.x, targetY: target.y, damage: 100, splashRadius: 0,
  pierce: 0, slowFactor: 0, towerType: 'archer', tier: 4, branch: null, color: 0xff0000,
  fx: { impact: 'x' }, slowDuration: TOWER_SLOW_DURATION, ...extra,
});

describe('GameScene tier-4 firing', () => {
  it('Volley fires two projectiles per trigger at distinct targets', () => {
    const best = makeEnemy(150, 100, { waypointIndex: 5 });
    const other = makeEnemy(160, 100, { waypointIndex: 2 });
    const tower = makeTower({ shots: 2 });
    const playSfx = vi.fn();
    const ctx = makeFireCtx([tower], [other, best], playSfx);
    GameScene.prototype._updateTowers.call(ctx, 0.016);
    expect(ctx.projectiles).toHaveLength(2);
    expect(ctx.projectiles.map(p => p.target)).toEqual([best, other]);
    expect(ctx.projectiles.every(p => p.damage === 10)).toBe(true);
    expect(playSfx).toHaveBeenCalledOnce();
    expect(tower.cooldown).toBe(1 / 2);
  });

  it('Volley with one enemy fires two projectiles at it, one cooldown', () => {
    const only = makeEnemy(150, 100);
    const tower = makeTower({ shots: 2 });
    const ctx = makeFireCtx([tower], [only]);
    GameScene.prototype._updateTowers.call(ctx, 0.016);
    expect(ctx.projectiles.map(p => p.target)).toEqual([only, only]);
    expect(tower.cooldown).toBe(1 / 2);
  });

  it('a non-Volley tower still fires exactly one projectile', () => {
    const ctx = makeFireCtx([makeTower()], [makeEnemy(150, 100), makeEnemy(160, 100)]);
    GameScene.prototype._updateTowers.call(ctx, 0.016);
    expect(ctx.projectiles).toHaveLength(1);
  });

  it('copies tier-4 fields onto the projectile', () => {
    const chain = { targets: 3, jumpRadius: 90, falloff: 0.75 };
    const ctx = makeFireCtx([makeTower({ chain, slowedMult: 2, bossStun: 1 })], [makeEnemy(150, 100)]);
    GameScene.prototype._updateTowers.call(ctx, 0.016);
    const p = ctx.projectiles[0];
    expect(p.chain).toBe(chain);
    expect(p.slowedMult).toBe(2);
    expect(p.bossStun).toBe(1);
    expect(p.slowDuration).toBe(TOWER_SLOW_DURATION);
  });
});

describe('GameScene._onProjectileHit tier-4', () => {
  it('Frost splash slows every survivor, not the killed', () => {
    const a = makeEnemy(100, 100, { hp: 1000 });
    const b = makeEnemy(105, 100, { hp: 1 });
    const ctx = makeHitCtx([a, b]);
    GameScene.prototype._onProjectileHit.call(ctx, makeProj(a, { splashRadius: 50, slowFactor: 0.7 }));
    expect(a.applyStatus).toHaveBeenCalledWith({ type: 'slow', duration: TOWER_SLOW_DURATION, factor: 0.7 });
    expect(b.applyStatus).not.toHaveBeenCalled();
  });

  it('Shatter passes hitMult 2 to an already-slowed enemy', () => {
    const a = makeEnemy(100, 100, { slowed: true });
    const ctx = makeHitCtx([a]);
    GameScene.prototype._onProjectileHit.call(ctx, makeProj(a, { slowedMult: 2 }));
    expect(a.takeDamage.mock.calls[0][1]).toMatchObject({ hitMult: 2 });
  });

  it('Archmage chain damages three and pushes two bolts', () => {
    const a = makeEnemy(100, 100), b = makeEnemy(150, 100), c = makeEnemy(200, 100);
    const ctx = makeHitCtx([a, b, c]);
    const chain = { targets: 3, jumpRadius: 90, falloff: 0.75 };
    GameScene.prototype._onProjectileHit.call(ctx, makeProj(a, { damage: 120, chain, towerType: 'mage' }));
    expect([a, b, c].map(e => e.takeDamage.mock.calls[0][0])).toEqual([120, 90, 67.5]);
    expect(ctx.bolts).toHaveLength(2);
    expect(ctx.bolts[0]).toMatchObject({ x1: 100, y1: 100, x2: 150, y2: 100, life: 0.15, maxLife: 0.15 });
  });

  it('chain falloff scales from the tower modified damage', () => {
    const a = makeEnemy(100, 100), b = makeEnemy(150, 100);
    const ctx = makeHitCtx([a, b]);
    const chain = { targets: 2, jumpRadius: 90, falloff: 0.75 };
    GameScene.prototype._onProjectileHit.call(ctx, makeProj(a, { damage: 132, chain }));
    expect(b.takeDamage.mock.calls[0][0]).toBe(99);
  });

  it('skips records for an enemy killed earlier in the same hit', () => {
    const a = makeEnemy(100, 100, { hp: 1 });
    const ctx = makeHitCtx([a]);
    const cluster = { shells: 3, spread: 0, damageFrac: 0.1, radius: 30 };
    GameScene.prototype._onProjectileHit.call(ctx, makeProj(a, { cluster }));
    expect(a.takeDamage).toHaveBeenCalledOnce();
    expect(ctx.kills).toBe(1);
  });

  it('Artillery spawns an impact at each cluster point', () => {
    const a = makeEnemy(100, 100);
    const ctx = makeHitCtx([a]);
    const cluster = { shells: 3, spread: 40, damageFrac: 0.1, radius: 30 };
    GameScene.prototype._onProjectileHit.call(ctx, makeProj(a, { cluster }));
    expect(ctx.particleSpawner.spawnImpact).toHaveBeenCalledTimes(4);
  });

  it('Assassin stuns a titan, not a drone', () => {
    const titan = makeEnemy(100, 100, { type: 'titan' });
    const drone = makeEnemy(100, 100, { type: 'drone' });
    const bossStun = 1.5;
    GameScene.prototype._onProjectileHit.call(makeHitCtx([titan]), makeProj(titan, { bossStun }));
    GameScene.prototype._onProjectileHit.call(makeHitCtx([drone]), makeProj(drone, { bossStun }));
    expect(titan.applyStatus).toHaveBeenCalledWith({ type: 'stun', duration: 1.5 });
    expect(drone.applyStatus).not.toHaveBeenCalled();
  });

  it('bolts fade out', () => {
    const ctx = { particles: [], bolts: [{ x1: 0, y1: 0, x2: 1, y2: 1, color: 1, life: 0.15, maxLife: 0.15 }] };
    GameScene.prototype._updateParticles.call(ctx, 0.2);
    expect(ctx.bolts).toEqual([]);
  });
});
