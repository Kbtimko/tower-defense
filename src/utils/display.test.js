import { formatDuration, formatCount } from './display.js';

describe('formatDuration', () => {
  it.each([[0, '0:00'], [59999, '0:59'], [60000, '1:00'], [3599999, '59:59'], [3600000, '1:00:00'],
    [NaN, '0:00'], [-1, '0:00'], [Infinity, '0:00']])('%s -> %s', (ms, out) => {
    expect(formatDuration(ms)).toBe(out);
  });
});

describe('formatCount', () => {
  it('formats with thousands separators', () => {
    expect(formatCount(3480)).toBe('3,480');
    expect(formatCount(3479.6)).toBe('3,480');
  });
  it('non-finite -> 0', () => {
    expect(formatCount(NaN)).toBe('0');
    expect(formatCount(Infinity)).toBe('0');
  });
});
