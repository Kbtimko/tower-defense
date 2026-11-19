import { describe, it, expect } from 'vitest';
import { mergeSlow, mergeStun } from './statusMerge.js';

const off = { active: false, timer: 0, factor: 1 };

describe('mergeSlow', () => {
  it('takes the incoming slow when none is active', () => {
    expect(mergeSlow(off, { duration: 2, factor: 0.7 })).toEqual({ active: true, timer: 2, factor: 0.7 });
  });

  it('a stronger (lower) incoming factor replaces factor and duration', () => {
    const cur = { active: true, timer: 5, factor: 0.7 };
    expect(mergeSlow(cur, { duration: 2, factor: 0.15 })).toEqual({ active: true, timer: 2, factor: 0.15 });
  });

  it('an equal factor keeps the factor and refreshes to the longer timer', () => {
    const cur = { active: true, timer: 1, factor: 0.45 };
    expect(mergeSlow(cur, { duration: 2, factor: 0.45 })).toEqual({ active: true, timer: 2, factor: 0.45 });
    const longer = { active: true, timer: 4, factor: 0.45 };
    expect(mergeSlow(longer, { duration: 2, factor: 0.45 })).toEqual({ active: true, timer: 4, factor: 0.45 });
  });

  it('a weaker (higher) incoming factor leaves the current slow unchanged', () => {
    const cur = { active: true, timer: 0.5, factor: 0.15 };
    expect(mergeSlow(cur, { duration: 9, factor: 0.7 })).toEqual({ active: true, timer: 0.5, factor: 0.15 });
  });

  it('does not mutate its inputs', () => {
    const cur = Object.freeze({ active: true, timer: 1, factor: 0.7 });
    const inc = Object.freeze({ duration: 2, factor: 0.2 });
    expect(() => mergeSlow(cur, inc)).not.toThrow();
    expect(cur).toEqual({ active: true, timer: 1, factor: 0.7 });
  });
});

describe('mergeStun', () => {
  it('takes the incoming duration when no stun is active', () => {
    expect(mergeStun({ active: false, timer: 0 }, { duration: 1 })).toEqual({ active: true, timer: 1 });
  });

  it('ignores a stale timer on an inactive stun', () => {
    expect(mergeStun({ active: false, timer: 9 }, { duration: 1 })).toEqual({ active: true, timer: 1 });
  });

  it('keeps a longer running stun', () => {
    expect(mergeStun({ active: true, timer: 3 }, { duration: 1 })).toEqual({ active: true, timer: 3 });
  });

  it('extends a shorter running stun', () => {
    expect(mergeStun({ active: true, timer: 0.4 }, { duration: 1 })).toEqual({ active: true, timer: 1 });
  });

  it('does not mutate its inputs', () => {
    const cur = Object.freeze({ active: true, timer: 0.4 });
    expect(() => mergeStun(cur, Object.freeze({ duration: 1 }))).not.toThrow();
    expect(cur).toEqual({ active: true, timer: 0.4 });
  });
});
