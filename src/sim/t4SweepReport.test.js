import { describe, it, expect } from 'vitest';
import { formatT4Sweep } from './t4SweepReport.js';

const result = {
  map: { id: 9, name: 'Test Map' },
  livesMult: 1.5,
  baseline: { label: 'start/T1', multiplier: 1.5, livesKept: 0.456 },
  rows: [
    { type: 'archer', tier: 'T3', multiplier: 1, livesKept: 1, reachedWave: 3 },
    { type: 'archer', tier: '4A', multiplier: 1.25, livesKept: 0.5, reachedWave: 12 },
    { type: 'archer', tier: '4B', multiplier: null, livesKept: 0, reachedWave: null },
    { type: 'mage', tier: 'T3', multiplier: 2, livesKept: 0.04, reachedWave: 5 },
    { type: 'mage', tier: '4A', multiplier: 1.1, livesKept: 0.75, reachedWave: 10 },
    { type: 'mage', tier: '4B', multiplier: 8, livesKept: 0.333, reachedWave: null },
  ],
};

describe('formatT4Sweep', () => {
  const lines = formatT4Sweep([result]);

  it('prints one header per map with the baseline', () => {
    expect(lines).toContain('Map 9 Test Map — baseline start/T1: x1.50, lives at x1.50');
  });

  it('prints one aligned line per tower, with — for a null multiplier', () => {
    expect(lines).toContain('  archer      T3 x1.00 100% @w3   4A x1.25  50% @w12  4B     —   0% @—');
  });

  it('keeps tier groups at the same columns across towers', () => {
    const rows = lines.filter(l => /^ {2}(archer|mage) /.test(l));
    expect(rows).toHaveLength(2);
    expect(rows[0].indexOf('4A')).toBe(rows[1].indexOf('4A'));
    expect(rows[0].indexOf('4B')).toBe(rows[1].indexOf('4B'));
    expect(rows[1]).toBe('  mage        T3 x2.00   4% @w5   4A x1.10  75% @w10  4B x8.00  33% @—');
  });

  it('prints a legend line before the caveat', () => {
    const at = lines.findIndex(l => l.startsWith('Legend'));
    const legend = lines.slice(at, at + 3).join(' ');
    expect(legend).toMatch(/lower x = stronger/);
    expect(legend).toMatch(/baseline's win multiplier/);
    expect(legend).toMatch(/@wN/);
    expect(legend).toMatch(/compare within a row; the baseline is context/);
    expect(legend).toMatch(/never reached tier 4/);
  });

  it('ends with the caveat naming #75, text-only abilities and no slow', () => {
    const caveat = lines.slice(-3).join(' ');
    expect(caveat).toContain('#75');
    expect(caveat).toMatch(/text only/);
    expect(caveat).toMatch(/mage 4B and ice 4B apply no slow/);
  });
});
