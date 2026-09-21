import { describe, it, expect } from 'vitest';
import { describeEnemy, describeTower } from './entityDescriptors.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';

describe('describeEnemy', () => {
  it('carries the stat block for a known enemy', () => {
    const d = describeEnemy('brute');
    expect(d.name).toBe('Veth Brute');
    expect(d.icon).toBe('🦏');
    expect(d.hp).toBe(120);
    expect(d.armor).toBe(8);
    expect(d.speed).toBe(38);
    expect(d.flying).toBe(false);
    expect(d.reward).toBe(22);
  });

  it('reports which towers beat it and which bounce off', () => {
    const d = describeEnemy('brute');
    expect(d.vulnerableTo).toContain('cannon');
    expect(d.resists).toContain('archer');
  });

  it('marks the phantom as flying', () => {
    expect(describeEnemy('phantom').flying).toBe(true);
  });

  it('returns null for an unknown type', () => {
    expect(describeEnemy('nope')).toBeNull();
  });

  // Derived from the data, so a new enemy cannot silently go undescribed.
  it('describes every enemy in ENEMY_DEFS', () => {
    for (const type of Object.keys(ENEMY_DEFS)) {
      const d = describeEnemy(type);
      expect(d, `missing descriptor for ${type}`).not.toBeNull();
      expect(typeof d.name).toBe('string');
      expect(Array.isArray(d.vulnerableTo)).toBe(true);
    }
  });
});

describe('describeTower', () => {
  it('carries base stats', () => {
    const d = describeTower('archer');
    expect(d.name).toBe('Archer');
    expect(d.cost).toBe(60);
    expect(d.range).toBe(120);
    expect(d.damage).toBe(15);
  });

  it('lists the tier ladder in order with labels and costs', () => {
    const d = describeTower('archer');
    expect(d.tiers.map(t => t.key)).toEqual(['tier2', 'tier3', 'tier4A', 'tier4B']);
    expect(d.tiers[0].label).toBe('Eagle Eye');
    expect(d.tiers[0].cost).toBe(50);
    expect(d.tiers[3].passiveEffect).toBe('+50% range, armor piercing');
  });

  // The barracks is the shape-breaker: damage 0, no per-tier damage/range,
  // and soldier stats instead. It must not render a blank damage row.
  it('exposes soldier stats for the barracks and flags it as non-damaging', () => {
    const d = describeTower('barracks');
    expect(d.dealsDirectDamage).toBe(false);
    expect(d.soldierStats.tier1.count).toBe(3);
    expect(d.soldierStats.tier4A.canBlockFlyers).toBe(true);
    expect(d.tiers.map(t => t.label))
      .toEqual(['Drill Sergeant', 'Elite Guard', 'Vanguard', 'Rapid Response']);
  });

  it('flags damaging towers as damaging', () => {
    expect(describeTower('sniper').dealsDirectDamage).toBe(true);
  });

  it('reports matchups', () => {
    const d = describeTower('cannon');
    expect(d.effective).toContain('brute');
    expect(d.weak).toContain('skitter');
  });

  it('returns null for an unknown type', () => {
    expect(describeTower('nope')).toBeNull();
  });

  it('describes every tower in TOWER_DEFS', () => {
    for (const type of Object.keys(TOWER_DEFS)) {
      const d = describeTower(type);
      expect(d, `missing descriptor for ${type}`).not.toBeNull();
      expect(d.tiers.length).toBe(4);
    }
  });
});
