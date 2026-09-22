import { describe, it, expect } from 'vitest';
import { remainingEnemyWeights, towerSpecAt, towerDpsAgainst, towerValueAgainst } from './matchupValue.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';
import { waveScaleFactor } from '../systems/WaveManager.js';

const mixOf = (type) => new Map([[type, 1]]);

const waves = [
  [{ type: 'drone', count: 10, interval: 1000 }],
  [{ type: 'titan', count: 2,  interval: 1000 }],
];

describe('remainingEnemyWeights', () => {
  it('weights a type by its HP times its count', () => {
    const w = remainingEnemyWeights([[{ type: 'drone', count: 10, interval: 0 }]], 0);
    expect(w.get('drone')).toBeCloseTo(ENEMY_DEFS.drone.hp * 10);
  });

  it('counts only waves from fromWaveIndex onward', () => {
    const w = remainingEnemyWeights(waves, 1);
    expect(w.has('drone')).toBe(false);
    expect(w.get('titan')).toBeGreaterThan(0);
  });

  it('scales a later wave by ITS OWN index, not its position in the remainder', () => {
    // A slice-relative implementation would use waveScaleFactor(0) here and pass
    // every other test in this file, silently shifting every weight by one wave.
    expect(remainingEnemyWeights(waves, 1).get('titan'))
      .toBeCloseTo(ENEMY_DEFS.titan.hp * 2 * waveScaleFactor(1));
  });

  it('weighs a later wave more heavily than the same wave earlier', () => {
    // Enemy HP scales with the wave index, so an identical group arriving
    // later represents more HP and must pull the ranking harder.
    const early = remainingEnemyWeights([[{ type: 'drone', count: 1, interval: 0 }]], 0);
    const late  = remainingEnemyWeights(
      [[], [], [], [], [], [{ type: 'drone', count: 1, interval: 0 }]], 0);
    expect(late.get('drone')).toBeGreaterThan(early.get('drone'));
  });

  it('returns an empty map past the last wave', () => {
    expect(remainingEnemyWeights(waves, 99).size).toBe(0);
  });

  it('returns an empty map for a missing or empty wave table', () => {
    expect(remainingEnemyWeights(undefined, 0).size).toBe(0);
    expect(remainingEnemyWeights([], 0).size).toBe(0);
  });

  it('ignores an unknown enemy type rather than scoring it as zero HP', () => {
    const w = remainingEnemyWeights([[{ type: 'nosuch', count: 5, interval: 0 }]], 0);
    expect(w.has('nosuch')).toBe(false);
  });

  it('accumulates a type that appears in several waves', () => {
    const w = remainingEnemyWeights(
      [[{ type: 'drone', count: 1, interval: 0 }], [{ type: 'drone', count: 1, interval: 0 }]], 0);
    const one = remainingEnemyWeights([[{ type: 'drone', count: 1, interval: 0 }]], 0);
    expect(w.get('drone')).toBeGreaterThan(one.get('drone'));
  });
});

describe('towerSpecAt', () => {
  it('returns the base stat block at tier 1', () => {
    const s = towerSpecAt('archer', 1);
    expect(s.damage).toBe(TOWER_DEFS.archer.damage);
    expect(s.fireRate).toBe(TOWER_DEFS.archer.fireRate);
    expect(s.pierce).toBe(TOWER_DEFS.archer.pierce);
  });

  it('folds each tier over the last, keeping fields a tier does not redefine', () => {
    // archer tier3 sets damage but never fireRate, so fireRate must survive.
    const s = towerSpecAt('archer', 3);
    expect(s.damage).toBe(TOWER_DEFS.archer.tier3.damage);
    expect(s.fireRate).toBe(TOWER_DEFS.archer.fireRate);
  });

  it('applies the requested tier-4 branch, not the other one', () => {
    const a = towerSpecAt('sniper', 4, 'A');
    const b = towerSpecAt('sniper', 4, 'B');
    expect(a.damage).toBe(TOWER_DEFS.sniper.tier4A.damage);
    expect(b.damage).toBe(TOWER_DEFS.sniper.tier4B.damage);
    // sniper tier4B is the one that redefines fireRate.
    expect(b.fireRate).toBe(TOWER_DEFS.sniper.tier4B.fireRate);
  });
});

describe('towerDpsAgainst', () => {
  it('ranks the sniper above the archer against titans — the headline defect', () => {
    // The old towerValue ranks archer FIRST while it lands 1 damage a shot on a
    // titan. Asserted as an ordering, never a pinned number, so a retune moves
    // the values without silently gutting this test.
    const titans = mixOf('titan');
    const archer = towerDpsAgainst(towerSpecAt('archer'), titans);
    const sniper = towerDpsAgainst(towerSpecAt('sniper'), titans);
    expect(sniper).toBeGreaterThan(archer);
  });

  it('closes the sniper-over-archer DPS gap against skitters', () => {
    // Proves the ranking actually MOVES with the mix rather than being a new
    // fixed order that happens to favour the sniper. Against titans the
    // sniper leads by 35 DPS (armour and its 1.5x weakness both favour it);
    // against skitters (0 armour, archer's 1.25x beats sniper's 0.75x) the
    // gap closes to an exact tie in the live tables — not a strict flip, but
    // a real, data-verified swing toward the archer.
    const titans   = mixOf('titan');
    const skitters = mixOf('skitter');
    const archerTitanDps  = towerDpsAgainst(towerSpecAt('archer'), titans);
    const sniperTitanDps  = towerDpsAgainst(towerSpecAt('sniper'), titans);
    const archerSkitterDps = towerDpsAgainst(towerSpecAt('archer'), skitters);
    const sniperSkitterDps = towerDpsAgainst(towerSpecAt('sniper'), skitters);

    expect(sniperTitanDps - archerTitanDps).toBeGreaterThan(sniperSkitterDps - archerSkitterDps);
    expect(archerSkitterDps).toBeGreaterThanOrEqual(sniperSkitterDps);
  });

  it('credits pierce against an armoured mix', () => {
    const titans = mixOf('titan');
    const piercing = { ...towerSpecAt('archer'), pierce: true };
    expect(towerDpsAgainst(piercing, titans))
      .toBeGreaterThan(towerDpsAgainst(towerSpecAt('archer'), titans));
  });

  it('is zero against an empty mix rather than NaN', () => {
    const d = towerDpsAgainst(towerSpecAt('archer'), new Map());
    expect(d).toBe(0);
    expect(Number.isNaN(d)).toBe(false);
  });

  it('blends the mix rather than scoring only the heaviest type', () => {
    const pure  = towerDpsAgainst(towerSpecAt('archer'), mixOf('titan'));
    const mixed = towerDpsAgainst(towerSpecAt('archer'), new Map([['titan', 1], ['skitter', 1]]));
    expect(mixed).toBeGreaterThan(pure);
  });
});

describe('towerValueAgainst', () => {
  it('divides expected DPS by cost', () => {
    const mix = mixOf('brute');
    const spec = towerSpecAt('cannon');
    expect(towerValueAgainst(spec, mix))
      .toBeCloseTo(towerDpsAgainst(spec, mix) / TOWER_DEFS.cannon.cost);
  });

  it('never divides by zero for a costless spec', () => {
    const v = towerValueAgainst({ ...towerSpecAt('archer'), cost: 0 }, mixOf('brute'));
    expect(Number.isFinite(v)).toBe(true);
  });
});
