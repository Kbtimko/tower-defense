import { getWeaknessMultiplier, WEAKNESS_MATRIX, TIER4_OVERRIDES, describeMatchups, describeEnemyMatchups } from './weaknessMatrix.js';
import { HEROES } from './heroes.js';

describe('getWeaknessMultiplier — defaults', () => {
  it('returns 1.0 for null source', () => {
    expect(getWeaknessMultiplier(null, 'titan')).toBe(1.0);
  });
  it('returns 1.0 for undefined source', () => {
    expect(getWeaknessMultiplier(undefined, 'titan')).toBe(1.0);
  });
  it('returns 1.0 for unknown enemy type', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'cannon', tier: 1, branch: null }, 'unknown-enemy')).toBe(1.0);
  });
  it('returns 1.0 for unknown tower type', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'unknown-tower', tier: 1, branch: null }, 'titan')).toBe(1.0);
  });
  it('returns 1.0 for tower row with no entry for that enemy', () => {
    // archer has no `drone` entry
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'archer', tier: 1, branch: null }, 'drone')).toBe(1.0);
  });
});

describe('getWeaknessMultiplier — base matrix', () => {
  it('cannon vs brute = 1.5', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'cannon', tier: 1, branch: null }, 'brute')).toBe(1.5);
  });
  it('cannon vs phantom = 0.5', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'cannon', tier: 1, branch: null }, 'phantom')).toBe(0.5);
  });
  it('sniper vs titan = 1.5', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 1, branch: null }, 'titan')).toBe(1.5);
  });
  it('mage vs phantom = 1.5', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'mage', tier: 1, branch: null }, 'phantom')).toBe(1.5);
  });
  it('archer vs titan = 0.5', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'archer', tier: 1, branch: null }, 'titan')).toBe(0.5);
  });
});

describe('getWeaknessMultiplier — Tier 4 overrides', () => {
  it('sniper-A vs titan = 2.5 (override replaces base 1.5)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 4, branch: 'A' }, 'titan')).toBe(2.5);
  });
  it('sniper-A vs colossus = 2.0 (override)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 4, branch: 'A' }, 'colossus')).toBe(2.0);
  });
  it('sniper-A vs skitter = 0.75 (no override → falls through to base)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 4, branch: 'A' }, 'skitter')).toBe(0.75);
  });
  it('sniper-B vs titan = 1.5 (B has no overrides → falls through to base)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 4, branch: 'B' }, 'titan')).toBe(1.5);
  });
  it('cannon-A vs skitter = 2.0 (override)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'cannon', tier: 4, branch: 'A' }, 'skitter')).toBe(2.0);
  });
  it('archer-B vs brute = 1.25 (Marksman armor-piercing)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'archer', tier: 4, branch: 'B' }, 'brute')).toBe(1.25);
  });
  it('mage-B vs colossus = 1.5 (Frost Mage Shatter synergy)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'mage', tier: 4, branch: 'B' }, 'colossus')).toBe(1.5);
  });
  it('ice-B vs brute = 1.5 (Shatter)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'ice', tier: 4, branch: 'B' }, 'brute')).toBe(1.5);
  });
});

describe('getWeaknessMultiplier — Tier 2/3 inherit base row', () => {
  it('sniper tier 2 vs titan = 1.5 (no overrides apply at tier 2)', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 2, branch: null }, 'titan')).toBe(1.5);
  });
  it('sniper tier 3 vs titan = 1.5', () => {
    expect(getWeaknessMultiplier({ kind: 'tower', type: 'sniper', tier: 3, branch: null }, 'titan')).toBe(1.5);
  });
});

