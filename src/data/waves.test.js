import { MAP_WAVES, totalEnemyHpForMap } from './waves.js';
import { ENEMY_DEFS } from './enemies.js';

describe('MAP_WAVES[0] (Outpost Sigma)', () => {
  const waves = MAP_WAVES[0];

  it('has exactly 10 waves', () => {
    expect(waves).toHaveLength(10);
  });

  it('contains no colossus enemies', () => {
    for (const wave of waves) {
      for (const group of wave) {
        expect(group.type).not.toBe('colossus');
      }
    }
  });

  it('final wave (index 9) contains only drones', () => {
    for (const group of waves[9]) {
      expect(group.type).toBe('drone');
    }
  });

  it('final wave has at least 15 drones total', () => {
    const total = waves[9].reduce((sum, g) => sum + g.count, 0);
    expect(total).toBeGreaterThanOrEqual(15);
  });

  it('all groups have valid type, positive count, and positive interval', () => {
    for (const wave of waves) {
      for (const group of wave) {
        expect(typeof group.type).toBe('string');
        expect(group.count).toBeGreaterThan(0);
        expect(group.interval).toBeGreaterThan(0);
      }
    }
  });
});

// Derived, never hardcoded. The hardcoded list that used to live here omitted
// `colossus` — so the suite actively asserted that a defined, art-complete
// enemy must never be spawned, which is how it stayed dead content.
const VALID_TYPES = new Set(Object.keys(ENEMY_DEFS));
const WAVE_COUNTS = { 1: 10, 2: 12, 3: 12, 4: 14, 5: 14, 6: 15, 7: 15, 8: 16, 9: 18 };

for (const [mapId, count] of Object.entries(WAVE_COUNTS)) {
  describe(`MAP_WAVES[${mapId}]`, () => {
    const waves = MAP_WAVES[Number(mapId)];

    it(`has exactly ${count} waves`, () => {
      expect(waves).toHaveLength(count);
    });

    it('all groups have a valid type, positive count, and positive interval', () => {
      for (const wave of waves) {
        for (const group of wave) {
          expect(VALID_TYPES.has(group.type)).toBe(true);
          expect(group.count).toBeGreaterThan(0);
          expect(group.interval).toBeGreaterThan(0);
        }
      }
    });
  });
}

describe('every defined enemy is reachable in play', () => {
  // The regression this guards: `colossus` was defined in ENEMY_DEFS, had art
  // generated and shipped, and was spawned by NO wave in any map — dead content
  // that nothing in the suite noticed. Any new enemy must reach a wave table.
  const spawned = new Set();
  for (const waves of Object.values(MAP_WAVES)) {
    for (const wave of waves) for (const g of wave) spawned.add(g.type);
  }

  it('spawns every type declared in ENEMY_DEFS', () => {
    const unreachable = Object.keys(ENEMY_DEFS).filter(t => !spawned.has(t));
    expect(unreachable).toEqual([]);
  });

  it('spawns nothing that ENEMY_DEFS does not define', () => {
    const undefined_ = [...spawned].filter(t => !(t in ENEMY_DEFS));
    expect(undefined_).toEqual([]);
  });
});

describe('colossus placement', () => {
  const firstMapWith = (type) =>
    Object.keys(MAP_WAVES)
      .map(Number).sort((a, b) => a - b)
      .find(mi => MAP_WAVES[mi].some(w => w.some(g => g.type === type)));

  it('debuts on map 4, the one map that previously taught nothing new', () => {
    expect(firstMapWith('colossus')).toBe(4);
  });

  it('debuts one map before the titan, as the intermediate armour rung', () => {
    expect(firstMapWith('colossus')).toBeLessThan(firstMapWith('titan'));
  });

  it('is absent from maps 0-3, which have their own introduction beats', () => {
    for (const mi of [0, 1, 2, 3]) {
      const found = MAP_WAVES[mi].flat().filter(g => g.type === 'colossus');
      expect(found, `map ${mi}`).toEqual([]);
    }
  });

  it('recurs across the back half rather than appearing on one map only', () => {
    const maps = [4, 5, 6, 7, 8, 9].filter(mi =>
      MAP_WAVES[mi].some(w => w.some(g => g.type === 'colossus')));
    expect(maps.length).toBeGreaterThanOrEqual(5);
  });

  it('is worth exactly half a titan, which is what makes the swap HP-neutral', () => {
    expect(ENEMY_DEFS.colossus.hp * 2).toBe(ENEMY_DEFS.titan.hp);
  });

  // Backlog #12 decided on 2026-08-21 that the map-7 difficulty cliff STAYS, and
  // that `maps.js` would not be retuned. The titan -> colossus swap is HP-neutral
  // but NOT difficulty-neutral: armour is flat subtraction (`max(1, dmg - armor)`),
  // so trading armour 20 for armour 15 multiplies a tower's throughput by
  // (d - 15) / (d - 20) -- 2x for a tower hitting for 25, and up to 5x for one
  // hitting at or under 20. That ratio is steepest exactly where per-hit damage is
  // lowest, which is map 7's tight economy. Measured: applying the swap to map 7
  // drops it from 3.63x to 3.35x no-barracks and 3.08x to 2.94x bought, narrowing
  // the map6 -> map7 step from +1.67 to +1.34. Map 7 is the ONLY map whose
  // no-barracks number the swap moves at all. So map 7 is held out by design.
  it('leaves map 7 alone, because backlog #12 froze that map\'s difficulty', () => {
    const found = MAP_WAVES[7].flat().filter(g => g.type === 'colossus');
    expect(found).toEqual([]);
  });

  it('still keeps map 7 titan budget at the pre-colossus baseline', () => {
    const titans = MAP_WAVES[7].flat()
      .filter(g => g.type === 'titan')
      .reduce((n, g) => n + g.count, 0);
    expect(titans).toBe(17);
  });
});

