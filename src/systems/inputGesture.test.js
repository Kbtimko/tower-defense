import { describe, it, expect } from 'vitest';
import { classifyGesture } from './inputGesture.js';
import { LONG_PRESS_MS, TAP_SLOP_PX } from '../data/input.js';

const base = { downMs: 1000, movedPx: 0 };
describe('classifyGesture', () => {
  it('pending while held under long-press', () => {
    expect(classifyGesture({ ...base, nowMs: 1000 + LONG_PRESS_MS - 1, released: false })).toBe('pending');
  });
  it('longpress at exactly LONG_PRESS_MS held', () => {
    expect(classifyGesture({ ...base, nowMs: 1000 + LONG_PRESS_MS, released: false })).toBe('longpress');
  });
  it('tap on release just under LONG_PRESS_MS', () => {
    expect(classifyGesture({ ...base, nowMs: 1000 + LONG_PRESS_MS - 1, released: true })).toBe('tap');
  });
  it('release at exactly LONG_PRESS_MS is neither tap nor longpress (pending)', () => {
    expect(classifyGesture({ ...base, nowMs: 1000 + LONG_PRESS_MS, released: true })).toBe('pending');
  });
  it('movement at exactly slop is not a drag', () => {
    expect(classifyGesture({ ...base, movedPx: TAP_SLOP_PX, nowMs: 1100, released: true })).toBe('tap');
  });
  it('movement just over slop is a drag, even when released', () => {
    expect(classifyGesture({ ...base, movedPx: TAP_SLOP_PX + 0.1, nowMs: 1100, released: true })).toBe('drag');
  });
  it('drag beats longpress', () => {
    expect(classifyGesture({ ...base, movedPx: 50, nowMs: 5000, released: false })).toBe('drag');
  });
  it('honours custom thresholds', () => {
    expect(classifyGesture({ ...base, nowMs: 1100, released: false, longPressMs: 100 })).toBe('longpress');
    expect(classifyGesture({ ...base, movedPx: 3, nowMs: 1010, released: true, slopPx: 2 })).toBe('drag');
  });
});
