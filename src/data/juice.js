import { DEATH_CLASS } from './fx.js';

// Economy & feedback juice tunables (visual only; never gameplay values).
// Colours: numbers for canvas, strings for CSS-facing values.

export const COIN_FLY = {
  duration: 0.6,     // s
  arcHeight: 40,     // px
  maxLive: 24,
  perKill: 3,
  stagger: 0.08,     // s between coins of one kill
  depth: 31,         // above gfx (30) so coins are never hidden under it
  color: 0xffd700,
  texture: 'fx-ember',
  size: 7,           // px half-size: displayed at 2x = ~14 px
  pulseGap: 0.3,     // s min between HUD pulses; matches the CSS pulse length
  edgeInset: 32,     // px: keep the flight target off the canvas corners
  exitY: -16,        // px: the HUD sits above the canvas, so coins exit past the top edge
};

export const GOLD_POP = {
  rise: 24,          // px
  duration: 0.9,     // s
  maxLive: 12,
  fontSize: '18px',
  fontStyle: 'bold',
  color: '#ffd700',
  stroke: '#000000',
  strokeThickness: 3,
  offsetX: 16,       // px: beside the damage number, not on top of it
  offsetY: -6,
  fadeStart: 0.5,    // fraction of duration held at full alpha before fading
  depth: 32,         // above coins (31) and gfx (30)
};

// burstEffect keys are IMPACT_FX entries; 'pop' is the enemy death pop
// (tinted per enemy), so it must not be reused.
export const BUILD_POP = {
  duration: 0.3,     // s
  peak: 1.25,
  burstEffect: 'ringBurst',
};

export const UPGRADE_POP = {
  duration: 0.35,
  peak: 1.3,
  burstEffect: 'ringBurstGold',
};

export const SELL_FX = {
  burstEffect: 'ringBurst',
  smokeEffect: 'sellPuff',
};

export const WAVE_BANNER = {
  duration: 1800,    // ms
};

export const BOSS_WARNING = {
  duration: 2400,    // ms
  // Derived so a new boss in DEATH_CLASS is warned about automatically.
  types: Object.keys(DEATH_CLASS).filter((t) => DEATH_CLASS[t] === 'boss'),
  color: '#ff4d4d',  // fed to CSS as --boss-warning-color
};

export const SELECTION_RING = {
  color: 0x4fc3f7,
  pulse: 1.2,        // Hz
  width: 2,
  radius: 22,        // px, at the tower base
  alpha: [0.5, 1],   // pulse range
};

export const PAD_GLOW = {
  period: 2.4,       // s
  alpha: [0.15, 0.45],
  color: 0xffe08a,
  depth: 10.5,       // above static layers (10), below the unit band (11)
  slotPhase: 0.17,   // cycles of offset per slot index, so pads desync
  staticAlpha: 0.2,  // reduced motion: faint steady glow
};

export const RETICLE = {
  color: 0xff5a5a,
  lineWidth: 2,
  spin: 1.5,         // rad/s
  radius: 24,        // px default for aimed abilities with no area (e.g. single-target mark)
  ticks: 4,
  tickInner: 6,      // px gap between circle and tick start
  tickLength: 8,
};
