// Auto-send countdown tunables (#51). Per-map overrides live on the map as
// `waveCountdownSec`; everything else is here so scenes and the simulator share it.
export const WAVE_COUNTDOWN = Object.freeze({
  defaultSec: 20,
  goldPerSecond: 4.5, // median 0.5 x reward alive at spawns-done over 112 waves, M 90 / 20 s (p25 66, p75 116.25)
  warnSec: 5,
  ringQuantum: 0.005, // min ring-progress change worth a DOM write
});
