import { describe, it, expect } from 'vitest';
import { waveButtonView } from './waveButtonView.js';

const WARN = 5000;
const base = { done: false, spawning: false, currentWave: 3, countdown: null, bonus: 0, warnMs: WARN };
const run = (remainingMs, totalMs = 20000) => ({ running: true, remainingMs, totalMs });

describe('waveButtonView', () => {
  it('done -> disabled All Waves Done, no ring', () => {
    expect(waveButtonView({ ...base, done: true, countdown: run(9000) }))
      .toEqual({ disabled: true, label: 'All Waves Done', ring: null });
  });

  it('spawning -> disabled in-progress label, no ring', () => {
    expect(waveButtonView({ ...base, spawning: true, countdown: run(9000) }))
      .toEqual({ disabled: true, label: 'Wave 3 in progress...', ring: null });
  });

  it('pre-wave-1 (no countdown) -> exactly "▶ Send Wave 1", no ring', () => {
    expect(waveButtonView({ ...base, currentWave: 0 }))
      .toEqual({ disabled: false, label: '▶ Send Wave 1', ring: null });
  });

  it('running countdown with bonus -> bonus label and ring', () => {
    const v = waveButtonView({ ...base, countdown: run(10000), bonus: 17 });
    expect(v.disabled).toBe(false);
    expect(v.label).toBe('▶ Send Wave 4 (+17g)');
    expect(v.ring).toEqual({ secs: 10, frac: 0.5, warn: false });
  });

  it('running countdown with bonus 0 -> no (+…) suffix', () => {
    const v = waveButtonView({ ...base, countdown: run(10000), bonus: 0 });
    expect(v.label).toBe('▶ Send Wave 4');
    expect(v.label).not.toContain('(+');
  });

  it('secs rounds up', () => {
    expect(waveButtonView({ ...base, countdown: run(9001) }).ring.secs).toBe(10);
  });

  it('warn is true at warnMs, false at warnMs + 1', () => {
    expect(waveButtonView({ ...base, countdown: run(WARN) }).ring.warn).toBe(true);
    expect(waveButtonView({ ...base, countdown: run(WARN + 1) }).ring.warn).toBe(false);
  });

  it('waiting at zero (running, remainingMs 0) -> plain label, no ring', () => {
    expect(waveButtonView({ ...base, countdown: run(0), bonus: 9 }))
      .toEqual({ disabled: false, label: '▶ Send Wave 4', ring: null });
  });

  it('stopped countdown -> plain label, no ring', () => {
    expect(waveButtonView({ ...base, countdown: { running: false, remainingMs: 9000, totalMs: 20000 } }))
      .toEqual({ disabled: false, label: '▶ Send Wave 4', ring: null });
  });
});
