import { describe, it, expect } from 'vitest';
import { towerFireSfxKey, enemyHitSfxKey } from './sfxKeys.js';

const BASE_KEYS = [
  'tower-fire-archer', 'tower-fire-cannon', 'tower-fire-mage',
  'tower-fire-ice', 'tower-fire-sniper', 'tower-fire-barracks',
  'enemy-hit',
];

describe('towerFireSfxKey', () => {
  it('returns the branch-specific key when it is registered', () => {
    const keys = [...BASE_KEYS, 'tower-fire-archer-A'];
    expect(towerFireSfxKey('archer', 'A', keys)).toBe('tower-fire-archer-A');
  });

  it('falls back to the base key when the specific key is not registered', () => {
    expect(towerFireSfxKey('archer', 'A', BASE_KEYS)).toBe('tower-fire-archer');
  });

  it('returns the base key when branch is null (no specific lookup)', () => {
    const keys = [...BASE_KEYS, 'tower-fire-archer-A'];
    expect(towerFireSfxKey('archer', null, keys)).toBe('tower-fire-archer');
  });

  it('returns the base key when registeredKeys is empty', () => {
    expect(towerFireSfxKey('sniper', 'B', [])).toBe('tower-fire-sniper');
  });
});

describe('enemyHitSfxKey', () => {
  it('returns the type-specific key when it is registered', () => {
    const keys = [...BASE_KEYS, 'enemy-hit-brute'];
    expect(enemyHitSfxKey('brute', keys)).toBe('enemy-hit-brute');
  });

  it('falls back to the generic enemy-hit when the specific key is not registered', () => {
    expect(enemyHitSfxKey('brute', BASE_KEYS)).toBe('enemy-hit');
  });

  it('returns the generic key when registeredKeys is empty', () => {
    expect(enemyHitSfxKey('drone', [])).toBe('enemy-hit');
  });
});

describe('key naming patterns (future-asset contract)', () => {
  const TOWER_TYPES = ['archer', 'mage', 'cannon', 'ice', 'sniper'];
  const BRANCHES = ['A', 'B'];
  const ENEMY_TYPES = ['drone', 'skitter', 'brute', 'colossus', 'phantom', 'titan'];

  it('derives 10 tower-branch keys in tower-fire-<type>-<branch> form', () => {
    const derived = [];
    for (const t of TOWER_TYPES) {
      for (const b of BRANCHES) {
        const keys = [`tower-fire-${t}-${b}`];
        derived.push(towerFireSfxKey(t, b, keys));
      }
    }
    expect(derived).toEqual([
      'tower-fire-archer-A', 'tower-fire-archer-B',
      'tower-fire-mage-A', 'tower-fire-mage-B',
      'tower-fire-cannon-A', 'tower-fire-cannon-B',
      'tower-fire-ice-A', 'tower-fire-ice-B',
      'tower-fire-sniper-A', 'tower-fire-sniper-B',
    ]);
  });

  it('derives 6 enemy-hit keys in enemy-hit-<type> form', () => {
    const derived = ENEMY_TYPES.map((t) => enemyHitSfxKey(t, [`enemy-hit-${t}`]));
    expect(derived).toEqual([
      'enemy-hit-drone', 'enemy-hit-skitter', 'enemy-hit-brute',
      'enemy-hit-colossus', 'enemy-hit-phantom', 'enemy-hit-titan',
    ]);
  });
});
