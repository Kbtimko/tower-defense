import { describe, it, expect } from 'vitest';
import { footprintClash, ringCrossing } from './tierLookMath.js';
import { TIER_SCALE, TIER_RING } from '../data/tierLooks.js';
import { MAPS } from '../data/maps.js';
import { SPRITE_MANIFEST } from '../data/sprites.js';
import { TOWER_DEFS } from '../data/towers.js';

const W = 1280, H = 720;
// A capped map draws its towers at the cap tier, in the variant art when declared.
const CAP_VARIANTS = { 1: ['t1'], 2: ['t2'], 3: ['t3'], 4: ['t4a', 't4b'] };
const towers = SPRITE_MANIFEST.filter((e) => e.category === 'tower');

// Every pad pair per map, upper = smaller y (ties: smaller x), per plan ruling P5.
function padPairs(map) {
  const pads = map.towerSlots.map(([nx, ny], i) => ({ i, x: nx * W, y: ny * H }));
  const out = [];
  for (let p = 0; p < pads.length; p++) {
    for (let q = p + 1; q < pads.length; q++) {
      const [upper, lower] = pads[p].y < pads[q].y || (pads[p].y === pads[q].y && pads[p].x <= pads[q].x)
        ? [pads[p], pads[q]] : [pads[q], pads[p]];
      out.push([upper, lower]);
    }
  }
  return out;
}

const at = (pad, t, v) => {
  const g = t.variants?.[v]?.ground ?? t.ground;
  return { x: pad.x, y: pad.y, footY: g.footY, width: g.width };
};

describe('tier-look pad fit (R25)', () => {
  // The pre-4.2 art clashed on 8 accepted pairs (C4), all from the tall archer.
  // The 4.2 bases are squatter and scaled to the 36px footprint, so none clash.
  it('no footprint clashes at any map cap', () => {
    // An empty tower list would pass vacuously.
    expect(towers.map((t) => t.type).sort()).toEqual(Object.keys(TOWER_DEFS).sort());
    const clashes = new Set();
    for (const map of MAPS) {
      for (const v of CAP_VARIANTS[map.maxTierAllowed]) {
        const s = TIER_SCALE.tower[v];
        for (const [u, l] of padPairs(map)) {
          for (const tu of towers) for (const tl of towers) {
            if (footprintClash(at(u, tu, v), at(l, tl, v), s)) clashes.add(`m${map.id} ${u.i}/${l.i} ${tu.type}/${tl.type} ${v}`);
          }
        }
      }
    }
    expect([...clashes].sort()).toEqual([]);
  });

  // Every tier holds the 36px footprint, so TIER_SCALE alone sets how much a
  // tier grows; a variant shrunk into its cell would read weaker than the tier below.
  it('every tower variant keeps the 36px footprint', () => {
    const widths = towers.flatMap((t) => Object.entries(t.variants ?? {}).map(([v, d]) => [`${t.type}.${v}`, d.ground.width]));
    expect(widths.map(([k]) => k).sort()).toEqual(towers.flatMap((t) => ['t2', 't3', 't4a', 't4b'].map((v) => `${t.type}.${v}`)).sort());
    for (const [k, w] of widths) expect(Math.abs(w - 36), k).toBeLessThanOrEqual(2);
  });

  it('T4 rings cross on exactly the 7 accepted pairs (Decision 6)', () => {
    const crossings = new Set();
    for (const map of MAPS.filter((m) => m.maxTierAllowed === 4)) {
      for (const [u, l] of padPairs(map)) {
        for (const v of CAP_VARIANTS[4]) for (const tu of towers) for (const tl of towers) {
          if (ringCrossing(at(u, tu, v), at(l, tl, v), TIER_RING)) crossings.add(`m${map.id} ${u.i}/${l.i}`);
        }
      }
    }
    expect([...crossings].sort()).toEqual(['m5 6/10','m5 8/13','m8 4/6','m8 12/5','m8 14/11','m9 9/2','m9 19/8'].sort());
  });

  it('no same-row pair crosses at peak breath', () => {
    let minRow = Infinity;
    for (const map of MAPS.filter((m) => m.maxTierAllowed === 4)) {
      for (const [u, l] of padPairs(map)) {
        if (u.y === l.y) minRow = Math.min(minRow, Math.abs(u.x - l.x));
      }
    }
    // Infinity would pass the bound vacuously if no same-row pair were found.
    expect(Number.isFinite(minRow)).toBe(true);
    expect(2 * TIER_RING.rx * TIER_RING.breathe.scale).toBeLessThanOrEqual(minRow);
  });
});
