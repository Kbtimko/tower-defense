// Auto-send countdown tunables (#51). Per-map overrides live on the map as
// `waveCountdownSec`; everything else is here so scenes and the simulator share it.
export const WAVE_COUNTDOWN = Object.freeze({
  defaultSec: 20,
  goldPerSecond: 4.65, // median 0.5 x reward alive at spawns-done, all 136 waves (losing maps sampled at their win multiplier), M 93 / 20 s (p25 69.75, p75 143.125)
  warnSec: 5,
  ringQuantum: 0.005, // min ring-progress change worth a DOM write
});
