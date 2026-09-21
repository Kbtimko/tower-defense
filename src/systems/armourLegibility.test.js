import { describe, it, expect } from 'vitest';
import { armourAbsorption, HEAVY_ABSORPTION, describeTowerArmour } from './armourLegibility.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';

describe('armourAbsorption', () => {
  it('reports no absorption when the enemy has no armour', () => {
    expect(armourAbsorption({ amount: 15, armor: 0 }))
      .toEqual({ after: 15, absorbed: 0, band: 'none' });
  });

  it('floors when armour equals the damage', () => {
    // ice T1 (8) vs brute (8) — the combination the bug report came from.
    const r = armourAbsorption({ amount: 8, armor: 8 });
    expect(r.after).toBe(1);
    expect(r.band).toBe('floored');
  });

  it('floors when armour exceeds the damage', () => {
    expect(armourAbsorption({ amount: 15, armor: 20 }).band).toBe('floored');
  });

  it('floors when the result lands on 1 without the clamp', () => {
    // 2 - 1 = 1: no clamp, but the player sees the same unreadable 1.
    expect(armourAbsorption({ amount: 2, armor: 1 }).band).toBe('floored');
  });

  it('never flags a piercing hit, however much armour there is', () => {
    const r = armourAbsorption({ amount: 8, armor: 20, pierce: true });
    expect(r).toEqual({ after: 8, absorbed: 0, band: 'none' });
  });

  it('calls absorption heavy at exactly the threshold', () => {
    // archer T3 (40) vs titan (20) -> 20 through, exactly 0.5 absorbed.
    const r = armourAbsorption({ amount: 40, armor: 20 });
    expect(r.absorbed).toBe(HEAVY_ABSORPTION);
    expect(r.band).toBe('heavy');
  });

  it('leaves absorption just under the threshold unflagged', () => {
    // cannon T1 (45) vs titan (20) -> 25 through, 0.444 absorbed.
    expect(armourAbsorption({ amount: 45, armor: 20 }).band).toBe('none');
  });

  it('prefers floored over heavy when both would apply', () => {
    expect(armourAbsorption({ amount: 8, armor: 20 }).band).toBe('floored');
  });

  it('treats a zero-damage source as unflagged', () => {
    // TOWER_DEFS.barracks has damage: 0 — must not divide by zero.
    expect(armourAbsorption({ amount: 0, armor: 20 }))
      .toEqual({ after: 0, absorbed: 0, band: 'none' });
  });
});

describe('describeTowerArmour', () => {
  it('lists only armoured enemies that are actually flagged', () => {
    // ice T1: damage 8. Floors against brute(8), colossus(15), titan(20).
    const rows = describeTowerArmour({ damage: 8 });
    expect(rows.map(r => r.enemyType)).toEqual(['brute', 'colossus', 'titan']);
    expect(rows.every(r => r.band === 'floored')).toBe(true);
  });

  it('returns nothing for a tower that loses little to armour', () => {
    // cannon T3: damage 100. Worst case is titan at 20% absorbed.
    expect(describeTowerArmour({ damage: 100 })).toEqual([]);
  });

  it('returns nothing at all for a piercing tower', () => {
    // sniper T1: damage 80, pierce true.
    expect(describeTowerArmour({ damage: 80, pierce: true })).toEqual([]);
  });

  it('returns nothing for a zero-damage tower', () => {
    // the barracks tower itself deals 0; its soldiers are passed separately.
    expect(describeTowerArmour({ damage: 0 })).toEqual([]);
  });

  it('never lists an unarmoured enemy', () => {
    const rows = describeTowerArmour({ damage: 8 });
    expect(rows.some(r => ['drone', 'skitter', 'phantom'].includes(r.enemyType)))
      .toBe(false);
  });

  it('carries the display name and the armour value for the panel', () => {
    const [brute] = describeTowerArmour({ damage: 8 });
    expect(brute.name).toBe(ENEMY_DEFS.brute.name);
    expect(brute.armor).toBe(ENEMY_DEFS.brute.armor);
    expect(brute.after).toBe(1);
  });

  it('orders rows by ENEMY_DEFS key order', () => {
    const order = Object.keys(ENEMY_DEFS);
    const rows = describeTowerArmour({ damage: 15 });   // archer T1
    const idx  = rows.map(r => order.indexOf(r.enemyType));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});

// Derived, not hardcoded: a pinned list of names is what made waves.test.js
// ENFORCE the colossus bug. Assert the properties that DEFINE each band, so a
// future balance retune moves the roster without silently gutting coverage.
describe('band membership across the real tables', () => {
  const sources = [];
  for (const [type, def] of Object.entries(TOWER_DEFS)) {
    for (const tier of [1, 2, 3]) {
      const damage = tier === 1 ? def.damage : def[`tier${tier}`]?.damage;
      if (!damage) continue;
      sources.push({ label: `${type} T${tier}`, damage, pierce: def.pierce });
    }
    if (def.soldierStats) {
      for (const tier of [1, 2, 3]) {
        sources.push({
          label: `${type} soldier T${tier}`,
          damage: def.soldierStats[`tier${tier}`].damage,
          pierce: false,
        });
      }
    }
  }

  const rowsFor = (s) => Object.values(ENEMY_DEFS)
    .filter(e => e.armor > 0)
    .map(e => ({ s, e, ...armourAbsorption({ amount: s.damage, armor: e.armor, pierce: s.pierce }) }));
  const all = sources.flatMap(rowsFor);

  it('gives every floored row exactly 1 damage through', () => {
    for (const r of all.filter(r => r.band === 'floored')) expect(r.after).toBe(1);
  });

  it('gives every heavy row at least the threshold and more than 1 through', () => {
    for (const r of all.filter(r => r.band === 'heavy')) {
      expect(r.absorbed).toBeGreaterThanOrEqual(HEAVY_ABSORPTION);
      expect(r.after).toBeGreaterThan(1);
    }
  });

  it('partitions every combination into exactly one band', () => {
    for (const r of all) expect(['none', 'heavy', 'floored']).toContain(r.band);
  });

  it('never flags a piercing source', () => {
    for (const r of all.filter(r => r.s.pierce)) expect(r.band).toBe('none');
  });

  it('flags at least one combination, so the feature is never vacuous', () => {
    expect(all.some(r => r.band !== 'none')).toBe(true);
  });

  it('still floors ice T1 against a brute — the reported symptom', () => {
    const r = armourAbsorption({ amount: TOWER_DEFS.ice.damage, armor: ENEMY_DEFS.brute.armor });
    expect(r.band).toBe('floored');
  });
});
