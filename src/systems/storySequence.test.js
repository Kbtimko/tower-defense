import { describe, it, expect } from 'vitest';
import { createSequence, currentPanel, advance, atEnd, isComplete } from './storySequence.js';

const seq = { panels: [{ speaker: 'rael', text: 'a' }, { speaker: 'command', text: 'b' }] };

describe('storySequence', () => {
  it('starts at index 0 on the first panel', () => {
    const s = createSequence(seq);
    expect(s.index).toBe(0);
    expect(currentPanel(s)).toEqual({ speaker: 'rael', text: 'a' });
  });

  it('atEnd is false on a non-last panel, true on the last', () => {
    const s = createSequence(seq);
    expect(atEnd(s)).toBe(false);
    expect(atEnd(advance(s))).toBe(true);
  });

  it('advance moves forward and is complete past the final panel', () => {
    let s = createSequence(seq);
    s = advance(s);                 // index 1 (last)
    expect(isComplete(s)).toBe(false);
    s = advance(s);                 // index 2 (past end)
    expect(isComplete(s)).toBe(true);
    expect(currentPanel(s)).toBe(null);
  });

  it('advance does not mutate the input state', () => {
    const s = createSequence(seq);
    advance(s);
    expect(s.index).toBe(0);
  });

  it('empty panels: currentPanel null, atEnd true, isComplete true', () => {
    const s = createSequence({ panels: [] });
    expect(currentPanel(s)).toBe(null);
    expect(atEnd(s)).toBe(true);
    expect(isComplete(s)).toBe(true);
  });

  it('single panel: atEnd true at index 0', () => {
    const s = createSequence({ panels: [{ speaker: 'rael', text: 'x' }] });
    expect(atEnd(s)).toBe(true);
    expect(isComplete(s)).toBe(false);
  });
});
