import { describe, it, expect } from 'vitest';
import { openFlow, tickFlow, pressFlow } from './resultsFlow.js';
import { RESULTS } from '../data/results.js';

const G = RESULTS.actGuardMs;

describe('resultsFlow', () => {
  it('natural end -> ready at openedAt + endMs', () => {
    const s = openFlow(1000, { motion: true, endMs: 2600 });
    expect(s.phase).toBe('revealing');
    expect(tickFlow(s, 3599).phase).toBe('revealing');
    const r = tickFlow(s, 4000);
    expect(r.phase).toBe('ready');
    expect(r.readyAt).toBe(3600);
  });

  it('press while revealing finishes without acting', () => {
    const s = openFlow(0, { motion: true, endMs: 2600 });
    const { state, act } = pressFlow(s, 500);
    expect(act).toBe(false);
    expect(state.phase).toBe('ready');
    expect(state.readyAt).toBe(500);
  });

  it('guard boundary', () => {
    const s = tickFlow(openFlow(0, { motion: true, endMs: 2600 }), 2600);
    expect(pressFlow(s, 2600 + G - 1).act).toBe(false);
    expect(pressFlow(s, 2600 + G).act).toBe(true);
  });

  it('press after natural end but before a tick uses the scheduled readyAt', () => {
    const s = openFlow(0, { motion: true, endMs: 2600 });
    expect(pressFlow(s, 2600 + G - 1).act).toBe(false);
    expect(pressFlow(s, 2600 + G).act).toBe(true);
  });

  it('motion off -> ready at open, guard still holds', () => {
    const s = openFlow(5000, { motion: false, endMs: 2600 });
    expect(s.phase).toBe('ready');
    expect(s.readyAt).toBe(5000);
    expect(pressFlow(s, 5100).act).toBe(false);
    expect(pressFlow(s, 5000 + G).act).toBe(true);
  });

  it('never mutates its input', () => {
    const s = Object.freeze(openFlow(0, { motion: true, endMs: 2600 }));
    expect(() => { tickFlow(s, 3000); pressFlow(s, 100); pressFlow(s, 3000); }).not.toThrow();
    const ready = Object.freeze(tickFlow(s, 3000));
    expect(() => pressFlow(ready, 4000)).not.toThrow();
  });
});
