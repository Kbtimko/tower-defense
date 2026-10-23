import { describe, it, expect } from 'vitest';
import { buildItems, ringItems, ringHub, unlockMapNumber, previewRadius } from './radialItems.js';
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';
import { sellRefund } from './TowerPlacementManager.js';
import { RING_ANGLES, buildAngles } from '../data/radial.js';

const types = Object.keys(TOWER_DEFS);
const tower = (type, level, branch = null, totalCost = TOWER_DEFS[type].cost) => ({
  type, level, branch, totalCost, damage: 12, range: 120,
  soldierStats: { count: 3, hp: 25, damage: 35 },
});
const mapWith = (maxTierAllowed) => ({ maxTierAllowed });
const byId = (items, id) => items.find(i => i.id === id);

describe('unlockMapNumber', () => {
  it('is the 1-based index of the first map whose cap reaches the tier (derived from MAPS)', () => {
    for (const tier of [2, 3, 4]) {
      expect(unlockMapNumber(tier, MAPS)).toBe(MAPS.findIndex(m => m.maxTierAllowed >= tier) + 1);
    }
  });
  it('matches the spec examples on the shipped data (T3 -> Map 3, T4 -> Map 5)', () => {
    expect(unlockMapNumber(3, MAPS)).toBe(3);
    expect(unlockMapNumber(4, MAPS)).toBe(5);
  });
  it('follows the maps passed in, not the shipped data', () => {
    expect(unlockMapNumber(4, [{ maxTierAllowed: 2 }, { maxTierAllowed: 4 }])).toBe(2);
  });
  it('is null when no map reaches the tier', () => {
    expect(unlockMapNumber(4, [{ maxTierAllowed: 2 }])).toBeNull();
  });
});

describe('buildItems', () => {
  it('has one item per tower def, in def order, on the build angles', () => {
    const items = buildItems({ towerDefs: TOWER_DEFS, gold: 0 });
    expect(items.map(i => i.id)).toEqual(types.map(t => `build:${t}`));
    expect(items.map(i => i.slot)).toEqual(buildAngles(types.length));
  });
  it('carries cost, label, icon and an aria label naming tower and gold', () => {
    const i = byId(buildItems({ towerDefs: TOWER_DEFS, gold: 999 }), 'build:archer');
    expect(i).toMatchObject({ cost: TOWER_DEFS.archer.cost, label: `${TOWER_DEFS.archer.cost}g`, icon: TOWER_DEFS.archer.icon, variant: 'currency', state: 'ready', towerType: 'archer' });
    expect(i.ariaLabel).toBe(`Build Archer, ${TOWER_DEFS.archer.cost} gold`);
  });
  it('is disabled below cost, ready at cost, ready above cost (boundary gold === cost)', () => {
    for (const t of types) {
      const c = TOWER_DEFS[t].cost;
      expect(byId(buildItems({ towerDefs: TOWER_DEFS, gold: c - 1 }), `build:${t}`).state).toBe('disabled');
      expect(byId(buildItems({ towerDefs: TOWER_DEFS, gold: c }), `build:${t}`).state).toBe('ready');
      expect(byId(buildItems({ towerDefs: TOWER_DEFS, gold: c + 1 }), `build:${t}`).state).toBe('ready');
    }
  });
  it('is all disabled at zero gold', () => {
    expect(buildItems({ towerDefs: TOWER_DEFS, gold: 0 }).every(i => i.state === 'disabled')).toBe(true);
  });
  it('prices with the cost multiplier the placement manager applies', () => {
    const i = byId(buildItems({ towerDefs: TOWER_DEFS, gold: 1000, costMult: 0.5 }), 'build:archer');
    expect(i.cost).toBe(Math.round(TOWER_DEFS.archer.cost * 0.5));
  });
});

