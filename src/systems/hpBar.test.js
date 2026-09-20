import { describe, it, expect } from 'vitest';
import { hpBarFillWidth, hpBarGeometry } from './hpBar.js';

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

// Regression: the bar's geometry came from `def.radius` — the old Graphics
// fallback body — while the sprite scale-up made the rendered art 2-6x larger.
// Every enemy ended up with its HP bar drawn ON its own sprite (a titan's sat
// in the middle of a 138px chest), narrow and low-contrast, so the player could
// not read width changes and only registered damage when the bar changed COLOUR
// at 50% and 25%. For a 70 HP drone taking 15 a shot that is the third or
// fourth hit — "it takes 3-4 shots for an archer to damage a drone".
describe('hpBarGeometry', () => {
  // radius, then the real rendered sprite sizes measured in the running game.
  const DRONE = { radius: 9,  sprite: 37.8 };
  const TITAN = { radius: 22, sprite: 138.2 };

  it('lifts the bar clear of the rendered sprite, not just the radius', () => {
    const g = hpBarGeometry(DRONE.radius, DRONE.sprite, DRONE.sprite);
    expect(g.top).toBeLessThan(-DRONE.sprite / 2);
  });

  it('clears even a sprite many times the radius', () => {
    const g = hpBarGeometry(TITAN.radius, TITAN.sprite, TITAN.sprite);
    expect(g.top).toBeLessThan(-TITAN.sprite / 2);
  });

  it('widens the bar toward the body so a hit moves a readable number of pixels', () => {
    const before = DRONE.radius * 2.2;                     // 19.8px, the old bar
    const g = hpBarGeometry(DRONE.radius, DRONE.sprite, DRONE.sprite);
    expect(g.width).toBeGreaterThan(before);
    expect(g.width).toBeLessThanOrEqual(DRONE.sprite);     // never wider than the enemy
  });

  it('falls back to the radius geometry when no sprite is rendered', () => {
    const g = hpBarGeometry(9, null, null);
    expect(g.width).toBeCloseTo(9 * 2.2);
    expect(g.top).toBe(-9 - 8);
  });

  it('never returns a bar narrower than the radius-derived one', () => {
    for (const r of [7, 9, 11, 16, 22]) {
      expect(hpBarGeometry(r, 10, 10).width).toBeGreaterThanOrEqual(r * 2.2);
    }
  });

  it('keeps the bar centred, so x is half the width left of centre', () => {
    const g = hpBarGeometry(16, 53.8, 53.8);
    expect(g.x).toBeCloseTo(-g.width / 2);
  });
});
