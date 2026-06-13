import { describe, it, expect } from 'vitest';
import {
  soldierSource,
  heroSource,
  heroAbilitySource,
  burnSource,
} from './sourceBuilders.js';

describe('source builders', () => {
  it('soldierSource carries barracks tier and branch', () => {
    const s = { barracks: { level: 3, branch: 'A' } };
    expect(soldierSource(s)).toEqual({ kind:'tower', type:'barracks', tier:3, branch:'A' });
  });

  it('heroSource accepts a heroId', () => {
    expect(heroSource('rael')).toEqual({ kind:'hero', heroId:'rael' });
    expect(heroSource('engineer')).toEqual({ kind:'hero', heroId:'engineer' });
  });

  it('heroSource defaults to rael when no heroId is passed (back-compat)', () => {
    expect(heroSource()).toEqual({ kind:'hero', heroId:'rael' });
  });

  it('heroAbilitySource carries heroId and ability label', () => {
    expect(heroAbilitySource('pyro', 'firefield'))
      .toEqual({ kind:'hero', heroId:'pyro', ability:'firefield' });
  });

  it('burnSource is a status-kind tag', () => {
    expect(burnSource()).toEqual({ kind:'status', type:'burn' });
  });
});
