import { RESULTS } from '../data/results.js';

// Input state machine for the results screen. All transitions return new objects.
export function openFlow(now, { motion, endMs }) {
  return motion
    ? { phase: 'revealing', openedAt: now, readyAt: null, endMs }
    : { phase: 'ready', openedAt: now, readyAt: now, endMs };
}

export function tickFlow(state, now) {
  if (state.phase !== 'revealing' || now < state.openedAt + state.endMs) return state;
  // Scheduled end, not tick time: the guard runs from when the buttons finished appearing.
  return { ...state, phase: 'ready', readyAt: state.openedAt + state.endMs };
}

export function pressFlow(state, now, cfg = RESULTS) {
  const s = tickFlow(state, now);
  if (s.phase === 'revealing') return { state: { ...s, phase: 'ready', readyAt: now }, act: false };
  return { state: s, act: now - s.readyAt >= cfg.actGuardMs };
}
