import { describe, it, expect } from 'vitest';
import { createConfirmGate } from './confirmGate.js';
import { CONFIRM_WINDOW_MS } from '../data/input.js';

describe('createConfirmGate', () => {
  it('first press arms', () => {
    const g = createConfirmGate();
    expect(g.press('sell', 0)).toBe('armed');
    expect(g.armedKey).toBe('sell');
  });
  it('same key within window confirms and resets', () => {
    const g = createConfirmGate();
    g.press('sell', 0);
    expect(g.press('sell', CONFIRM_WINDOW_MS)).toBe('confirmed');
    expect(g.armedKey).toBe(null);
    expect(g.press('sell', CONFIRM_WINDOW_MS + 1)).toBe('armed');
  });
  it('press after window re-arms', () => {
    const g = createConfirmGate();
    g.press('sell', 0);
    expect(g.press('sell', CONFIRM_WINDOW_MS + 1)).toBe('armed');
    expect(g.press('sell', CONFIRM_WINDOW_MS + 2)).toBe('confirmed');
  });
  it('different key re-arms', () => {
    const g = createConfirmGate();
    g.press('a', 0);
    expect(g.press('b', 10)).toBe('armed');
    expect(g.armedKey).toBe('b');
    expect(g.press('a', 20)).toBe('armed');
  });
  it('reset disarms', () => {
    const g = createConfirmGate();
    g.press('a', 0);
    g.reset();
    expect(g.armedKey).toBe(null);
    expect(g.press('a', 10)).toBe('armed');
  });
  it('custom windowMs', () => {
    const g = createConfirmGate({ windowMs: 100 });
    g.press('a', 0);
    expect(g.press('a', 101)).toBe('armed');
  });
});
