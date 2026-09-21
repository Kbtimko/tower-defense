import { describe, it, expect } from 'vitest';
import { summarizeWave, waveCount } from './wavePreview.js';
import { MAP_WAVES }  from '../data/waves.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { MAPS }       from '../data/maps.js';

describe('summarizeWave', () => {
  it('summarises a single-type wave', () => {
    const wave0Total = MAP_WAVES[0][0].reduce((n, g) => n + g.count, 0);
    const s = summarizeWave(0, 0);
    expect(s.waveNumber).toBe(1);            // 1-based for display: pins structure, not balance
    expect(s.totalCount).toBe(wave0Total);
    expect(s.groups.length).toBe(1);
    expect(s.groups[0].type).toBe('drone');
    expect(s.groups[0].count).toBe(wave0Total);
    expect(s.groups[0].hp).toBe(ENEMY_DEFS.drone.hp);
    expect(s.groups[0].vulnerableTo).toBeDefined();
  });

  it('summarises a multi-type wave in authored order', () => {
    const wave1Total = MAP_WAVES[0][1].reduce((n, g) => n + g.count, 0);
    const s = summarizeWave(0, 1);
    expect(s.groups.map(g => g.type)).toEqual(['drone', 'skitter']);
    expect(s.totalCount).toBe(wave1Total);
  });

  it('returns null for an out-of-range wave index', () => {
    expect(summarizeWave(0, 999)).toBeNull();
    expect(summarizeWave(0, -1)).toBeNull();
  });

  it('returns null for a non-integer wave index', () => {
    expect(summarizeWave(0, 1.5)).toBeNull();
    expect(summarizeWave(0, '0')).toBeNull();
    expect(summarizeWave(0, NaN)).toBeNull();
    expect(summarizeWave(0, undefined)).toBeNull();
  });

  it('returns null for an unknown map', () => {
    expect(summarizeWave(99, 0)).toBeNull();
  });

  it('sums counts when one wave lists the same type twice', () => {
    const fake = [[{ type: 'drone', count: 3 }, { type: 'drone', count: 4 }]];
    const s = summarizeWave(0, 0, { waves: fake });
    expect(s.groups.length).toBe(1);
    expect(s.groups[0].count).toBe(7);
  });

  it('does not alias ENEMY_DEFS or MAP_WAVES: mutating a returned group is inert', () => {
    const originalCount = MAP_WAVES[0][0][0].count;
    const originalHp = ENEMY_DEFS.drone.hp;
    const s = summarizeWave(0, 0);
    s.groups[0].count = 9999;
    expect(MAP_WAVES[0][0][0].count).toBe(originalCount);
    expect(ENEMY_DEFS.drone.hp).toBe(originalHp);
  });

  it('does not reach the prototype chain for an inherited map id', () => {
    expect(summarizeWave('toString', 0)).toBeNull();
    expect(summarizeWave('constructor', 0)).toBeNull();
  });

  it('honours an explicit { waves } override even for an unknown map id', () => {
    const fake = [[{ type: 'drone', count: 2 }]];
    const s = summarizeWave(999, 0, { waves: fake });
    expect(s).not.toBeNull();
    expect(s.totalCount).toBe(2);
  });

  it('treats an explicit empty { waves: [] } as no waves, not "use the real table"', () => {
    expect(summarizeWave(0, 0, { waves: [] })).toBeNull();
  });
});

describe('waveCount', () => {
  it('reads the real length per map, which is not always 10', () => {
    expect(waveCount(0)).toBe(10);
    expect(waveCount(9)).toBe(18);
  });

  it('returns 0 for an unknown map', () => {
    expect(waveCount(99)).toBe(0);
  });

  it('does not reach the prototype chain for an inherited map id', () => {
    expect(waveCount('constructor')).toBe(0);
    expect(waveCount('toString')).toBe(0);
  });

  it('honours an explicit { waves } override even for an unknown map id', () => {
    expect(waveCount(999, { waves: [[], []] })).toBe(2);
  });
});

// Data invariants. These guard the preview against future wave edits.
describe('MAP_WAVES invariants', () => {
  it('every enemy type used in a wave exists in ENEMY_DEFS', () => {
    const known = new Set(Object.keys(ENEMY_DEFS));
    for (const [mapId, waves] of Object.entries(MAP_WAVES)) {
      waves.forEach((wave, i) => {
        for (const group of wave) {
          expect(known.has(group.type), `map ${mapId} wave ${i}: unknown type ${group.type}`).toBe(true);
        }
      });
    }
  });

  it('no wave lists the same enemy type twice', () => {
    for (const [mapId, waves] of Object.entries(MAP_WAVES)) {
      waves.forEach((wave, i) => {
        const types = wave.map(g => g.type);
        expect(new Set(types).size, `map ${mapId} wave ${i} repeats a type`).toBe(types.length);
      });
    }
  });

  // maps.js carries its own waveCount; MAP_WAVES is what actually spawns.
  // Two sources of truth, so assert they agree.
  it('maps.js waveCount agrees with MAP_WAVES length', () => {
    for (const m of MAPS) {
      expect(m.waveCount, `map ${m.id}`).toBe(MAP_WAVES[m.id].length);
    }
  });

  it('every summary is renderable for every wave of every map', () => {
    for (const m of MAPS) {
      for (let i = 0; i < waveCount(m.id); i++) {
        const s = summarizeWave(m.id, i);
        expect(s, `map ${m.id} wave ${i}`).not.toBeNull();
        expect(s.totalCount).toBeGreaterThan(0);
        expect(s.groups.length).toBeGreaterThan(0);
      }
    }
  });
});