describe('getWeaknessMultiplier — hero source', () => {
  it('rael vs phantom = 1.5', () => {
    expect(getWeaknessMultiplier({ kind: 'hero', heroId: 'rael' }, 'phantom')).toBe(1.5);
  });
  it('rael vs brute = 1.0 (no entry)', () => {
    expect(getWeaknessMultiplier({ kind: 'hero', heroId: 'rael' }, 'brute')).toBe(1.0);
  });
  it('hero with ability field still uses hero table', () => {
    expect(getWeaknessMultiplier({ kind: 'hero', heroId: 'rael', ability: 'airstrike' }, 'phantom')).toBe(1.5);
  });
  it('rael vs titan = 1.0 (no titan entry; tower matrix is not consulted)', () => {
    expect(getWeaknessMultiplier({ kind: 'hero', heroId: 'rael' }, 'titan')).toBe(1.0);
  });
});

describe('matrix shape sanity', () => {
  it('WEAKNESS_MATRIX has rows for all 6 towers', () => {
    for (const t of ['archer', 'mage', 'cannon', 'ice', 'sniper', 'barracks']) {
      expect(WEAKNESS_MATRIX[t]).toBeDefined();
    }
  });
  it('TIER4_OVERRIDES uses A/B branch keys only', () => {
    for (const tower of Object.keys(TIER4_OVERRIDES)) {
      for (const branch of Object.keys(TIER4_OVERRIDES[tower])) {
        expect(['A', 'B']).toContain(branch);
      }
    }
  });
  it('HEROES.rael.matchups only references known enemy types', () => {
    const known = ['drone', 'skitter', 'brute', 'colossus', 'phantom', 'titan'];
    for (const enemy of Object.keys(HEROES.rael.matchups)) {
      expect(known).toContain(enemy);
    }
  });
});

describe('describeMatchups', () => {
  it('returns empty effective/weak for unknown source', () => {
    expect(describeMatchups(null)).toEqual({ effective: [], weak: [] });
  });

  it('archer base row → effective skitter/phantom, weak brute/colossus/titan', () => {
    const result = describeMatchups({ kind: 'tower', type: 'archer', tier: 1, branch: null });
    expect(result.effective.sort()).toEqual(['phantom', 'skitter']);
    expect(result.weak.sort()).toEqual(['brute', 'colossus', 'titan']);
  });

  it('cannon base row → effective brute/colossus/titan, weak drone/skitter/phantom', () => {
    const result = describeMatchups({ kind: 'tower', type: 'cannon', tier: 1, branch: null });
    expect(result.effective.sort()).toEqual(['brute', 'colossus', 'titan']);
    expect(result.weak.sort()).toEqual(['drone', 'phantom', 'skitter']);
  });

  it('ice base row → effective empty, weak titan only', () => {
    const result = describeMatchups({ kind: 'tower', type: 'ice', tier: 1, branch: null });
    expect(result.effective).toEqual([]);
    expect(result.weak).toEqual(['titan']);
  });

  it('Tier-4A sniper folds override → titan moves into effective', () => {
    const result = describeMatchups({ kind: 'tower', type: 'sniper', tier: 4, branch: 'A' });
    expect(result.effective).toContain('titan');
    expect(result.effective).toContain('colossus');
    expect(result.effective).toContain('brute'); // base 1.25 stays effective
  });

  it('Tier-4B sniper (no overrides) matches base row', () => {
    const base   = describeMatchups({ kind: 'tower', type: 'sniper', tier: 1, branch: null });
    const tier4B = describeMatchups({ kind: 'tower', type: 'sniper', tier: 4, branch: 'B' });
    expect(tier4B.effective.sort()).toEqual(base.effective.sort());
    expect(tier4B.weak.sort()).toEqual(base.weak.sort());
  });

  it('hero source → effective phantom, weak empty', () => {
    const result = describeMatchups({ kind: 'hero', heroId: 'rael' });
    expect(result.effective).toEqual(['phantom']);
    expect(result.weak).toEqual([]);
  });
});

