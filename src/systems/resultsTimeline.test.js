import { describe, it, expect } from 'vitest';
import { resultsTimeline } from './resultsTimeline.js';
import { RESULTS as R } from '../data/results.js';

describe('resultsTimeline', () => {
  const v = resultsTimeline('victory');
  const d = resultsTimeline('defeat');

  it('pins endMs', () => {
    expect(v.endMs).toBe(2600);
    expect(d.endMs).toBe(1750);
  });

  it('victory schedule derives from RESULTS', () => {
    expect(v.banner).toEqual({ at: 0, ms: R.bannerMs });
    expect(v.shake).toBeNull();
    expect(v.stars.map((s) => s.at)).toEqual([500, 750, 1000]);
    expect(v.stars.map((s) => s.at)).toEqual([0, 1, 2].map((i) => R.starsAtMs + i * R.starEachMs));
    expect(v.stars.every((s) => s.ms === R.starMs)).toBe(true);
    const chips0 = R.starsAtMs + 2 * R.starEachMs + R.starMs;
    expect(v.chips.map((c) => c.at)).toEqual([0, 1, 2, 3].map((i) => chips0 + i * R.chipEachMs));
    expect(v.chips.map((c) => c.at)).toEqual([1350, 1450, 1550, 1650]);
    expect(v.chips.every((c) => c.ms === R.chipMs)).toBe(true);
    expect(v.caption).toEqual({ at: chips0 + 3 * R.chipEachMs + R.chipMs - R.captionOverlapMs, ms: R.captionMs });
    expect(v.caption.at).toBe(1900);
    expect(v.actions).toEqual({ at: v.caption.at + R.captionMs + R.actionsGapMs, ms: R.actionsMs });
    expect(v.actions.at).toBe(2300);
  });

  it('defeat schedule derives from RESULTS', () => {
    expect(d.stars).toEqual([]);
    expect(d.shake).toEqual({ at: R.shakeAtMs, ms: R.shakeMs });
    expect(d.chips.map((c) => c.at)).toEqual([0, 1, 2, 3].map((i) => R.defeatChipsAtMs + i * R.chipEachMs));
    expect(d.chips.map((c) => c.at)).toEqual([500, 600, 700, 800]);
    expect(d.caption.at).toBe(R.defeatChipsAtMs + 3 * R.chipEachMs + R.chipMs - R.captionOverlapMs);
    expect(d.caption.at).toBe(1050);
    expect(d.actions.at).toBe(1450);
    expect(d.newBest).toBeNull();
  });

  it('beats are monotonic', () => {
    for (const t of [v, d]) {
      const seq = [t.banner, ...t.stars, ...t.chips, t.caption, t.actions].map((b) => b.at);
      const sorted = [...seq].sort((a, b) => a - b);
      expect(seq).toEqual(sorted);
      expect(t.endMs).toBe(t.actions.at + t.actions.ms);
    }
  });

  it('each NEW BEST slot lands after its chip and before actions', () => {
    expect(v.newBest).toHaveLength(v.chips.length);
    v.newBest.forEach((n, i) => {
      expect(n.at).toBeGreaterThan(v.chips[i].at);
      expect(n.at).toBeLessThan(v.actions.at);
      expect(n.at).toBe(v.chips[i].at + R.chipMs + R.newBestDelayMs);
      expect(n.ms).toBe(R.newBestMs);
    });
    expect(v.newBest[0].at).toBe(1700);
    expect(v.newBest[3].at).toBe(2000);
  });

  it('honours an injected cfg', () => {
    const t = resultsTimeline('victory', { ...R, bannerMs: 111 });
    expect(t.banner.ms).toBe(111);
  });
});
