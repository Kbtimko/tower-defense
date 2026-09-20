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

import { describe, it, expect, vi } from 'vitest';

import GameScene from './GameScene.js';
import { ENEMY_MELEE_DAMAGE } from '../systems/soldierCombat.js';

const DT = 0.1;

const makeHero = (over = {}) => ({
  x: 0, y: 0, dead: false, takeDamage: vi.fn(), ...over,
});

// Walks at 100px/s along a straight path, so an unblocked enemy visibly moves.
const makeEnemy = (over = {}) => ({
  x: 0, y: 0, dead: false, waypointIndex: 0, currentSpeed: 100,
  def: { flying: false },
  statusEffects: { stun: { active: false } },
  takeDamage: vi.fn(),
  update() {},
  ...over,
});

const makeCtx = (hero, enemies, soldier = null) => ({
  hero,
  enemies: [].concat(enemies),
  pathMgr: { path: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
  _checkSoldierBlock: () => soldier,
  _dealDamage: vi.fn(),
});

describe('GameScene hero melee blocking', () => {
  it('halts a ground enemy inside melee range and charges the hero for holding it', () => {
    const hero = makeHero();
    const enemy = makeEnemy();
    GameScene.prototype._updateEnemies.call(makeCtx(hero, enemy), DT);
    expect(enemy.x).toBe(0);
    expect(hero.takeDamage).toHaveBeenCalledWith(ENEMY_MELEE_DAMAGE * DT);
  });

  it('does not strike the blocked enemy — Hero.update already auto-attacks it', () => {
    const hero = makeHero();
    const enemy = makeEnemy();
    const ctx = makeCtx(hero, enemy);
    GameScene.prototype._updateEnemies.call(ctx, DT);
    expect(enemy.takeDamage).not.toHaveBeenCalled();
    expect(ctx._dealDamage).not.toHaveBeenCalled();
  });

  it('lets a soldier already holding the enemy win, so the hero is not also hit', () => {
    const hero = makeHero();
    const enemy = makeEnemy();
    const soldier = {
      damage: 5, attackRate: 1, attackTimer: 1,
      barracks: { type: 'barracks', level: 1, branch: null },
      takeDamage: vi.fn(),
      _sprite: { setState: vi.fn() },
    };
    GameScene.prototype._updateEnemies.call(makeCtx(hero, enemy, soldier), DT);
    expect(soldier.takeDamage).toHaveBeenCalledWith(ENEMY_MELEE_DAMAGE * DT);
    expect(hero.takeDamage).not.toHaveBeenCalled();
  });

  it('lets flyers pass over the hero', () => {
    const hero = makeHero();
    const enemy = makeEnemy({ def: { flying: true } });
    GameScene.prototype._updateEnemies.call(makeCtx(hero, enemy), DT);
    expect(hero.takeDamage).not.toHaveBeenCalled();
    expect(enemy.x).toBeCloseTo(10, 5);
  });

  it('does not block while the hero is dead', () => {
    const hero = makeHero({ dead: true });
    const enemy = makeEnemy();
    GameScene.prototype._updateEnemies.call(makeCtx(hero, enemy), DT);
    expect(hero.takeDamage).not.toHaveBeenCalled();
    expect(enemy.x).toBeCloseTo(10, 5);
  });

  it('holds only the first enemy in range — the rest of the wave walks past', () => {
    // One hero body stops one enemy. Blocking every enemy that happens to be
    // inside MELEE_RANGE turns the hero into a wall the whole wave piles into.
    const hero = makeHero();
    const pack = [makeEnemy(), makeEnemy(), makeEnemy()];
    GameScene.prototype._updateEnemies.call(makeCtx(hero, pack), DT);
    expect(pack[0].x).toBe(0);
    expect(pack[1].x).toBeCloseTo(10, 5);
    expect(pack[2].x).toBeCloseTo(10, 5);
  });

  it('charges the hero for one enemy-second per tick, not one per enemy in range', () => {
    const hero = makeHero();
    const pack = [makeEnemy(), makeEnemy(), makeEnemy()];
    GameScene.prototype._updateEnemies.call(makeCtx(hero, pack), DT);
    expect(hero.takeDamage).toHaveBeenCalledTimes(1);
    expect(hero.takeDamage).toHaveBeenCalledWith(ENEMY_MELEE_DAMAGE * DT);
  });

  it('does not let a corpse awaiting sweep occupy the hold slot', () => {
    // Enemies killed by a tower after the last sweep are still in the list on
    // the next pass; one of them must not stand in for a live blocker.
    const hero = makeHero();
    const pack = [makeEnemy({ dead: true }), makeEnemy()];
    const ctx = makeCtx(hero, pack);
    // The end-of-pass sweep the corpse falls into needs its presentation hooks.
    ctx._fadeOutDeadEnemy = vi.fn();
    ctx._updateWaveButton = vi.fn();
    ctx._enemiesOnPath = 2;
    ctx.game = { registry: { get: () => null } };
    GameScene.prototype._updateEnemies.call(ctx, DT);
    expect(pack[1].x).toBe(0);
    expect(hero.takeDamage).toHaveBeenCalledTimes(1);
  });

  it('holds the next enemy along when a soldier already has the front one', () => {
    // Soldier blocking wins, but it consumes the enemy rather than the hero's
    // one slot: the hero is still free to hold someone else this tick.
    const hero = makeHero();
    const pack = [makeEnemy(), makeEnemy()];
    const soldier = {
      damage: 5, attackRate: 1, attackTimer: 1,
      barracks: { type: 'barracks', level: 1, branch: null },
      takeDamage: vi.fn(),
      _sprite: { setState: vi.fn() },
    };
    const ctx = makeCtx(hero, pack);
    ctx._checkSoldierBlock = enemy => (enemy === pack[0] ? soldier : null);
    GameScene.prototype._updateEnemies.call(ctx, DT);
    expect(pack[0].x).toBe(0);
    expect(pack[1].x).toBe(0);
    expect(hero.takeDamage).toHaveBeenCalledTimes(1);
  });
});