describe('describeEnemyMatchups', () => {
  it('drone → vulnerableTo [hero:pyro, hero:scout, mage], resists [cannon]', () => {
    const r = describeEnemyMatchups('drone');
    expect(r.vulnerableTo.sort()).toEqual(['hero:pyro', 'hero:scout', 'mage']);
    expect(r.resists.sort()).toEqual(['cannon']);
  });

  it('skitter → vulnerableTo [archer, barracks, hero:pyro], resists [cannon, sniper]', () => {
    const r = describeEnemyMatchups('skitter');
    expect(r.vulnerableTo.sort()).toEqual(['archer', 'barracks', 'hero:pyro']);
    expect(r.resists.sort()).toEqual(['cannon', 'sniper']);
  });

  it('brute → vulnerableTo [barracks, cannon, hero:engineer, hero:pyro, sniper], resists [archer]', () => {
    const r = describeEnemyMatchups('brute');
    expect(r.vulnerableTo.sort()).toEqual(['barracks', 'cannon', 'hero:engineer', 'hero:pyro', 'sniper']);
    expect(r.resists.sort()).toEqual(['archer']);
  });

  it('colossus → vulnerableTo [cannon, hero:engineer, mage, sniper], resists [archer]', () => {
    const r = describeEnemyMatchups('colossus');
    expect(r.vulnerableTo.sort()).toEqual(['cannon', 'hero:engineer', 'mage', 'sniper']);
    expect(r.resists.sort()).toEqual(['archer']);
  });

  it('phantom → vulnerableTo [archer, hero:rael, hero:scout, mage], resists [barracks, cannon, sniper]', () => {
    const r = describeEnemyMatchups('phantom');
    expect(r.vulnerableTo.sort()).toEqual(['archer', 'hero:rael', 'hero:scout', 'mage']);
    expect(r.resists.sort()).toEqual(['barracks', 'cannon', 'sniper']);
  });

  it('titan → vulnerableTo [cannon, hero:engineer, mage, sniper], resists [archer, barracks, hero:pyro, hero:scout, ice]', () => {
    const r = describeEnemyMatchups('titan');
    expect(r.vulnerableTo.sort()).toEqual(['cannon', 'hero:engineer', 'mage', 'sniper']);
    expect(r.resists.sort()).toEqual(['archer', 'barracks', 'hero:pyro', 'hero:scout', 'ice']);
  });

  it('unknown enemy → empty arrays', () => {
    expect(describeEnemyMatchups('unknown')).toEqual({ vulnerableTo: [], resists: [] });
  });

  it('hero:rael appears in phantom vulnerableTo (matchups phantom: 1.5)', () => {
    expect(describeEnemyMatchups('phantom').vulnerableTo).toContain('hero:rael');
  });

  it('hero:rael is NOT in any other enemy\'s vulnerableTo today', () => {
    for (const e of ['drone', 'skitter', 'brute', 'colossus', 'titan']) {
      expect(describeEnemyMatchups(e).vulnerableTo).not.toContain('hero:rael');
    }
  });
});

describe('hero matchups read from HEROES registry', () => {
  it('rael phantom matchup is the value from the HEROES registry', () => {
    // Coupling assertion — proves the matrix actually reads the registry,
    // not a duplicated literal. If HEROES.rael.matchups.phantom is retuned,
    // getWeaknessMultiplier must track it.
    expect(getWeaknessMultiplier({ kind:'hero', heroId:'rael' }, 'phantom'))
      .toBe(HEROES.rael.matchups.phantom);
    expect(HEROES.rael.matchups.phantom).toBe(1.5);
  });

  it('unknown heroId returns 1.0', () => {
    expect(getWeaknessMultiplier({ kind:'hero', heroId:'unknown' }, 'phantom')).toBe(1.0);
  });

  it('status source returns 1.0 (no double-dipping)', () => {
    expect(getWeaknessMultiplier({ kind:'status', type:'burn' }, 'titan')).toBe(1.0);
  });

  it('legacy hero source with no heroId returns 1.0', () => {
    expect(getWeaknessMultiplier({ kind:'hero' }, 'phantom')).toBe(1.0);
  });
});

describe('describeEnemyMatchups walks all heroes in HERO_ORDER', () => {
  it('phantom shows rael as vulnerable-to via hero:rael', () => {
    const { vulnerableTo } = describeEnemyMatchups('phantom');
    expect(vulnerableTo).toContain('hero:rael');
  });
});
