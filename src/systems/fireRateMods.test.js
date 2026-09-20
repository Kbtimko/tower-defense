import { describe, it, expect } from 'vitest';
import { applyFireRateMod, clearFireRateMod, setBaseFireRate } from './fireRateMods.js';

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

// Regression: Tower.upgrade() assigned `fireRate` directly, so an upgrade taken
// while Overcharge/Power Surge was up left `_baseFireRate` holding the stale
// pre-upgrade rate. Clearing the buff then reverted the tower to that old rate
// permanently — a Rapid Cannon bought for 1.2 shots/s silently ran at 0.45
// (37% of the DPS paid for) for the rest of the run.
describe('setBaseFireRate — upgrading underneath an active buff', () => {
  const cannon = () => ({ fireRate: 0.45 });

  it('settles on the UPGRADED rate after the buff expires', () => {
    const t = cannon();
    applyFireRateMod(t, 'overcharge', 1.5);
    setBaseFireRate(t, 1.2);              // upgrade to Rapid Cannon mid-buff
    clearFireRateMod(t, 'overcharge');
    expect(t.fireRate).toBe(1.2);
  });

  it('keeps the buff applied to the new rate while it is still up', () => {
    const t = cannon();
    applyFireRateMod(t, 'overcharge', 1.5);
    setBaseFireRate(t, 1.2);
    expect(t.fireRate).toBeCloseTo(1.8);  // 1.2 * 1.5
  });

  it('works with no buff ever applied', () => {
    const t = cannon();
    setBaseFireRate(t, 1.2);
    expect(t.fireRate).toBe(1.2);
    expect(t._baseFireRate).toBeUndefined();
  });

  it('works after a buff has already been applied and cleared', () => {
    const t = cannon();
    applyFireRateMod(t, 'overcharge', 1.5);
    clearFireRateMod(t, 'overcharge');
    setBaseFireRate(t, 1.2);
    expect(t.fireRate).toBe(1.2);
  });

  it('still honours a second buff stacked over the upgraded rate', () => {
    const t = cannon();
    applyFireRateMod(t, 'overcharge', 1.5);
    setBaseFireRate(t, 1.2);
    applyFireRateMod(t, 'powerSurge', 2);
    expect(t.fireRate).toBeCloseTo(3.6);  // 1.2 * 1.5 * 2
    clearFireRateMod(t, 'overcharge');
    clearFireRateMod(t, 'powerSurge');
    expect(t.fireRate).toBe(1.2);
  });
});
