// Auto-send countdown tunables (#51). Per-map overrides live on the map as
// `waveCountdownSec`; everything else is here so scenes and the simulator share it.
export const WAVE_COUNTDOWN = Object.freeze({
  defaultSec: 20,
  goldPerSecond: 1.75, // provisional — Task 4 calibrates
  warnSec: 5,
  ringQuantum: 0.005, // min ring-progress change worth a DOM write
});
