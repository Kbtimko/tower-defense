import { describe, it, expect } from 'vitest';
import { hpBarFillWidth } from './hpBar.js';

// A wave-5 colossus is the case that prompted this: 660 HP, armour 15, and a
// tier-1 archer floored to 1 damage a hit.
const COLOSSUS_MAX = 660;
const COLOSSUS_BAR = 16 * 2.2; // radius * 2.2, as Enemy._redrawHpBar sizes it

describe('hpBarFillWidth', () => {
  it('fills the whole bar at full health', () => {
    expect(hpBarFillWidth(100, 100, 40)).toBe(40);
  });

  it('is proportional once the loss is wider than the reserved pixel', () => {
    expect(hpBarFillWidth(50, 100, 40)).toBeCloseTo(20);
    expect(hpBarFillWidth(25, 100, 40)).toBeCloseTo(10);
  });

  it('empties the bar at zero HP', () => {
    expect(hpBarFillWidth(0, 100, 40)).toBe(0);
  });

  it('leaves a visible pixel of loss after a single 1-damage chip hit', () => {
    const full = hpBarFillWidth(COLOSSUS_MAX, COLOSSUS_MAX, COLOSSUS_BAR);
    const hit  = hpBarFillWidth(COLOSSUS_MAX - 1, COLOSSUS_MAX, COLOSSUS_BAR);
    expect(full - hit).toBeGreaterThanOrEqual(1);
  });

  it('still shrinks monotonically as chip damage accumulates', () => {
    let prev = hpBarFillWidth(COLOSSUS_MAX, COLOSSUS_MAX, COLOSSUS_BAR);
    for (let hp = COLOSSUS_MAX - 1; hp > COLOSSUS_MAX - 25; hp--) {
      const w = hpBarFillWidth(hp, COLOSSUS_MAX, COLOSSUS_BAR);
      expect(w).toBeLessThanOrEqual(prev);
      prev = w;
    }
  });

  it('never reports more fill than the bar is wide', () => {
    // Hero regen can momentarily overshoot; bad data should not overdraw.
    expect(hpBarFillWidth(150, 100, 40)).toBe(40);
  });

  it('returns 0 rather than NaN for a zero or missing maxHp', () => {
    expect(hpBarFillWidth(10, 0, 40)).toBe(0);
    expect(hpBarFillWidth(10, undefined, 40)).toBe(0);
  });

  it('never returns a negative width', () => {
    expect(hpBarFillWidth(-5, 100, 40)).toBe(0);
    expect(hpBarFillWidth(99, 100, 0.5)).toBeGreaterThanOrEqual(0);
    expect(hpBarFillWidth(99, 100, 0)).toBe(0);
  });
});
