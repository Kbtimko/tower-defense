import { dueStoryPanels } from './storyQueue.js';

const P = { m: { waves: { 3: { headline: 'a', body: '' }, 7: { headline: 'b', body: '' } } } };

describe('dueStoryPanels', () => {
  it('returns every unshown panel at or below throughWave, oldest first', () => {
    const due = dueStoryPanels(P, 'm', 7, new Set());
    expect(due.map(d => d.wave)).toEqual([3, 7]);
    expect(due[0].panel.headline).toBe('a');
  });

  it('excludes panels above throughWave', () => {
    expect(dueStoryPanels(P, 'm', 6, new Set()).map(d => d.wave)).toEqual([3]);
  });

  it('excludes shown waves', () => {
    expect(dueStoryPanels(P, 'm', 7, new Set([3])).map(d => d.wave)).toEqual([7]);
  });

  it('empty for an unknown storyKey or a map without waves', () => {
    expect(dueStoryPanels(P, 'x', 9, new Set())).toEqual([]);
    expect(dueStoryPanels({ m: {} }, 'm', 9, new Set())).toEqual([]);
  });

  it('sorts numerically, not lexically', () => {
    const panels = { m: { waves: { 10: { headline: 'x', body: '' }, 5: { headline: 'y', body: '' } } } };
    expect(dueStoryPanels(panels, 'm', 10, new Set()).map(d => d.wave)).toEqual([5, 10]);
  });
});
