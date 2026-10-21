import { describe, it, expect } from 'vitest';
import { loadingLabel } from './loadingBar.js';

describe('loadingLabel', () => {
  it('shows whole percents', () => {
    expect(loadingLabel(0)).toBe('Loading 0%');
    expect(loadingLabel(0.426)).toBe('Loading 43%');
    expect(loadingLabel(1)).toBe('Loading 100%');
  });

  it('clamps out-of-range and missing progress', () => {
    expect(loadingLabel(-1)).toBe('Loading 0%');
    expect(loadingLabel(1.5)).toBe('Loading 100%');
    expect(loadingLabel(NaN)).toBe('Loading 0%');
    expect(loadingLabel(undefined)).toBe('Loading 0%');
  });
});
