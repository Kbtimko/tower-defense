import { describe, it, expect } from 'vitest';
import { applyFireRateMod, clearFireRateMod } from './fireRateMods.js';

function makeTower(rate = 1) { return { fireRate: rate }; }

describe('fireRateMods — single ability lifecycle', () => {
  it('apply then clear restores the original fire rate', () => {
    const t = makeTower(2);
    applyFireRateMod(t, 'surge', 2);
    expect(t.fireRate).toBe(4);
    clearFireRateMod(t, 'surge');
    expect(t.fireRate).toBe(2);
  });

  it('re-applying same id does not double-stack', () => {
    const t = makeTower(1);
    applyFireRateMod(t, 'surge', 2);
    applyFireRateMod(t, 'surge', 2);
    expect(t.fireRate).toBe(2);
  });

  it('clearing an unknown id is a no-op', () => {
    const t = makeTower(1);
    applyFireRateMod(t, 'surge', 2);
    clearFireRateMod(t, 'nothing');
    expect(t.fireRate).toBe(2);
  });
});

describe('fireRateMods — concurrent abilities (the #6 regression)', () => {
  it('Surge active + Overcharge on then off leaves Surge intact', () => {
    const t = makeTower(1);
    applyFireRateMod(t, 'surge', 2);          // Surge: rate 2
    applyFireRateMod(t, 'overcharge', 1.5);    // + Overcharge: rate 3
    clearFireRateMod(t, 'overcharge');         // Overcharge off → Surge still on
    expect(t.fireRate).toBe(2);
  });

  it('Surge active + Overcharge then Surge expires leaves Overcharge intact', () => {
    const t = makeTower(1);
    applyFireRateMod(t, 'surge', 2);
    applyFireRateMod(t, 'overcharge', 1.5);
    clearFireRateMod(t, 'surge');              // Surge expires first
    expect(t.fireRate).toBe(1.5);
    clearFireRateMod(t, 'overcharge');
    expect(t.fireRate).toBe(1);
  });

  it('clearing in any order returns tower to true base', () => {
    const t = makeTower(3);
    applyFireRateMod(t, 'a', 2);
    applyFireRateMod(t, 'b', 1.5);
    applyFireRateMod(t, 'c', 1.25);
    clearFireRateMod(t, 'b');
    clearFireRateMod(t, 'a');
    clearFireRateMod(t, 'c');
    expect(t.fireRate).toBe(3);
  });
});
