import { RESULT_LINES, RESULTS, RESULT_SPEAKERS } from './results.js';
import { STORY_SPEAKERS } from './story.js';

describe('RESULT_LINES data', () => {
  it('every victory/final tier and defeat is non-empty', () => {
    for (const pool of ['victory', 'final']) {
      for (const tier of [1, 2, 3]) expect(RESULT_LINES[pool][tier].length, `${pool}.${tier}`).toBeGreaterThan(0);
    }
    expect(RESULT_LINES.defeat.length).toBeGreaterThan(0);
  });
  const all = [
    ...Object.values(RESULT_LINES.victory).flat(),
    ...Object.values(RESULT_LINES.final).flat(),
    ...RESULT_LINES.defeat,
  ];
  it('every line fits maxLineChars', () => {
    for (const l of all) expect(l.length, l).toBeLessThanOrEqual(RESULTS.maxLineChars);
  });
  it('no duplicates across pools', () => {
    expect(new Set(all).size).toBe(all.length);
  });
  it('speakers exist in STORY_SPEAKERS', () => {
    expect(Object.keys(STORY_SPEAKERS)).toContain(RESULT_SPEAKERS.victory);
    expect(Object.keys(STORY_SPEAKERS)).toContain(RESULT_SPEAKERS.defeat);
  });
});
