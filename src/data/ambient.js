// Tunables for the ambient-life visuals. Layer order matters: index 0 is the
// far layer and must stay at depth 5 (under the road).
// The near layer sits at 8.5: above the road (8), below pads/static layers (10)
// and units (11+). Its alpha stays <= 0.6 so it never competes with gameplay.
export const AMBIENT_LAYERS = [
  { name: 'far', depth: 5, speed: 1, size: 1, alpha: 1, seedOffset: 0 },
  { name: 'near', depth: 8.5, speed: 1.8, size: 1.6, alpha: 0.55, seedOffset: 1013 },
];

// Blinking amber beacon on each empty build pad (art-bible human amber). It is a
// small lamp socketed into the dark cleared platform, inside the padEdge stroke
// (r*0.8 = 17.6), clear of the stud ring on the rim and the "+" marker.
export const PAD_BEACON = {
  color: 0xffb000,
  radius: 3.5, // lit core
  // Dark socket ring around the core so it reads against any platform tone.
  outline: { color: 0x0b1020, width: 1.5 },
  // Soft glow behind the socket; pulses with the blink, steady under reduced motion.
  halo: { radius: 8, alpha: 0.35, staticAlpha: 0.175 },
  // Upper-left of centre, matching the art bible's light direction.
  offset: { x: -8.5, y: -8.5 },
  period: 2.0, // seconds per blink cycle
  onFraction: 0.25, // share of the period the lamp is lit
  ramp: 0.15, // share of the on-window spent ramping in/out (soft, not a strobe)
  alpha: [0.25, 1], // core alpha at rest / at peak
  staticAlpha: 0.7, // core alpha under reduced motion (no blink)
  slotPhase: 0.37, // cycles of offset per pad index, desyncs neighbours
};
