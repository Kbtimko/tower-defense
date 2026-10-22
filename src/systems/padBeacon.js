const smooth = (x) => x * x * (3 - 2 * x);

// Blink envelope 0..1: one short smoothstep pulse per period; slot * slotPhase
// (in cycles) desyncs neighbouring pads.
export function beaconLevel(timeS, slot, { period, onFraction, ramp: rampFraction, slotPhase }) {
  const c = timeS / period + slot * slotPhase;
  const u = c - Math.floor(c);
  if (u >= onFraction) return 0;
  const ramp = onFraction * rampFraction;
  return smooth(Math.min(1, u / ramp, (onFraction - u) / ramp));
}

export function beaconAlpha(timeS, slot, beacon) {
  const [lo, hi] = beacon.alpha;
  return lo + (hi - lo) * beaconLevel(timeS, slot, beacon);
}
