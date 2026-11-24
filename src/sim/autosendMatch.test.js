import { describe, it, expect } from 'vitest';
import { matchesBefore } from './autosendMatch.js';

const run = (lives, won = true) => ({ won, livesRemaining: lives, wavesSurvived: 10, totalWaves: 10 });
const r = (multiplier, lives) => ({ multiplier, run: run(lives, multiplier !== null) });

describe('matchesBefore', () => {
  it('needing more damage than before is a mismatch; null is infinity', () => {
    expect(matchesBefore(r(1, 10), r(1.5, 10), 20)).toBe(false);
    expect(matchesBefore(r(1.5, 10), r(null, 0), 20)).toBe(false);
    expect(matchesBefore(r(null, 0), r(null, 0), 20)).toBe(true);
  });
  it('both winning at 1x tolerates one life lost, not two', () => {
    expect(matchesBefore(r(1, 10), r(1, 9), 20)).toBe(true);
    expect(matchesBefore(r(1, 10), r(1, 8), 20)).toBe(false);
  });
  it('a harder verdict band is a mismatch', () => {
    // 6 -> 5 lives of 20 is OK -> PUNISHING (25% kept)
    expect(matchesBefore(r(1, 6), r(1, 5), 20)).toBe(false);
  });
  it('an easier map matches', () => {
    expect(matchesBefore(r(1, 10), r(1, 19), 20)).toBe(true);
  });
});
