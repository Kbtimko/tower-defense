import { describe, it, expect } from 'vitest';
import { STARS_TITLE } from '../data/title.js';
import { STARS_MAP } from '../data/worldMap.js';
import { makeStars, advanceStars } from './starfield.js';

const W = 800;
const H = 400;

describe('makeStars', () => {
  it('same seed -> same stars; a different seed differs', () => {
    expect(makeStars(7, STARS_TITLE.layers, W, H)).toEqual(makeStars(7, STARS_TITLE.layers, W, H));
    expect(makeStars(8, STARS_TITLE.layers, W, H)).not.toEqual(makeStars(7, STARS_TITLE.layers, W, H));
  });

  it('makes each layer its count, inside the box', () => {
    const stars = makeStars(3, STARS_MAP.layers, W, H);
    STARS_MAP.layers.forEach((l, i) => expect(stars.filter(s => s.layer === i)).toHaveLength(l.count));
    for (const s of stars) {
      expect(s.x).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThan(W);
      expect(s.y).toBeGreaterThanOrEqual(0); expect(s.y).toBeLessThan(H);
    }
  });
});

describe('advanceStars', () => {
  const layers = [{ count: 1, speed: 100, size: 1, alpha: 0.5 }];

  it('drifts left by speed x dt', () => {
    const stars = [{ x: 50, y: 10, layer: 0, phase: 0 }];
    advanceStars(stars, 100, W, layers);
    expect(stars[0].x).toBeCloseTo(40);
  });

  it('wraps off the left edge to the right', () => {
    const stars = [{ x: 5, y: 10, layer: 0, phase: 0 }];
    const out = advanceStars(stars, 100, W, layers);
    expect(out).toBe(stars);
    expect(stars[0].x).toBeCloseTo(W - 5);
  });

  it('stays in bounds after 10 000 steps', () => {
    const stars = makeStars(11, STARS_TITLE.layers, W, H);
    const ys = stars.map(s => s.y);
    for (let i = 0; i < 10_000; i++) advanceStars(stars, 16.7, W, STARS_TITLE.layers);
    for (const s of stars) { expect(s.x).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThan(W); }
    expect(stars.map(s => s.y)).toEqual(ys);
  });
});

describe('star tables', () => {
  it('title has 3 parallax layers of about 160 stars', () => {
    expect(STARS_TITLE.layers).toHaveLength(3);
    const total = STARS_TITLE.layers.reduce((n, l) => n + l.count, 0);
    expect(total).toBeGreaterThanOrEqual(140);
    expect(total).toBeLessThanOrEqual(180);
  });

  it('map has 2 drift layers kept under 20% opacity (art bible 8)', () => {
    expect(STARS_MAP.layers).toHaveLength(2);
    for (const l of STARS_MAP.layers) expect(l.alpha).toBeLessThan(0.2);
  });
});
