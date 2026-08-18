import { describe, it, expect } from 'vitest';
import { previewRange } from './rangePreview.js';

describe('previewRange', () => {
  it('returns the base range when the multiplier is 1', () => {
    expect(previewRange(120, 1)).toBe(120);
  });

  it('scales by the multiplier and rounds', () => {
    expect(previewRange(200, 1.1)).toBe(220);
  });

  it('rounds a fractional result to the nearest integer', () => {
    // 115 * 1.15 = 132.25 -> 132
    expect(previewRange(115, 1.15)).toBe(132);
  });

  it('defaults the multiplier to 1 when omitted', () => {
    expect(previewRange(130)).toBe(130);
  });
});
