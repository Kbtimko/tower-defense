import { BOSS_WARNING } from '../data/juice.js';

// Fraction of the pop spent rising to the peak; the rest settles back to 1.
const POP_RISE = 0.3;

// Writes into a caller-owned `out` so per-frame coin arcs don't allocate.
export function arcPoint(t, from, to, height, out) {
  out.x = from.x + (to.x - from.x) * t;
  // Parabola 4t(1-t) peaks at exactly 1 when t = 0.5.
  out.y = from.y + (to.y - from.y) * t - height * 4 * t * (1 - t);
  return out;
}

export function popScale(t, duration, peak) {
  if (t <= 0 || t >= duration) return 1;
  const u = t / duration;
  const amt = peak - 1;
  if (u < POP_RISE) {
    const k = u / POP_RISE;
    return 1 + amt * (1 - (1 - k) ** 2); // ease-out to the peak
  }
  const k = (u - POP_RISE) / (1 - POP_RISE);
  return 1 + amt * (1 - k * k * (3 - 2 * k)); // smoothstep settle
}

// phase is in cycles (0..1) so pads desync.
export function padGlowAlpha(timeS, phase, { period, alpha }) {
  const s = 0.5 + 0.5 * Math.sin(((timeS / period) + phase) * Math.PI * 2);
  return alpha[0] + (alpha[1] - alpha[0]) * s;
}

export function cooldownFraction(remaining, max) {
  if (!(max > 0)) return 0;
  return Math.min(1, Math.max(0, remaining / max));
}

export function waveBannerText(waveNum, waveCount) {
  return waveNum >= waveCount ? 'Final wave' : `Wave ${waveNum} / ${waveCount}`;
}

export function bossWarning(waveGroups) {
  if (!waveGroups) return null;
  for (const g of waveGroups) {
    if (BOSS_WARNING.types.includes(g.type)) return g.type;
  }
  return null;
}
