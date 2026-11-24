import { describe, it, expect } from 'vitest';
import { validatePicks } from './picks.js';

const job = {
  batch: 'towers',
  assets: [
    { assetId: 'tower_cannon', kind: 'sprite' },
    { assetId: 'tower_archer.t4a', kind: 'sprite' },
    { assetId: 'overworld_0_outpost_sigma', kind: 'overworld' },
  ],
};
const existing = { tower_cannon: [0, 1, 2], 'tower_archer.t4a': [0, 1], overworld_0_outpost_sigma: [0] };
const picks = (over = {}) => ({ batch: 'towers', picks: {}, flip: [], reroll: [], ...over });

describe('validatePicks', () => {
  it('accepts a well-formed picks file', () => {
    expect(validatePicks(picks({
      picks: { tower_cannon: 2, overworld_0_outpost_sigma: 0 }, flip: ['tower_cannon'], reroll: ['tower_archer.t4a'],
    }), job, existing)).toEqual([]);
  });

  it('accepts an empty picks file', () => {
    expect(validatePicks(picks(), job, existing)).toEqual([]);
  });

  it('rejects a batch mismatch', () => {
    expect(validatePicks(picks({ batch: 'heroes' }), job, existing))
      .toEqual(['picks.json is for batch "heroes", not "towers"']);
  });

  it('rejects an unknown assetId in picks, flip or reroll', () => {
    expect(validatePicks(picks({ picks: { tower_laser: 0 }, reroll: ['hero_ghost'] }), job, existing)).toEqual([
      'tower_laser: not an asset in batch "towers"',
      'hero_ghost: not an asset in batch "towers"',
    ]);
  });

  it('rejects an index with no candidate', () => {
    expect(validatePicks(picks({ picks: { tower_cannon: 7 } }), job, existing))
      .toEqual(['tower_cannon: no candidate #7']);
    expect(validatePicks(picks({ picks: { tower_cannon: 0 } }), job, { tower_cannon: [] }))
      .toEqual(['tower_cannon: no candidate #0']);
  });

  it('rejects a non-integer index', () => {
    expect(validatePicks(picks({ picks: { tower_cannon: '1' } }), job, existing))
      .toEqual(['tower_cannon: no candidate #1']);
  });

  it('rejects an asset both picked and rerolled', () => {
    expect(validatePicks(picks({ picks: { tower_cannon: 0 }, reroll: ['tower_cannon'] }), job, existing))
      .toEqual(['tower_cannon: both picked and rerolled']);
  });

  it('rejects a flip on a non-sprite asset', () => {
    expect(validatePicks(picks({ picks: { overworld_0_outpost_sigma: 0 }, flip: ['overworld_0_outpost_sigma'] }),
      job, existing)).toEqual(['overworld_0_outpost_sigma: flip applies to sprites only']);
  });

  it('rejects a flip on an unpicked asset', () => {
    expect(validatePicks(picks({ flip: ['tower_cannon'] }), job, existing))
      .toEqual(['tower_cannon: flipped but not picked']);
  });

  it('rejects a malformed file', () => {
    expect(validatePicks(null, job, existing)).toEqual(['picks.json is not an object']);
    expect(validatePicks(picks({ picks: [] }), job, existing)).toEqual(['picks must be an object of assetId -> index']);
  });
});
