import { LONG_PRESS_MS, TAP_SLOP_PX } from '../data/input.js';

// Classifies one pointer press. A drag that began as a press is still resolved as
// a tap at release for placement/aim by the caller; this only reports it.
export function classifyGesture({
  downMs, nowMs, movedPx, released,
  longPressMs = LONG_PRESS_MS, slopPx = TAP_SLOP_PX,
}) {
  if (movedPx > slopPx) return 'drag';
  const held = nowMs - downMs;
  // A released press is never 'pending': it is a long-press or a tap.
  if (held >= longPressMs) return 'longpress';
  return released ? 'tap' : 'pending';
}
