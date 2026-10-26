import { describe, it, expect } from 'vitest';
import { resultsModel, pickResultLine, longestResultLine } from './resultsModel.js';
import { RESULT_LINES, RESULTS_COPY } from '../data/results.js';
import { MAPS } from '../data/maps.js';
import { STORY_SPEAKERS } from '../data/story.js';

const win = (o = {}) => ({
  result: 'victory', mapId: 2, lives: 17, startLives: 22, stars: 2, kills: 214,
  goldEarned: 3480, timeMs: 582000, wave: 10, waveCount: 10,
  newBest: { livesLost: false, time: false }, ...o,
});
const loss = (o = {}) => ({
  result: 'defeat', mapId: 2, lives: 0, startLives: 22, stars: 0, kills: 5,
  goldEarned: 100, timeMs: 60000, wave: 1, waveCount: 10, newBest: null, ...o,
});
const last = MAPS.length - 1;

describe('resultsModel', () => {
  it('victory chips', () => {
    const m = resultsModel(win());
    expect(m.chips.map((c) => c.id)).toEqual(['lives', 'kills', 'gold', 'time']);
    expect(m.chips.map((c) => c.value)).toEqual(['17/22', '214', '3,480', '9:42']);
    expect(m.chips.map((c) => c.label)).toEqual(['LIVES', 'KILLS', 'GOLD', 'TIME']);
    expect(m.bannerText).toBe('SECTOR HELD!');
    expect(m.kicker).toBe(RESULTS_COPY.kicker(3, MAPS[2].name));
    expect(m.final).toBe(false);
    expect(m.speaker).toBe('command');
    expect(m.actions.map((a) => a.id)).toEqual(['next', 'retry', 'map']);
    expect(m.actions[0].primary).toBe(true);
    expect(m.actions.slice(1).every((a) => !a.primary)).toBe(true);
    expect(m.actions[0].label).toBe(RESULTS_COPY.actions.next);
    expect(m.actions[0].name).toBe(RESULTS_COPY.actionNames.next);
  });

  it('defeat chips, 1/10 on wave 1, no stars', () => {
    const m = resultsModel(loss());
    expect(m.chips.map((c) => c.id)).toEqual(['wave', 'kills', 'gold', 'time']);
    expect(m.chips[0].value).toBe('1/10');
    expect(m.stars).toBe(0);
    expect(m.starsLabel).toBe('');
    expect(m.bannerText).toBe('THE LINE FELL');
    expect(m.speaker).toBe('veth');
    expect(m.actions.map((a) => a.id)).toEqual(['retry', 'map']);
    expect(m.actions[0].primary).toBe(true);
    expect(m.chips.every((c) => c.newBest === false)).toBe(true);
  });

  it('defeat on the last map is not campaign complete', () => {
    const m = resultsModel(loss({ mapId: last }));
    expect(m.kicker).toBe(RESULTS_COPY.kicker(last + 1, MAPS[last].name));
    expect(m.final).toBe(true);
    expect(m.actions.map((a) => a.id)).toEqual(['retry', 'map']);
  });

  it('final victory', () => {
    const m = resultsModel(win({ mapId: last, stars: 3 }));
    expect(m.kicker).toBe('CAMPAIGN COMPLETE');
    expect(m.actions.map((a) => a.id)).toEqual(['map', 'retry']);
    expect(m.actions[0].primary).toBe(true);
    expect(RESULT_LINES.final[3]).toContain(m.line);
  });

  it('NEW BEST flags, victory only', () => {
    const m = resultsModel(win({ newBest: { livesLost: true, time: true } }));
    expect(m.chips.map((c) => c.newBest)).toEqual([true, false, false, true]);
    const a = resultsModel(win({ newBest: { livesLost: true, time: false } }));
    expect(a.chips.map((c) => c.newBest)).toEqual([true, false, false, false]);
    const d = resultsModel(loss({ newBest: { livesLost: true, time: true } }));
    expect(d.chips.every((c) => c.newBest === false)).toBe(true);
    expect(resultsModel(win({ newBest: undefined })).chips.every((c) => !c.newBest)).toBe(true);
  });

  it('starsLabel', () => {
    expect(resultsModel(win({ stars: 2 })).starsLabel).toBe('2 of 3 stars');
    expect(resultsModel(win({ stars: 3 })).starsLabel).toBe('3 of 3 stars');
    expect(resultsModel(loss()).starsLabel).toBe('');
  });

  it('announcement', () => {
    const m = resultsModel(win({ newBest: { livesLost: false, time: true } }));
    expect(m.announcement).toBe(
      `Sector held! 2 of 3 stars. Lives 17 of 22, kills 214, gold 3,480, time 9:42. New best time. ${STORY_SPEAKERS.command.name}: ${m.line}`);
    const both = resultsModel(win({ newBest: { livesLost: true, time: true } })).announcement;
    expect(both).toContain('New best: fewest lives lost');
    expect(both).toContain('New best time');
    const none = resultsModel(win()).announcement;
    expect(none).not.toContain('New best');
    const d = resultsModel(loss());
    expect(d.announcement).toBe(
      `The line fell. Wave 1 of 10, kills 5, gold 100, time 1:00. ${STORY_SPEAKERS.veth.name}: ${d.line}`);
  });

  it('has no title key', () => {
    expect('title' in resultsModel(win())).toBe(false);
    expect('title' in resultsModel(loss())).toBe(false);
  });
});

describe('pickResultLine', () => {
  it('victory index is mapId % n per tier', () => {
    for (const stars of [1, 2, 3]) {
      const pool = RESULT_LINES.victory[stars];
      for (let mapId = 0; mapId < last; mapId++) {
        expect(pickResultLine({ result: 'victory', stars, final: false, mapId, wave: 10 }))
          .toBe(pool[mapId % pool.length]);
      }
    }
  });
  it('defeat index is (mapId + wave) % n', () => {
    const pool = RESULT_LINES.defeat;
    expect(pickResultLine({ result: 'defeat', stars: 0, final: false, mapId: 1, wave: 3 }))
      .toBe(pool[4 % pool.length]);
    expect(pickResultLine({ result: 'defeat', stars: 0, final: false, mapId: 2, wave: 4 }))
      .toBe(pool[6 % pool.length]);
    expect(pickResultLine({ result: 'defeat', stars: 0, final: true, mapId: last, wave: 2 }))
      .toBe(pool[(last + 2) % pool.length]);
  });
  it('final victory uses the final pool', () => {
    for (const stars of [1, 2, 3]) {
      const pool = RESULT_LINES.final[stars];
      expect(pickResultLine({ result: 'victory', stars, final: true, mapId: last, wave: 10 }))
        .toBe(pool[last % pool.length]);
    }
  });
});

describe('longestResultLine', () => {
  it('is the longest line across every pool', () => {
    const all = [
      ...Object.values(RESULT_LINES.victory).flat(),
      ...Object.values(RESULT_LINES.final).flat(),
      ...RESULT_LINES.defeat,
    ];
    const max = Math.max(...all.map((l) => l.length));
    expect(longestResultLine().length).toBe(max);
    expect(all).toContain(longestResultLine());
  });
  it('honours injected lines', () => {
    const lines = { victory: { 3: ['a'] }, final: { 3: ['bbb'] }, defeat: ['cc'] };
    expect(longestResultLine(lines)).toBe('bbb');
  });
});
