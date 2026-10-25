import { describe, it, expect } from 'vitest';
import { startFlow, primary, skip, tick, view } from './dialogFlow.js';
import { STORY_DIALOG as cfg } from '../data/storyDialog.js';
import { STORY_SEQUENCES } from '../data/story.js';
import { typeDurationMs } from './typewriter.js';

const seq2 = { panels: [{ speaker: 'a', text: 'Hi.' }, { speaker: 'a', text: 'Yo' }] };
const typeEnd0 = (s, start = 0) => start + cfg.slamDelayMs + typeDurationMs(s.panels[0].text, cfg);

describe('dialogFlow', () => {
  it('primary during typing completes the line at now', () => {
    const s = primary(startFlow(seq2, 0), 100, cfg);
    const v = view(s, 100, cfg);
    expect(v.phase).toBe('complete');
    expect(v.shown).toBe(v.length);
    expect(s.completeAt).toBe(100);
  });

  it('primary in the pre-typing delay also completes', () => {
    const s = primary(startFlow(seq2, 0), 10, cfg);
    expect(view(s, 10, cfg).phase).toBe('complete');
  });

  it('shown is 0 during delay and partial while typing', () => {
    const s = startFlow(seq2, 0);
    expect(view(s, cfg.slamDelayMs, cfg).shown).toBe(0);
    const v = view(s, cfg.slamDelayMs + cfg.msPerChar, cfg);
    expect(v.phase).toBe('typing');
    expect(v.shown).toBe(1);
  });

  it('tick past typeEnd completes with completeAt = typeEnd', () => {
    const end = typeEnd0(seq2);
    const s = tick(startFlow(seq2, 0), end + 500, cfg);
    expect(s.phase).toBe('complete');
    expect(s.completeAt).toBe(end);
  });

  it('tick before typeEnd leaves typing', () => {
    expect(tick(startFlow(seq2, 0), typeEnd0(seq2) - 1, cfg).phase).toBe('typing');
  });

  it('guard: ignored 1ms early, advances at the boundary', () => {
    const done = primary(startFlow(seq2, 0), 100, cfg);
    const early = primary(done, 100 + cfg.advanceGuardMs - 1, cfg);
    expect(view(early, 100 + cfg.advanceGuardMs - 1, cfg).index).toBe(0);
    const on = primary(done, 100 + cfg.advanceGuardMs, cfg);
    expect(view(on, 100 + cfg.advanceGuardMs, cfg).index).toBe(1);
  });

  it('guard is measured from typeEnd, not the late tap time', () => {
    const end = typeEnd0(seq2);
    // Tap arrives well after the line finished but nothing ticked: tick-first
    // resolution means the guard is long satisfied, so it advances.
    const s = primary(startFlow(seq2, 0), end + cfg.advanceGuardMs, cfg);
    expect(view(s, end + cfg.advanceGuardMs, cfg).index).toBe(1);
    const early = primary(startFlow(seq2, 0), end + cfg.advanceGuardMs - 1, cfg);
    expect(view(early, end + cfg.advanceGuardMs - 1, cfg).index).toBe(0);
  });

  it('last panel primary after guard is done', () => {
    let s = primary(startFlow({ panels: [{ speaker: 'a', text: 'x' }] }, 0), 10, cfg);
    s = primary(s, 10 + cfg.advanceGuardMs, cfg);
    expect(view(s, 1000, cfg).phase).toBe('done');
  });

  it('skip goes to done from typing, delay and complete', () => {
    const t = startFlow(seq2, 0);
    expect(view(skip(t), 0, cfg).phase).toBe('done');
    expect(view(skip(t), 5000, cfg).phase).toBe('done');
    expect(view(skip(primary(t, 10, cfg)), 20, cfg).phase).toBe('done');
  });

  it('motion:false starts complete and the guard still holds', () => {
    const s = startFlow(seq2, 50, { motion: false });
    expect(view(s, 50, cfg).phase).toBe('complete');
    expect(view(primary(s, 50 + cfg.advanceGuardMs - 1, cfg), 0, cfg).index).toBe(0);
    const n = primary(s, 50 + cfg.advanceGuardMs, cfg);
    expect(view(n, 0, cfg).index).toBe(1);
    expect(view(n, 0, cfg).phase).toBe('complete');
    expect(n.completeAt).toBe(50 + cfg.advanceGuardMs);
  });

  it('transitions over campaign_intro', () => {
    let s = startFlow(STORY_SEQUENCES.campaign_intro, 0);
    const out = [];
    let now = 0;
    for (let i = 0; i < 4; i += 1) {
      out.push(view(s, now, cfg).transition);
      now += 10;
      s = primary(s, now, cfg);
      now += cfg.advanceGuardMs;
      s = primary(s, now, cfg);
    }
    expect(out).toEqual(['slam', 'swap', 'slam', 'slam']);
  });

  it('same-side different speaker slams', () => {
    const q = { panels: [{ speaker: 'command', text: 'a' }, { speaker: 'veth', text: 'b' }] };
    let s = primary(startFlow(q, 0), 1, cfg);
    s = primary(s, 1 + cfg.advanceGuardMs, cfg);
    expect(view(s, 1000, cfg).transition).toBe('slam');
  });

  it('typeDelay differs by transition', () => {
    let s = primary(startFlow(seq2, 0), 1, cfg);
    s = primary(s, 1 + cfg.advanceGuardMs, cfg);
    const start = 1 + cfg.advanceGuardMs;
    expect(view(s, start + cfg.swapDelayMs + cfg.msPerChar, cfg).shown).toBe(1);
  });

  it('single panel is last from the start', () => {
    expect(view(startFlow({ panels: [{ speaker: 'a', text: 'x' }] }, 0), 0, cfg).isLast).toBe(true);
    expect(view(startFlow(seq2, 0), 0, cfg).isLast).toBe(false);
  });

  it('empty sequence is done at start', () => {
    expect(view(startFlow({ panels: [] }, 0), 0, cfg).phase).toBe('done');
  });

  it('empty panel text is complete at once', () => {
    const v = view(startFlow({ panels: [{ speaker: 'a', text: '' }] }, 0), 0, cfg);
    expect(v.phase).toBe('complete');
    expect(v.length).toBe(0);
  });

  it('does not mutate input state', () => {
    const s = startFlow(seq2, 0);
    const snap = JSON.stringify(s);
    primary(s, 5, cfg); tick(s, 99999, cfg); skip(s);
    expect(JSON.stringify(s)).toBe(snap);
  });
});
