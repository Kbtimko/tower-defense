// Barracks rally-flag tunables (#48). Balance and presentation numbers live here,
// not in scene/entity code. Frozen so a stray write cannot drift them mid-run.
import { PALETTE } from './theme.js';

// substepPx must stay <= MELEE_RANGE / 2 so a marching soldier cannot step over
// an enemy's melee window between checks.
export const SOLDIER_MARCH = Object.freeze({ speed: 60, substepPx: 15, disengagePx: 60 });

// turnMs: a formation that changes heading (march start, arrival, reversal)
// swings into its new layout over this long instead of jumping a body-width.
export const SOLDIER_FORMATION = Object.freeze({
  spacingFrac: 0.55, fallbackSpacingPx: 9, flankBackFrac: 0.4, turnMs: 120,
});

export const WALK_BOB = Object.freeze({ amplitudePx: 1.5, hz: 4 });

export const RALLY_FLAG = Object.freeze({
  // lineWidth: the range ring and flag pole strokes.
  fadeMs: 900, ghostAlpha: 0.6, routeDotSpacingPx: 10, routeDotRadius: 2, lineWidth: 2,
  poleHeight: 18, pennant: Object.freeze({ w: 10, h: 7 }), depth: 10.6,
  ok: PALETTE.accent, bad: PALETTE.danger,
});
