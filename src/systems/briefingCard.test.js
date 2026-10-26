import { describe, it, expect } from 'vitest';
import { MAPS } from '../data/maps.js';
import { STORY_SEQUENCES, briefKey } from '../data/story.js';
import { MAP_WAVES } from '../data/waves.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { commandQuote, newThreats, briefingCardModel } from './briefingCard.js';

// Independent re-derivation: types first seen on this map, in appearance order.
function expectedThreats(id) {
  const seen = new Set();
  for (let m = 0; m < id; m++) {
    for (const wave of MAP_WAVES[m]) for (const g of wave) seen.add(g.type);
  }
  const out = [];
  for (const wave of MAP_WAVES[id]) {
    for (const g of wave) {
      if (seen.has(g.type)) continue;
      seen.add(g.type);
      const d = ENEMY_DEFS[g.type];
      out.push(d.flying ? `${d.name} (flying)` : d.name);
    }
  }
  return out;
}

describe('briefingCard', () => {
  it("every map's quote is the first command panel of its brief, verbatim", () => {
    for (const m of MAPS) {
      const panel = STORY_SEQUENCES[briefKey(m.storyKey)].panels.find(p => p.speaker === 'command');
      expect(commandQuote(m.storyKey)).toBe(panel.text);
      expect(panel.text.length).toBeGreaterThan(0);
    }
  });

  it('newThreats matches an independent re-derivation', () => {
    for (const m of MAPS) expect(newThreats(m.id)).toEqual(expectedThreats(m.id));
    expect(MAPS.some(m => expectedThreats(m.id).length > 0)).toBe(true);
  });

  it('a map that introduces nothing returns []', () => {
    const empty = MAPS.find(m => expectedThreats(m.id).length === 0);
    expect(empty).toBeDefined();
    expect(newThreats(empty.id)).toEqual([]);
  });

  it('flying types carry "(flying)"', () => {
    const flyer = Object.values(ENEMY_DEFS).find(d => d.flying);
    const m = MAPS.find(x => expectedThreats(x.id).includes(`${flyer.name} (flying)`));
    expect(m).toBeDefined();
    expect(newThreats(m.id)).toContain(`${flyer.name} (flying)`);
    for (const t of newThreats(m.id)) {
      const d = Object.values(ENEMY_DEFS).find(e => t.startsWith(e.name));
      expect(t.endsWith('(flying)')).toBe(!!d.flying);
    }
  });

  it('model: missionNo = id + 1, launchable by stars', () => {
    const stars = MAPS.map((_, i) => (i < 3 ? 2 : 0));
    for (const m of MAPS) {
      const c = briefingCardModel(m.id, stars);
      expect(c).toEqual({
        missionNo: m.id + 1,
        name: m.name,
        quote: commandQuote(m.storyKey),
        threats: expectedThreats(m.id),
        maxTier: m.maxTierAllowed,
        stars: stars[m.id],
        launchable: m.id === 0 || stars[m.id - 1] > 0,
        record: null,
      });
    }
    const s = MAPS.map((_, i) => Math.max(0, 3 - i));
    expect(briefingCardModel(1, s).stars).toBe(2);
    expect(briefingCardModel(0, MAPS.map(() => 0)).launchable).toBe(true);
    expect(briefingCardModel(1, MAPS.map(() => 0)).launchable).toBe(false);
  });

  it("model: record is records[mapId], or null when there's none", () => {
    const stars = MAPS.map(() => 0);
    const records = MAPS.map(() => null);
    records[2] = { livesLost: 0, timeMs: 582000 };
    expect(briefingCardModel(2, stars, records).record).toEqual({ livesLost: 0, timeMs: 582000 });
    expect(briefingCardModel(1, stars, records).record).toBeNull();
    expect(briefingCardModel(2, stars).record).toBeNull();
  });
});
