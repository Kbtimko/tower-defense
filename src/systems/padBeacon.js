// Fraction of the on-window spent ramping in (and out), so the beacon blinks
// softly instead of strobing.
const RAMP_FRACTION = 0.15;

const smooth = (x) => x * x * (3 - 2 * x);

// A short blink once per period; slotIndex * slotPhase (in cycles) desyncs pads.
export function beaconAlpha(timeS, slotIndex, { period, onFraction, alpha, slotPhase }) {
  const c = timeS / period + slotIndex * slotPhase;
  const u = c - Math.floor(c);
  if (u >= onFraction) return alpha[0];
  const ramp = onFraction * RAMP_FRACTION;
  const level = Math.min(1, u / ramp, (onFraction - u) / ramp);
  return alpha[0] + (alpha[1] - alpha[0]) * smooth(level);
}
