import { describe, it, expect } from 'vitest';
import { revealTimes, typeDurationMs, charsShown } from './typewriter.js';
import { STORY_DIALOG } from '../data/storyDialog.js';
import { STORY_SEQUENCES } from '../data/story.js';

const cfg = STORY_DIALOG;
const T = 'Hold the line. Now!';
const len = (s) => Array.from(s).length;

describe('typewriter', () => {
  it('shows nothing at 0 and NaN', () => {
    expect(charsShown(T, 0, cfg)).toBe(0);
    expect(charsShown(T, NaN, cfg)).toBe(0);
    expect(charsShown(T, -5, cfg)).toBe(0);
  });
  it('shows everything at duration and Infinity', () => {
    expect(charsShown(T, typeDurationMs(T, cfg), cfg)).toBe(len(T));
    expect(charsShown(T, Infinity, cfg)).toBe(len(T));
  });
  it('is monotonic over a 5ms sweep', () => {
    let prev = 0;
    for (let t = 0; t <= typeDurationMs(T, cfg) + 50; t += 5) {
      const n = charsShown(T, t, cfg);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
  it('delays the char after punctuation by exactly punctPauseMs', () => {
    const withPause = revealTimes('Hi. Go', cfg);
    const without = revealTimes('Hi. Go', { ...cfg, punctPauseMs: 0 });
    expect(withPause[2]).toBe(without[2]); // the '.' itself is not delayed
    expect(withPause[3] - without[3]).toBe(cfg.punctPauseMs);
    expect(withPause[5] - without[5]).toBe(cfg.punctPauseMs);
  });
  it('has zero duration for empty text', () => {
    expect(typeDurationMs('', cfg)).toBe(0);
    expect(charsShown('', 100, cfg)).toBe(0);
  });
  it('counts an emoji as one code point', () => {
    const s = 'a😀b';
    const m = cfg.msPerChar;
    expect([1, m + 1, 2 * m + 1].map((t) => charsShown(s, t, cfg))).toEqual([1, 2, 3]);
    expect(charsShown(s, 0, cfg)).toBe(0);
    expect(revealTimes(s, cfg)).toHaveLength(3);
  });
  it('types the longest story panel in under 5000 ms', () => {
    const texts = Object.values(STORY_SEQUENCES).flatMap((s) => s.panels.map((p) => p.text));
    const longest = Math.max(...texts.map((x) => typeDurationMs(x, cfg)));
    expect(texts.length).toBeGreaterThan(0);
    expect(longest).toBeLessThan(5000);
  });
});
