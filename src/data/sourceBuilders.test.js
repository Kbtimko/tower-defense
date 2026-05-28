import { soldierSource, heroSource, heroAirstrikeSource } from './sourceBuilders.js';

describe('soldierSource', () => {
  it('reads tier and branch from soldier.barracks', () => {
    const soldier = { barracks: { level: 1, branch: null } };
    expect(soldierSource(soldier))
      .toEqual({ kind: 'tower', type: 'barracks', tier: 1, branch: null });
  });
  it('Tier 4A barracks (Vanguard) propagates branch', () => {
    const soldier = { barracks: { level: 4, branch: 'A' } };
    expect(soldierSource(soldier))
      .toEqual({ kind: 'tower', type: 'barracks', tier: 4, branch: 'A' });
  });
});

describe('heroSource / heroAirstrikeSource', () => {
  it('heroSource → kind hero, no ability field', () => {
    expect(heroSource()).toEqual({ kind: 'hero' });
  });
  it('heroAirstrikeSource → kind hero with ability "airstrike"', () => {
    expect(heroAirstrikeSource()).toEqual({ kind: 'hero', ability: 'airstrike' });
  });
});
