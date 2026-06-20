import { describe, it, expect } from 'vitest';
import { classifyOverworld } from './overworldState.js';

describe('classifyOverworld', () => {
  it('marks all entries locked when none are unlocked', () => {
    const entries = [
      { id: 0, unlocked: false, stars: 0 },
      { id: 1, unlocked: false, stars: 0 },
    ];
    const out = classifyOverworld(entries, 1);
    expect(out.map(n => n.state)).toEqual(['locked', 'locked']);
    expect(out.find(n => n.state === 'next')).toBeUndefined();
  });

  it('marks completed prefix and the first unbeaten unlocked map as next', () => {
    const entries = [
      { id: 0, unlocked: true,  stars: 3 },
      { id: 1, unlocked: true,  stars: 2 },
      { id: 2, unlocked: true,  stars: 0 },
      { id: 3, unlocked: false, stars: 0 },
    ];
    const out = classifyOverworld(entries, 3);
    expect(out.map(n => n.state)).toEqual(['completed', 'completed', 'next', 'locked']);
  });

  it('marks only the lowest-id unbeaten unlocked map as next; others are unlocked', () => {
    const entries = [
      { id: 0, unlocked: true, stars: 0 },
      { id: 1, unlocked: true, stars: 0 },
    ];
    const out = classifyOverworld(entries, 1);
    expect(out.map(n => n.state)).toEqual(['next', 'unlocked']);
  });

  it('has no next when every unlocked map is completed', () => {
    const entries = [
      { id: 0, unlocked: true, stars: 1 },
      { id: 1, unlocked: true, stars: 3 },
    ];
    const out = classifyOverworld(entries, 1);
    expect(out.map(n => n.state)).toEqual(['completed', 'completed']);
  });

  it('flags isFinal for the final id only', () => {
    const entries = [
      { id: 0, unlocked: true, stars: 0 },
      { id: 1, unlocked: false, stars: 0 },
    ];
    const out = classifyOverworld(entries, 1);
    expect(out.find(n => n.id === 1).isFinal).toBe(true);
    expect(out.find(n => n.id === 0).isFinal).toBe(false);
  });
});
