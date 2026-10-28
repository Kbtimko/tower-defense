import { WAVE_COUNTDOWN } from '../data/waveCountdown.js';
import { cooldownFraction } from './juiceMath.js';

// Anything that isn't a positive finite number (missing, 0, negative, NaN, a string)
// falls back to the default so a bad map row can never produce an instant or endless wait.
export function countdownMsFor(map) {
  const sec = map && map.waveCountdownSec;
  const ok = typeof sec === 'number' && Number.isFinite(sec) && sec > 0;
  return (ok ? sec : WAVE_COUNTDOWN.defaultSec) * 1000;
}

// startedFor guards re-arming: a cancelled/finished countdown must not restart for the same wave.
export function shouldStartCountdown({ isEarlyEligible, done, currentWave, startedFor }) {
  return !!isEarlyEligible && !done && currentWave > 0 && startedFor !== currentWave;
}

// Mirrors WaveManager.startWave's delay accumulation: the last enemy spawns at the sum
// of every interval before it (intervals accumulate across groups).
export function lastSpawnMs(wave) {
  let delay = 0;
  let last = 0;
  for (const group of wave) {
    for (let i = 0; i < group.count; i++) {
      last = delay;
      delay += group.interval;
    }
  }
  return last;
}

export class WaveCountdown {
  constructor() {
    this.running = false;
    this.held = false;
    this.remainingMs = 0;
    this.totalMs = 0;
    this.startedFor = null;
  }

  start(totalMs, forWave) {
    this.running = true;
    this.held = false;
    this.totalMs = totalMs;
    this.remainingMs = totalMs;
    this.startedFor = forWave;
  }

  // Clamped at 0 so a huge frame delta (tab return) can't go negative or send twice.
  tick(dtMs) {
    if (!this.running || this.held) return;
    this.remainingMs = Math.max(0, this.remainingMs - dtMs);
  }

  hold() { this.held = true; }
  resume() { this.held = false; }

  // Keeps startedFor so the same wave never re-arms.
  cancel() { this.running = false; }

  get displaySeconds() { return Math.ceil(this.remainingMs / 1000); }
  get fraction() { return cooldownFraction(this.remainingMs, this.totalMs); }

  isWarning(warnMs) { return this.remainingMs > 0 && this.remainingMs <= warnMs; }

  bonus({ goldPerSecond, rewardMult }) {
    return this.running ? Math.floor((this.remainingMs / 1000) * goldPerSecond * rewardMult) : 0;
  }

  shouldAutoSend(enabled) {
    return !!enabled && this.running && !this.held && this.remainingMs === 0;
  }
}
