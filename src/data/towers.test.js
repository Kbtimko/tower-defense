import { TOWER_DEFS } from './towers.js';
import { towerSpecAt } from '../sim/matchupValue.js';

describe('TOWER_DEFS', () => {
  const REQUIRED = ['name','icon','cost','color','range','damage','fireRate',
                    'splashRadius','pierce','slow','tier2','tier3','tier4A','tier4B','ability'];

  for (const [type, def] of Object.entries(TOWER_DEFS)) {
    it(`${type} has all required fields`, () => {
      for (const field of REQUIRED) expect(def).toHaveProperty(field);
    });
    it(`${type} all tier costs are positive`, () => {
      expect(def.cost).toBeGreaterThan(0);
      expect(def.tier2.cost).toBeGreaterThan(0);
      expect(def.tier3.cost).toBeGreaterThan(0);
      expect(def.tier4A.cost).toBeGreaterThan(0);
      expect(def.tier4B.cost).toBeGreaterThan(0);
    });
  }
});

describe('tier damage ladder', () => {
  const dps = (type, tier, branch) => {
    const s = towerSpecAt(type, tier, branch);
    return s.damage * s.fireRate;
  };
  // Barracks deals no direct damage (its soldiers do), so it has no ladder to pin.
  const attackers = Object.keys(TOWER_DEFS).filter((t) => TOWER_DEFS[t].damage > 0);

  it('every attacking tower out-damages the tier below, both T4 branches above T3', () => {
    // An empty list would make the loop below pass without asserting anything.
    expect(attackers).toContain('mage');
    expect(attackers).toHaveLength(Object.keys(TOWER_DEFS).length - 1);

    for (const type of attackers) {
      const steps = [
        ['T1<T2', dps(type, 1, null), dps(type, 2, null)],
        ['T2<T3', dps(type, 2, null), dps(type, 3, null)],
        ['T3<4A', dps(type, 3, null), dps(type, 4, 'A')],
        ['T3<4B', dps(type, 3, null), dps(type, 4, 'B')],
      ];
      for (const [label, prev, next] of steps) {
        expect(next, `${type} ${label}`).toBeGreaterThan(prev);
      }
    }
  });
});

describe('tier-4 effect data (#75)', () => {
  it('splash+slow is tier-4 only', () => {
    let walked = 0;
    for (const def of Object.values(TOWER_DEFS)) {
      if (!def.fireRate) continue; // barracks fires nothing
      const acc = { splashRadius: def.splashRadius, slow: def.slow };
      for (const key of [null, 'tier2', 'tier3']) {
        if (key) Object.assign(acc, Object.fromEntries(
          ['splashRadius', 'slow'].filter(k => def[key][k] !== undefined).map(k => [k, def[key][k]])));
        expect(acc.splashRadius > 0 && acc.slow > 0, `${def.name} ${key ?? 'tier1'}`).toBe(false);
      }
      walked++;
    }
    expect(walked).toBeGreaterThanOrEqual(5);
  });

  it('carries the tier-4 effect fields', () => {
    const D = TOWER_DEFS;
    expect(D.archer.tier4A.shots).toBe(2);
    expect(D.archer.tier4B.pierce).toBe(true);
    expect(D.mage.tier4A.chain.targets).toBe(3);
    expect(D.mage.tier4B.slow).toBe(0.7);
    expect(D.cannon.tier4A.cluster.shells).toBe(3);
    expect(D.cannon.tier4B.fireRate / D.cannon.fireRate).toBeCloseTo(3, 2);
    expect(D.cannon.tier4B.splashRadius).toBe(0);
    expect(D.ice.tier4B.slowedMult).toBe(2);
    expect(D.sniper.tier4A.bossStun).toBe(1);
  });
});

describe('Rapid Cannon tuning (#76)', () => {
  // Pins the user's measured pick from the --t4 sweep at 140 damage: map 6 x1.14,
  // map 8 x1.00 with 50% lives, map 9 x1.27. Changing it means re-running the sweep.
  it('Rapid Cannon is tuned to 140 (#76)', () => {
    expect(TOWER_DEFS.cannon.tier4B.damage).toBe(140);
    expect(TOWER_DEFS.cannon.tier4B.splashRadius).toBe(0);
  });
});
