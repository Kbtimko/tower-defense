import { describe, it, expect } from 'vitest';
import { UPGRADES } from './upgrades.js';
import { HERO_ORDER } from './heroes.js';

describe('UPGRADES — per-hero branches', () => {
  it('has exactly 25 nodes', () => {
    expect(UPGRADES.length).toBe(25);
  });

  it('every hero has a 4-node branch (hp, rapid_redeploy, veteran, elite)', () => {
    for (const heroId of HERO_ORDER) {
      const branch = UPGRADES.filter(n => n.branch === heroId);
      expect(branch.length).toBe(4);
      expect(branch.map(n => n.id).sort()).toEqual([
        `${heroId}_elite`, `${heroId}_hp`, `${heroId}_rapid_redeploy`, `${heroId}_veteran`,
      ]);
    }
  });

  it('every non-rael hero node has heroUnlock matching its branch', () => {
    for (const heroId of ['engineer','scout','pyro']) {
      for (const n of UPGRADES.filter(u => u.branch === heroId)) {
        expect(n.heroUnlock).toBe(heroId);
      }
    }
  });

  it('rael nodes have no heroUnlock (available from start)', () => {
    for (const n of UPGRADES.filter(u => u.branch === 'rael')) {
      expect(n.heroUnlock).toBeUndefined();
    }
  });

  it('every prereq points at a real node', () => {
    const ids = new Set(UPGRADES.map(u => u.id));
    for (const n of UPGRADES) {
      if (n.requires) expect(ids.has(n.requires)).toBe(true);
    }
  });
});
