// Tunables for the ambient-life visuals. Layer order matters: index 0 is the
// far layer and must stay at depth 5 (under the road).
// The near layer sits at 8.5: above the road (8), below pads/static layers (10)
// and units (11+). Its alpha stays <= 0.6 so it never competes with gameplay.
export const AMBIENT_LAYERS = [
  { name: 'far', depth: 5, speed: 1, size: 1, alpha: 1, seedOffset: 0 },
  { name: 'near', depth: 8.5, speed: 1.8, size: 1.6, alpha: 0.55, seedOffset: 1013 },
];

// Blinking amber beacon on each empty build pad (art-bible human amber). The
// offset sits on the pad's upper-left rim, matching the art bible's light
// direction; slotPhase desyncs neighbouring pads.
export const PAD_BEACON = {
  color: 0xffb000,
  radius: 2,
  offset: { x: -15, y: -15 },
  period: 2.4,
  onFraction: 0.18,
  alpha: [0.15, 0.95],
  slotPhase: 0.37,
};
