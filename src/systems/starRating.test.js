import { starsFor } from './starRating.js';
import { STAR_RULE } from '../data/results.js';
import { MAPS } from '../data/maps.js';

describe('starsFor', () => {
  it('matches the old inline expression for every map and every lives value', () => {
    const oracle = (p) => (p >= 0.8 ? 3 : p >= 0.5 ? 2 : 1);
    for (const m of MAPS) {
      for (let lives = 0; lives <= 2 * m.startLives; lives++) {
        expect(starsFor(lives, m.startLives), `${m.startLives}:${lives}`).toBe(oracle(lives / m.startLives));
      }
    }
  });

  it.each([[16, 20, 3], [15, 20, 2], [10, 20, 2], [9, 20, 1], [12, 15, 3]])(
    'boundary %i/%i -> %i', (l, s, e) => expect(starsFor(l, s)).toBe(e));

  it('non-finite inputs fall to the floor', () => {
    expect(starsFor(NaN, 20)).toBe(1);
    expect(starsFor(5, 0)).toBe(1);
    expect(starsFor(5, Infinity)).toBe(1);
  });

  it('STAR_RULE is best-first with valid ratios and floor 1', () => {
    const t = STAR_RULE.thresholds;
    for (let i = 0; i < t.length; i++) {
      expect(t[i].minRatio).toBeGreaterThan(0);
      expect(t[i].minRatio).toBeLessThanOrEqual(1);
      expect(t[i].stars).toBeGreaterThanOrEqual(1);
      expect(t[i].stars).toBeLessThanOrEqual(3);
      if (i > 0) {
        expect(t[i].stars).toBeLessThan(t[i - 1].stars);
        expect(t[i].minRatio).toBeLessThan(t[i - 1].minRatio);
      }
    }
    expect(STAR_RULE.floor).toBe(1);
  });
});
