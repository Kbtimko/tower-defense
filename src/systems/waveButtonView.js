import { cooldownFraction } from './juiceMath.js';

// Pure view of the Send Wave button so label/ring rules are testable without the DOM.
// `countdown` is { running, remainingMs, totalMs } | null (a WaveCountdown satisfies it).
export function waveButtonView({ done, spawning, currentWave, countdown, bonus, warnMs }) {
  if (done) return { disabled: true, label: 'All Waves Done', ring: null };
  if (spawning) return { disabled: true, label: `Wave ${currentWave} in progress...`, ring: null };
  const plain = `▶ Send Wave ${currentWave + 1}`;
  if (countdown?.running && countdown.remainingMs > 0) {
    const { remainingMs, totalMs } = countdown;
    return {
      disabled: false,
      label: bonus > 0 ? `${plain} (+${bonus}g)` : plain,
      ring: {
        secs: Math.ceil(remainingMs / 1000),
        frac: cooldownFraction(remainingMs, totalMs),
        warn: remainingMs <= warnMs,
      },
    };
  }
  // Pre-wave-1, or waiting at zero: no ring, and the bonus has run out.
  return { disabled: false, label: plain, ring: null };
}