describe('totalEnemyHpForMap', () => {
  // These are the campaign's HP budget per map. Hero levelling thresholds are
  // fractions of them, so a wave-table edit that moves one of these numbers
  // moves the levelling curve with it — which is exactly what should happen,
  // but it should not happen unnoticed.
  const EXPECTED = {
    0:  8800, 1:  8120, 2: 12330, 3: 10770, 4: 18500,
    5: 18080, 6: 24440, 7: 31430, 8: 40970, 9: 59780,
  };

  for (const [mapId, hp] of Object.entries(EXPECTED)) {
    it(`map ${mapId} ships ${hp} base enemy HP`, () => {
      expect(totalEnemyHpForMap(Number(mapId))).toBe(hp);
    });
  }

  it('sums count x base hp across every group of every wave', () => {
    const byHand = MAP_WAVES[0].reduce((t, wave) =>
      t + wave.reduce((s, g) => s + ENEMY_DEFS[g.type].hp * g.count, 0), 0);
    expect(totalEnemyHpForMap(0)).toBe(byHand);
  });

  it('ignores the per-wave HP ramp, so it is a fixed property of the table', () => {
    // WaveManager scales spawned HP by 1 + waveIndex * 0.13; if that leaked in
    // here every map's total would be roughly 1.7-2.5x these numbers.
    expect(totalEnemyHpForMap(0)).toBeLessThan(15000);
  });

  it('returns 0 for a map with no wave table rather than throwing', () => {
    expect(totalEnemyHpForMap(999)).toBe(0);
  });
});

// The on-ramp is the first three maps, and it is the stretch a new player is
// judged by. Before this guard existed, map 0 shipped HARDER than map 1 on HP,
// reward rate, peak pressure and brute count -- the 2026-06-17 economy spec
// tuned each map against a board-fill curve and never compared maps to one
// another, so nothing caught the inversion.
//
// HP per wave, not total HP: maps 0 and 1 run 10 waves and map 2 runs 12, so
// totals alone would call map 2 harder purely for being longer.
//
// Scoped to maps 0-2 on purpose. Map 3 ships 898 HP per wave, BELOW map 2's
// 917, so a 0 < 1 < 2 < 3 assertion would fail. That inversion is pre-existing
// and out of scope here -- this change shrinks it from 14.5% (1028 vs 898) to
// 2.1% rather than introducing it. Extend this test past map 2 only as part of
// recalibrating maps 3-9.
describe('on-ramp difficulty ramp (maps 0-2)', () => {
  const hpPerWave = (mapId) => totalEnemyHpForMap(mapId) / MAP_WAVES[mapId].length;

  it('increases strictly from map 0 to map 1 to map 2', () => {
    const ramp = [0, 1, 2].map(hpPerWave);
    expect(ramp[0]).toBeLessThan(ramp[1]);
    expect(ramp[1]).toBeLessThan(ramp[2]);
  });

  it('makes map 0 the gentlest map in the campaign per wave', () => {
    const others = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(hpPerWave);
    for (const hp of others) expect(hpPerWave(0)).toBeLessThan(hp);
  });
});

// Map 0 is where the brute is introduced, and the archer -- what 130 starting
// gold and a naive damage-per-gold read both pick -- lands 5 DPS on one once
// flat armour and the 0.75 weakness multiplier compound. That mismatch has to
// be REVEALED on a small isolated wave before it is PUNISHED on a big mixed
// one, or the player is beaten for a reasonable inference with no warning.
describe('map 0 introduces the brute before it tests it', () => {
  const waves = MAP_WAVES[0];
  const waveHp = (w) => w.reduce((s, g) => s + ENEMY_DEFS[g.type].hp * g.count, 0);
  const bruteWaves = waves
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => w.some(g => g.type === 'brute'));

  it('debuts the brute on a wave of nothing but brutes', () => {
    expect(bruteWaves.length).toBeGreaterThan(1);
    const debut = bruteWaves[0].w;
    expect(debut.every(g => g.type === 'brute')).toBe(true);
  });

  it('makes that debut smaller than the next wave carrying brutes', () => {
    expect(waveHp(bruteWaves[0].w)).toBeLessThan(waveHp(bruteWaves[1].w));
  });
});
