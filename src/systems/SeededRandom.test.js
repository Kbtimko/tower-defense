import { SeededRandom } from './SeededRandom.js';

describe('SeededRandom', () => {
  it('next returns a float in [0, 1)', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('same seed produces same sequence', () => {
    const a = new SeededRandom(1234);
    const b = new SeededRandom(1234);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('pick returns an element from the input array', () => {
    const rng = new SeededRandom(42);
    const arr = ['x', 'y', 'z'];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('range returns an integer in [min, max]', () => {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      const v = rng.range(5, 10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});
