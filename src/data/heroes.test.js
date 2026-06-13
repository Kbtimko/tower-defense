import { describe, it, expect } from 'vitest';
import { HEROES, HERO_ORDER } from './heroes.js';

const REQUIRED_KEYS = [
  'id', 'displayName', 'shortName', 'portraitChar',
  'bodyColor', 'strokeColor', 'unlockMapAfter', 'upgradeBranchId',
  'stats', 'abilities', 'draw', 'onHit', 'matchups',
];

const REQUIRED_STATS = [
  'maxHp', 'moveSpeed', 'attackRange', 'attackRate',
  'attackDamage', 'respawnTime', 'maxLevel', 'abilityUnlockLevels',
];

const REQUIRED_ABILITY_KEYS = ['id', 'label', 'icon', 'cooldown', 'aim', 'run', 'tooltip'];

describe('HEROES registry contract', () => {
  it('HERO_ORDER lists every hero in HEROES', () => {
    for (const id of HERO_ORDER) expect(HEROES[id]).toBeDefined();
    expect(Object.keys(HEROES).sort()).toEqual([...HERO_ORDER].sort());
  });

  for (const id of HERO_ORDER) {
    describe(`hero "${id}"`, () => {
      const def = HEROES[id];
      it('has all required keys', () => {
        for (const k of REQUIRED_KEYS) expect(def).toHaveProperty(k);
      });
      it('stats block has all required keys', () => {
        for (const k of REQUIRED_STATS) expect(def.stats).toHaveProperty(k);
        for (const slot of ['q','w','e']) {
          expect(def.stats.abilityUnlockLevels).toHaveProperty(slot);
        }
      });
      it('every ability slot (q/w/e) has all required keys', () => {
        for (const slot of ['q','w','e']) {
          const a = def.abilities[slot];
          for (const k of REQUIRED_ABILITY_KEYS) expect(a).toHaveProperty(k);
          expect(typeof a.run).toBe('function');
        }
      });
      it('unlockMapAfter is null or an integer in [0, 9]', () => {
        if (def.unlockMapAfter !== null) {
          expect(Number.isInteger(def.unlockMapAfter)).toBe(true);
          expect(def.unlockMapAfter).toBeGreaterThanOrEqual(0);
          expect(def.unlockMapAfter).toBeLessThanOrEqual(9);
        }
      });
      it('draw is a function', () => { expect(typeof def.draw).toBe('function'); });
      it('onHit is null or a function', () => {
        expect(def.onHit === null || typeof def.onHit === 'function').toBe(true);
      });
    });
  }
});

describe('HEROES role field', () => {
  it('each hero in HERO_ORDER has a non-empty role string', () => {
    for (const id of HERO_ORDER) {
      expect(typeof HEROES[id].role, `${id}.role`).toBe('string');
      expect(HEROES[id].role.length, `${id}.role length`).toBeGreaterThan(0);
    }
  });

  it('role values match the canonical strings from the spec', () => {
    expect(HEROES.rael.role).toBe('Generalist bruiser');
    expect(HEROES.engineer.role).toBe('Support / builder');
    expect(HEROES.scout.role).toBe('Ranged DPS / anti-air');
    expect(HEROES.pyro.role).toBe('AoE / burn');
  });
});
