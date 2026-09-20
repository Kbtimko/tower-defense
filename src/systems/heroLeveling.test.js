import { describe, it, expect } from 'vitest';
import {
  heroXpThresholds, heroLevelForDamage, heroLevelMult, heroAttackDamage, heroMaxHp,
} from './heroLeveling.js';
import { HERO_LEVEL_DAMAGE_FRACTIONS, HERO_LEVEL_STAT_STEP, HEROES } from '../data/heroes.js';

const stats = { maxHp: 150, attackDamage: 18, maxLevel: 5 };
const TOTAL = 10000;

describe('heroXpThresholds', () => {
  it('turns the data fractions into absolute damage for this map', () => {
    expect(heroXpThresholds(TOTAL))
      .toEqual(HERO_LEVEL_DAMAGE_FRACTIONS.map(f => f * TOTAL));
  });

  it('gives one threshold per level above the first', () => {
    expect(heroXpThresholds(TOTAL)).toHaveLength(4);
  });

  it('is strictly increasing, so a level is never skipped by ordering', () => {
    const t = heroXpThresholds(TOTAL);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
  });
});

describe('heroLevelForDamage', () => {
  const at = (dmg, over = {}) => heroLevelForDamage(dmg, TOTAL, { maxLevel: 5, ...over });

  it('starts at level 1 with no damage dealt', () => {
    expect(at(0)).toBe(1);
  });

  it('levels exactly ON the threshold, not one point past it', () => {
    const [t2] = heroXpThresholds(TOTAL);
    expect(at(t2 - 1)).toBe(1);
    expect(at(t2)).toBe(2);
  });

  it('reaches every level as damage crosses each threshold', () => {
    const t = heroXpThresholds(TOTAL);
    expect(t.map(x => at(x))).toEqual([2, 3, 4, 5]);
  });

  it('caps at maxLevel however much damage is dealt', () => {
    expect(at(TOTAL * 100)).toBe(5);
  });

  it('honours a lower maxLevel', () => {
    expect(at(TOTAL * 100, { maxLevel: 3 })).toBe(3);
  });

  it('never drops below startLevel — veteran/elite heroes keep their head start', () => {
    // heroStartLevel 3 (Elite Commander): a hero that has dealt no damage yet
    // must still be level 3, not demoted to 1 by the damage curve.
    expect(at(0, { startLevel: 3 })).toBe(3);
    expect(at(heroXpThresholds(TOTAL)[0], { startLevel: 3 })).toBe(3);
  });

  it('lets a head-started hero keep levelling past its start level', () => {
    expect(at(heroXpThresholds(TOTAL)[3], { startLevel: 3 })).toBe(5);
  });

  it('falls back to level 1 (or startLevel) when the map has no HP budget', () => {
    // totalEnemyHpForMap returns 0 for an unknown map; thresholds would all be
    // 0 and every hero would instantly cap. Guard it rather than jump to 5.
    expect(heroLevelForDamage(500, 0, { maxLevel: 5 })).toBe(1);
    expect(heroLevelForDamage(500, 0, { maxLevel: 5, startLevel: 2 })).toBe(2);
  });
});

describe('heroLevelMult', () => {
  it('is 1.0 at level 1 — the base stats are the level-1 stats', () => {
    expect(heroLevelMult(1)).toBe(1);
  });

  it('adds a flat step per level rather than compounding', () => {
    expect(heroLevelMult(3)).toBeCloseTo(1 + 2 * HERO_LEVEL_STAT_STEP);
  });

  it('reaches exactly 1.8x at level 5, not the compounding 2.07x', () => {
    expect(heroLevelMult(5)).toBeCloseTo(1.8);
  });
});

describe('heroAttackDamage / heroMaxHp', () => {
  it('scales attack damage off the base stat', () => {
    expect(heroAttackDamage(stats, 1)).toBe(18);
    expect(heroAttackDamage(stats, 5)).toBeCloseTo(18 * 1.8);
  });

  it('scales max hp off the base stat', () => {
    expect(heroMaxHp(stats, 1)).toBe(150);
    expect(heroMaxHp(stats, 5)).toBeCloseTo(150 * 1.8);
  });

  it('adds heroMaxHpBonus AFTER the level multiplier, so the upgrade is flat', () => {
    // Documented decision (src/data/heroes.js): the meta upgrade is bought once
    // at a fixed price, so +50 HP means +50 at level 1 and at level 5.
    expect(heroMaxHp(stats, 5, { heroMaxHpBonus: 50 })).toBeCloseTo(150 * 1.8 + 50);
    expect(heroMaxHp(stats, 5, { heroMaxHpBonus: 50 }) - heroMaxHp(stats, 5))
      .toBe(heroMaxHp(stats, 1, { heroMaxHpBonus: 50 }) - heroMaxHp(stats, 1));
  });

  it('treats a missing modifiers object as no bonus', () => {
    expect(heroMaxHp(stats, 2)).toBe(heroMaxHp(stats, 2, {}));
  });
});

describe('every shipped hero levels to 5', () => {
  for (const [id, def] of Object.entries(HEROES)) {
    it(`${id} caps at level 5 with abilities still gated at 1/2/3`, () => {
      expect(def.stats.maxLevel).toBe(5);
      expect(def.stats.abilityUnlockLevels).toEqual({ q: 1, w: 2, e: 3 });
    });
  }
});
