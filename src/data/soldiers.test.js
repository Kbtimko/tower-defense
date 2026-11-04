import { describe, it, expect } from 'vitest';
import { SOLDIER_MARCH, SOLDIER_FORMATION, WALK_BOB, RALLY_FLAG } from './soldiers.js';
import { PALETTE } from './theme.js';
import { RING_ANGLES } from './radial.js';
import { MELEE_RANGE } from '../systems/soldierCombat.js';

describe('soldier tunables', () => {
  it('holds the specified values', () => {
    expect(SOLDIER_MARCH).toEqual({ speed: 60, substepPx: 15, disengagePx: 60 });
    expect(SOLDIER_FORMATION).toEqual({ spacingFrac: 0.55, fallbackSpacingPx: 9, flankBackFrac: 0.4 });
    expect(WALK_BOB).toEqual({ amplitudePx: 1.5, hz: 4 });
    expect(RALLY_FLAG).toEqual({
      fadeMs: 900, ghostAlpha: 0.6, routeDotSpacingPx: 10, routeDotRadius: 2,
      poleHeight: 18, pennant: { w: 10, h: 7 }, depth: 10.6,
      ok: PALETTE.accent, bad: PALETTE.danger,
    });
  });

  it('substep is fine enough that a marching soldier cannot skip over melee range', () => {
    expect(SOLDIER_MARCH.substepPx).toBeLessThanOrEqual(MELEE_RANGE / 2);
  });

  it('keeps march and flag values in a sane range', () => {
    expect(SOLDIER_MARCH.speed).toBeGreaterThan(0);
    expect(SOLDIER_MARCH.disengagePx).toBeGreaterThan(0);
    expect(RALLY_FLAG.fadeMs).toBeGreaterThanOrEqual(0);
  });

  it('flag colours come from the palette', () => {
    expect(RALLY_FLAG.ok).toBe(PALETTE.accent);
    expect(RALLY_FLAG.bad).toBe(PALETTE.danger);
  });

  it('freezes every tunable', () => {
    for (const t of [SOLDIER_MARCH, SOLDIER_FORMATION, WALK_BOB, RALLY_FLAG]) {
      expect(Object.isFrozen(t)).toBe(true);
    }
  });
});

describe('RING_ANGLES.rally', () => {
  it('is east and distinct from every other slot', () => {
    expect(RING_ANGLES.rally).toBe(0);
    const others = Object.entries(RING_ANGLES).filter(([k]) => k !== 'rally').map(([, v]) => v);
    expect(others).not.toContain(RING_ANGLES.rally);
  });
});
