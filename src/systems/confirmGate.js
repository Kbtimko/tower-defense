import { CONFIRM_WINDOW_MS } from '../data/input.js';

// Two-press confirm: time is passed in so this stays pure/testable.
export function createConfirmGate({ windowMs = CONFIRM_WINDOW_MS } = {}) {
  let key = null;
  let armedAt = 0;
  return {
    press(k, nowMs) {
      if (key === k && nowMs - armedAt <= windowMs) { key = null; return 'confirmed'; }
      key = k; armedAt = nowMs;
      return 'armed';
    },
    reset() { key = null; },
    get armedKey() { return key; },
  };
}
