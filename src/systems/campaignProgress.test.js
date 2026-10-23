import { describe, it, expect } from 'vitest';
import { MAPS } from '../data/maps.js';
import { ACTS, OBJECTIVES } from '../data/campaign.js';
import { starsArray, frontierIndex, sectorsRetaken, actForMap, bannerFor } from './campaignProgress.js';

describe('campaign data', () => {
  it('ACTS covers every MAPS id exactly once, contiguous and in order', () => {
    expect(ACTS.flatMap(a => a.mapIds)).toEqual(MAPS.map(m => m.id));
  });
  it('every storyKey has an objective', () => {
    for (const m of MAPS) expect(OBJECTIVES[m.storyKey], m.storyKey).toMatch(/\S/);
  });
});

describe('campaignProgress', () => {
  it('frontierIndex: fresh 0, partial 3, all cleared = length', () => {
    expect(frontierIndex(Array(10).fill(0))).toBe(0);
    expect(frontierIndex([3, 2, 1, 0, 0, 0, 0, 0, 0, 0])).toBe(3);
    expect(frontierIndex(Array(10).fill(1))).toBe(10);
  });
  it('gap save counts only the contiguous prefix', () => {
    const s = [3, 0, 2, 0, 0, 0, 0, 0, 0, 0];
    expect(frontierIndex(s)).toBe(1);
    expect(sectorsRetaken(s)).toBe(1);
  });
  it('garbage star values count as uncleared', () => {
    expect(frontierIndex([3, NaN, 2])).toBe(1);
    expect(frontierIndex([3, -1, 2])).toBe(1);
    expect(frontierIndex([3, '3', 2])).toBe(1);
    expect(starsArray({ getStars: id => [3, NaN, 7][id] }, MAPS.slice(0, 3))).toEqual([3, 0, 3]);
  });
  it('actForMap at every boundary', () => {
    for (const act of ACTS) for (const id of act.mapIds) expect(actForMap(id).id).toBe(act.id);
  });
  it('banner in progress and complete', () => {
    expect(bannerFor([3, 2, 1, 0, 0, 0, 0, 0, 0, 0])).toEqual({
      act: 'ACT I · RETAKE SOL',
      objective: OBJECTIVES[MAPS[3].storyKey],
      sectors: 'Front line: 3 of 10 sectors retaken',
      complete: false,
    });
    expect(bannerFor(Array(10).fill(3))).toEqual({
      act: 'CAMPAIGN COMPLETE',
      objective: 'The war is won',
      sectors: '10 of 10 sectors retaken',
      complete: true,
    });
  });
});
