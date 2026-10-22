import { DEATH_CLASS } from './fx.js';

// Economy & feedback juice tunables (visual only; never gameplay values).
// Colours: numbers for canvas, strings for CSS-facing values.

export const COIN_FLY = {
  duration: 0.6,     // s
  arcHeight: 40,     // px
  maxLive: 24,
  perKill: 3,
  color: 0xffd700,
  size: 4,           // px radius
};

export const GOLD_POP = {
  rise: 28,          // px
  duration: 0.8,     // s
  maxLive: 12,
  fontSize: '14px',
  color: '#ffd700',
};

export const BUILD_POP = {
  duration: 0.3,     // s
  peak: 1.25,
  burstEffect: 'pop', // IMPACT_FX key
};

export const UPGRADE_POP = {
  duration: 0.35,
  peak: 1.3,
  burstEffect: 'pop',
};

export const SELL_FX = {
  duration: 0.25,
  burstEffect: 'pop',
};

export const WAVE_BANNER = {
  duration: 1800,    // ms
};

export const BOSS_WARNING = {
  duration: 2400,    // ms
  // Derived so a new boss in DEATH_CLASS is warned about automatically.
  types: Object.keys(DEATH_CLASS).filter((t) => DEATH_CLASS[t] === 'boss'),
  color: '#ff4d4d',
};

export const SELECTION_RING = {
  color: 0x4fc3f7,
  pulse: 1.2,        // Hz
  width: 2,
};

export const PAD_GLOW = {
  period: 2.4,       // s
  alpha: [0.15, 0.45],
  color: 0xffe08a,
};

export const RETICLE = {
  color: 0xff5a5a,
  lineWidth: 2,
  spin: 1.5,         // rad/s
};
