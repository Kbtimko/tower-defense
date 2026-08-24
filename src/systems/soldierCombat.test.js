import { describe, it, expect } from 'vitest';
import {
  MELEE_RANGE, ENEMY_MELEE_DAMAGE, SOLDIER_ATTACK_RATE,
  findBlockingSoldier, damageSoldier, tickSoldier,
  soldierMaxHp, soldierRespawnDuration,
} from './soldierCombat.js';
import { ENEMY_MELEE_DAMAGE as MELEE_DAMAGE_FROM_DATA } from '../data/enemies.js';

const soldier = (over = {}) => ({
  x: 0, y: 0, hp: 40, maxHp: 40, damage: 20,
  respawnDuration: 3, canBlockFlyers: false,
  attackTimer: 0, respawnTimer: 0, dead: false, ...over,
});
const ground = (x, y) => ({ x, y, def: { flying: false } });
const flyer  = (x, y) => ({ x, y, def: { flying: true } });

describe('findBlockingSoldier', () => {
  it('blocks a ground enemy inside melee range', () => {
    const s = soldier();
    expect(findBlockingSoldier(ground(MELEE_RANGE - 1, 0), [s])).toBe(s);
  });

  it('does not block at or beyond melee range', () => {
    expect(findBlockingSoldier(ground(MELEE_RANGE, 0), [soldier()])).toBeNull();
  });

  it('ignores dead soldiers', () => {
    expect(findBlockingSoldier(ground(0, 0), [soldier({ dead: true })])).toBeNull();
  });

  it('lets flyers past ground soldiers', () => {
    expect(findBlockingSoldier(flyer(0, 0), [soldier()])).toBeNull();
  });

  it('blocks flyers when the soldier can block them (Vanguard)', () => {
    const s = soldier({ canBlockFlyers: true });
    expect(findBlockingSoldier(flyer(0, 0), [s])).toBe(s);
  });

  it('returns the first eligible soldier, so stacked spares queue up', () => {
    const dead = soldier({ dead: true });
    const first = soldier();
    const second = soldier();
    expect(findBlockingSoldier(ground(0, 0), [dead, first, second])).toBe(first);
  });

  it('returns null for an empty roster', () => {
    expect(findBlockingSoldier(ground(0, 0), [])).toBeNull();
  });
});

describe('damageSoldier', () => {
  it('subtracts hp without killing while hp remains', () => {
    const s = soldier();
    expect(damageSoldier(s, 10)).toBe(false);
    expect(s.hp).toBe(30);
    expect(s.dead).toBe(false);
  });

  it('kills at exactly zero hp and arms the respawn timer', () => {
    const s = soldier();
    expect(damageSoldier(s, 40)).toBe(true);
    expect(s.dead).toBe(true);
    expect(s.respawnTimer).toBe(s.respawnDuration);
  });

  it('is a no-op on an already-dead soldier', () => {
    const s = soldier({ dead: true, hp: 0, respawnTimer: 1 });
    expect(damageSoldier(s, 999)).toBe(false);
    expect(s.respawnTimer).toBe(1);
  });
});

describe('tickSoldier', () => {
  it('winds down the attack cooldown', () => {
    const s = soldier({ attackTimer: 1 });
    tickSoldier(s, 0.25);
    expect(s.attackTimer).toBeCloseTo(0.75);
  });

  it('keeps a dead soldier dead until the respawn duration elapses', () => {
    const s = soldier();
    damageSoldier(s, 999);
    tickSoldier(s, 2.9);
    expect(s.dead).toBe(true);
  });

  it('respawns at full hp once the timer runs out', () => {
    const s = soldier();
    damageSoldier(s, 999);
    expect(tickSoldier(s, 3)).toBe(true);
    expect(s.dead).toBe(false);
    expect(s.hp).toBe(s.maxHp);
    expect(s.respawnTimer).toBe(0);
  });
});

describe('stat derivation', () => {
  const stats = { hp: 15, damage: 20, respawnDuration: 3, canBlockFlyers: false };

  it('applies the meta max-hp bonus', () => {
    expect(soldierMaxHp(stats)).toBe(15);
    expect(soldierMaxHp(stats, { soldierMaxHpBonus: 10 })).toBe(25);
  });

  it('applies the meta respawn multiplier', () => {
    expect(soldierRespawnDuration(stats)).toBe(3);
    expect(soldierRespawnDuration(stats, { soldierRespawnMult: 0.5 })).toBe(1.5);
  });
});

describe('shared melee constants', () => {
  it('exposes the mechanics both the game and the simulator trade on', () => {
    expect(MELEE_RANGE).toBe(30);
    expect(SOLDIER_ATTACK_RATE).toBe(1);
  });

  it('re-exports melee damage from the data layer rather than owning a copy', () => {
    // Balance dials live in src/data; a second copy here is how the game and
    // the model drift apart. Asserted by identity, not by value, so retuning
    // the number does not break this test.
    expect(ENEMY_MELEE_DAMAGE).toBe(MELEE_DAMAGE_FROM_DATA);
  });
});
