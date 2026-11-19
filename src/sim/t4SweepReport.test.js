import { describe, it, expect } from 'vitest';
import { formatT4Sweep } from './t4SweepReport.js';

const result = {
  map: { id: 9, name: 'Test Map' },
  baseline: { label: 'start/T1', multiplier: 1.5, livesKept: 0.456 },
  rows: [
    { type: 'archer', tier: 'T3', multiplier: 1, livesKept: 1 },
    { type: 'archer', tier: '4A', multiplier: 1.25, livesKept: 0.5 },
    { type: 'archer', tier: '4B', multiplier: null, livesKept: 0 },
    { type: 'mage', tier: 'T3', multiplier: 2, livesKept: 0.04 },
    { type: 'mage', tier: '4A', multiplier: 1.1, livesKept: 0.75 },
    { type: 'mage', tier: '4B', multiplier: 8, livesKept: 0.333 },
  ],
};

describe('formatT4Sweep', () => {
  const lines = formatT4Sweep([result]);

  it('prints one header per map with the baseline', () => {
    expect(lines).toContain('Map 9 Test Map — baseline start/T1: x1.50, 46% lives');
  });

  it('prints one aligned line per tower, with — for a null multiplier', () => {
    expect(lines).toContain('  archer      T3 x1.00 100%  4A x1.25  50%  4B     —   0%');
  });

  it('keeps tier groups at the same columns across towers', () => {
    const rows = lines.filter(l => /^ {2}(archer|mage) /.test(l));
    expect(rows).toHaveLength(2);
    expect(rows[0].indexOf('4A')).toBe(rows[1].indexOf('4A'));
    expect(rows[0].indexOf('4B')).toBe(rows[1].indexOf('4B'));
    expect(rows[1]).toBe('  mage        T3 x2.00   4%  4A x1.10  75%  4B x8.00  33%');
  });

  it('ends with the caveat naming #75, text-only abilities and no slow', () => {
    const caveat = lines.slice(-3).join(' ');
    expect(caveat).toContain('#75');
    expect(caveat).toMatch(/text only/);
    expect(caveat).toMatch(/mage 4B and ice 4B apply no slow/);
  });
});
