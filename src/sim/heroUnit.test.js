// The modelled hero's own health clock: melee damage, death, respawn and
// out-of-combat regen. These mirror Hero.js (takeDamage / respawn / update) so
// the balance model and the live game agree on how long a hero survives melee.
import { describe, it, expect } from 'vitest';
import { makeHeroUnit, damageHeroUnit, tickHeroUnit } from './heroUnit.js';
import { HEROES, HERO_REGEN_DELAY, HERO_REGEN_RATE } from '../data/heroes.js';

const rael = HEROES.rael;
const unit = () => makeHeroUnit(rael, { x: 100, y: 100 });
const origin = { x: 0, y: 0 };

describe('makeHeroUnit', () => {
  it('starts at full hp, alive, and already out of combat', () => {
    const h = unit();
    expect(h.hp).toBe(rael.stats.maxHp);
    expect(h.maxHp).toBe(rael.stats.maxHp);
    expect(h.dead).toBe(false);
    // Hero.js: a hero that has never been hit counts as already out of combat.
    expect(h.timeSinceDamage).toBe(HERO_REGEN_DELAY);
  });

  it('is shaped for heroBlocksEnemy — x, y and dead', () => {
    const h = unit();
    expect(h.x).toBe(100);
    expect(h.y).toBe(100);
    expect(h.dead).toBe(false);
  });
});

describe('damageHeroUnit', () => {
  it('subtracts hp and resets the out-of-combat clock', () => {
    const h = unit();
    damageHeroUnit(h, 30);
    expect(h.hp).toBe(rael.stats.maxHp - 30);
    expect(h.timeSinceDamage).toBe(0);
  });

  it('reports the blow that kills and starts the respawn timer', () => {
    const h = unit();
    expect(damageHeroUnit(h, rael.stats.maxHp - 1)).toBe(false);
    expect(damageHeroUnit(h, 5)).toBe(true);
    expect(h.hp).toBe(0);
    expect(h.dead).toBe(true);
    expect(h.respawnTimer).toBe(rael.stats.respawnTime);
  });

  it('ignores further blows once dead, so one death is one death', () => {
    const h = unit();
    damageHeroUnit(h, rael.stats.maxHp);
    expect(damageHeroUnit(h, 999)).toBe(false);
    expect(h.respawnTimer).toBe(rael.stats.respawnTime);
  });
});

describe('tickHeroUnit — out-of-combat regen', () => {
  it('does not regen until HERO_REGEN_DELAY has elapsed since the last hit', () => {
    const h = unit();
    damageHeroUnit(h, 50);
    const hurt = h.hp;
    for (let t = 0; t < HERO_REGEN_DELAY - 0.5; t += 0.5) tickHeroUnit(h, 0.5, origin);
    expect(h.hp).toBe(hurt);
  });

  it('heals HERO_REGEN_RATE hp per second once the delay has passed', () => {
    const h = unit();
    damageHeroUnit(h, 50);
    for (let t = 0; t < HERO_REGEN_DELAY; t += 0.5) tickHeroUnit(h, 0.5, origin);
    const atDelay = h.hp;
    for (let t = 0; t < 2; t += 0.5) tickHeroUnit(h, 0.5, origin);
    expect(h.hp).toBeCloseTo(atDelay + HERO_REGEN_RATE * 2, 5);
  });

  it('never regens past maxHp', () => {
    const h = unit();
    damageHeroUnit(h, 5);
    for (let t = 0; t < 60; t += 0.5) tickHeroUnit(h, 0.5, origin);
    expect(h.hp).toBe(h.maxHp);
  });

  it('does not regen while dead', () => {
    const h = unit();
    damageHeroUnit(h, rael.stats.maxHp);
    tickHeroUnit(h, 0.5, origin);
    expect(h.hp).toBe(0);
  });
});

describe('tickHeroUnit — death and respawn', () => {
  it('stays out for the whole respawnTime', () => {
    const h = unit();
    damageHeroUnit(h, rael.stats.maxHp);
    for (let t = 0; t < rael.stats.respawnTime - 0.5; t += 0.5) {
      expect(tickHeroUnit(h, 0.5, origin)).toBe(false);
    }
    expect(h.dead).toBe(true);
  });

  it('returns at full hp, at path progress 0, out of combat', () => {
    const h = unit();
    damageHeroUnit(h, rael.stats.maxHp);
    let cameBack = false;
    // Stop on the comeback tick: every tick after it advances the out-of-combat
    // clock past HERO_REGEN_DELAY again, which is Hero.update's behaviour too.
    for (let t = 0; t < rael.stats.respawnTime + 1 && !cameBack; t += 0.5) {
      cameBack = tickHeroUnit(h, 0.5, origin);
    }
    expect(cameBack).toBe(true);
    expect(h.dead).toBe(false);
    expect(h.hp).toBe(h.maxHp);
    expect(h.respawnTimer).toBe(0);
    expect(h.timeSinceDamage).toBe(HERO_REGEN_DELAY);
    expect({ x: h.x, y: h.y }).toEqual(origin);
  });

  it('reports the comeback on exactly one tick', () => {
    const h = unit();
    damageHeroUnit(h, rael.stats.maxHp);
    let comebacks = 0;
    for (let t = 0; t < rael.stats.respawnTime + 5; t += 0.5) {
      if (tickHeroUnit(h, 0.5, origin)) comebacks++;
    }
    expect(comebacks).toBe(1);
  });
});