describe('ringItems', () => {
  const ring = (t, gold, cap) => ringItems({ tower: t, towerDefs: TOWER_DEFS, map: mapWith(cap), maps: MAPS, gold });

  for (const type of types) {
    const def = TOWER_DEFS[type];
    for (const cap of [2, 3, 4]) {
      for (const level of [1, 2]) {
        const next = level + 1;
        const cost = def[`tier${next}`].cost;
        const allowed = next <= cap;
        it(`${type} L${level} cap ${cap}: upgrade ${allowed ? 'buyable' : 'locked'}`, () => {
          for (const [gold, expected] of [[cost - 1, 'disabled'], [cost, 'ready'], [cost + 1, 'ready']]) {
            const up = byId(ring(tower(type, level), gold, cap), 'upgrade');
            expect(up.cost).toBe(cost);
            if (allowed) {
              expect(up.state).toBe(expected);
              expect(up.label).toBe(`⬆ ${def[`tier${next}`].label}`);
              // Spec "Items per ring": label + cost, so the price is visible before a tap.
              expect(up.costLabel).toBe(`${cost}g`);
            } else {
              expect(up.state).toBe('locked');
              expect(up.label).toBe(`🔒 Map ${unlockMapNumber(next, MAPS)}`);
              expect(up.costLabel).toBeUndefined();
            }
          }
        });
      }
      it(`${type} L3 cap ${cap}: branches ${cap >= 4 ? 'buyable' : 'locked'}, no upgrade item`, () => {
        for (const [gold, expected] of [[def.tier4A.cost - 1, 'disabled'], [def.tier4A.cost, 'ready'], [def.tier4A.cost + 1, 'ready']]) {
          const items = ring(tower(type, 3), gold, cap);
          expect(byId(items, 'upgrade')).toBeUndefined();
          for (const b of ['A', 'B']) {
            const it4 = byId(items, `branch${b}`);
            expect(it4.cost).toBe(def[`tier4${b}`].cost);
            if (cap >= 4) {
              expect(it4.state).toBe(expected);
              expect(it4.label).toBe(def[`tier4${b}`].label);
              expect(it4.costLabel).toBe(`${def[`tier4${b}`].cost}g`);
              expect(it4.slot).toBe(RING_ANGLES[`branch${b}`]);
            } else {
              expect(it4.state).toBe('locked');
              expect(it4.label).toBe(`🔒 Map ${unlockMapNumber(4, MAPS)}`);
              expect(it4.costLabel).toBeUndefined();
            }
          }
        }
      });
      it(`${type} L4 cap ${cap}: MAX and maxed`, () => {
        const items = ring(tower(type, 4, 'A'), 9999, cap);
        expect(byId(items, 'upgrade')).toMatchObject({ label: 'MAX', state: 'maxed', cost: null });
        expect(byId(items, 'branchA')).toBeUndefined();
      });
    }

    it(`${type}: sell refund is the shared sellRefund, reposition only for barracks`, () => {
      const t = tower(type, 2, null, 137);
      const items = ring(t, 0, 4);
      expect(byId(items, 'sell')).toMatchObject({ variant: 'danger', state: 'ready', label: `💰 +${sellRefund(137)}g`, slot: RING_ANGLES.sell });
      const rep = byId(items, 'reposition');
      if (type === 'barracks') expect(rep).toMatchObject({ variant: 'primary', state: 'ready', label: '↻ Move', slot: RING_ANGLES.reposition });
      else expect(rep).toBeUndefined();
    });
  }

  it('barracks T3 on a tier-4 map offers both branches (#44)', () => {
    const items = ring(tower('barracks', 3), 1000, 4);
    expect(byId(items, 'branchA').label).toBe(TOWER_DEFS.barracks.tier4A.label);
    expect(byId(items, 'branchB').label).toBe(TOWER_DEFS.barracks.tier4B.label);
  });
  it('every item has the documented fields', () => {
    for (const i of ring(tower('barracks', 3), 1000, 4)) {
      expect(i).toEqual(expect.objectContaining({ id: expect.any(String), slot: expect.any(Number), label: expect.any(String), variant: expect.stringMatching(/^(currency|danger|primary|neutral)$/), state: expect.stringMatching(/^(ready|disabled|locked|maxed)$/), ariaLabel: expect.any(String) }));
    }
  });
  it('no two items share a slot', () => {
    const slots = ring(tower('barracks', 3), 1000, 4).map(i => i.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });
  it('uses the passed maps for the lock number', () => {
    const up = ringItems({ tower: tower('archer', 1), towerDefs: TOWER_DEFS, map: mapWith(1), maps: [{ maxTierAllowed: 1 }, { maxTierAllowed: 2 }], gold: 999 }).find(i => i.id === 'upgrade');
    expect(up.label).toBe('🔒 Map 2');
  });
});

describe('ringHub', () => {
  it('shows tier, damage and range for a firing tower', () => {
    expect(ringHub(tower('archer', 2))).toEqual(['T2', 'DMG 12', 'RNG 120']);
  });
  it('shows the branch label at tier 4', () => {
    expect(ringHub(tower('archer', 4, 'B'))[0]).toBe(TOWER_DEFS.archer.tier4B.label);
  });
  it('shows squad size x HP and damage for barracks', () => {
    expect(ringHub(tower('barracks', 1))).toEqual(['T1', '3× 25HP', 'DMG 35']);
  });
});

describe('previewRadius', () => {
  const build = byId(buildItems({ towerDefs: TOWER_DEFS, gold: 999 }), 'build:archer');
  it('build item: base range scaled by the range multiplier, rounded like Tower', () => {
    expect(previewRadius(build, { rangeMult: 1.1 })).toBe(Math.round(TOWER_DEFS.archer.range * 1.1));
  });
  it('upgrade whose range differs previews the new range', () => {
    const up = byId(ringItems({ tower: tower('archer', 1), towerDefs: TOWER_DEFS, map: mapWith(4), maps: MAPS, gold: 999 }), 'upgrade');
    expect(previewRadius(up, { rangeMult: 1, currentRange: TOWER_DEFS.archer.range })).toBe(TOWER_DEFS.archer.tier2.range);
  });
  it('is null when the range is unchanged, absent, or the item is not a range item', () => {
    const volley = byId(ringItems({ tower: tower('archer', 3), towerDefs: TOWER_DEFS, map: mapWith(4), maps: MAPS, gold: 999 }), 'branchA');
    expect(previewRadius(volley, { rangeMult: 1, currentRange: 150 })).toBeNull();
    const up = byId(ringItems({ tower: tower('archer', 1), towerDefs: TOWER_DEFS, map: mapWith(4), maps: MAPS, gold: 999 }), 'upgrade');
    expect(previewRadius(up, { rangeMult: 1, currentRange: TOWER_DEFS.archer.tier2.range })).toBeNull();
    const sell = byId(ringItems({ tower: tower('archer', 1), towerDefs: TOWER_DEFS, map: mapWith(4), maps: MAPS, gold: 999 }), 'sell');
    expect(previewRadius(sell, { rangeMult: 1, currentRange: 120 })).toBeNull();
  });
});
