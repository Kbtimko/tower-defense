import { describe, it, expect } from 'vitest';
import { armourAbsorption, HEAVY_ABSORPTION } from './armourLegibility.js';

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
