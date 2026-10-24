import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoryDialogOverlay } from './StoryDialogOverlay.js';
import { STORY_SEQUENCES, STORY_SPEAKERS, STORY_LOG_LABELS } from '../data/story.js';
import { STORY_DIALOG } from '../data/storyDialog.js';
import { registerPortraits } from '../systems/portraitFallback.js';

// The shipped #story-dialog markup, so the tests exercise the real nesting
// (ids, .sd-typed/.sd-rest spans, live region) rather than a hand-built copy.
const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8');
const DIALOG_HTML = new DOMParser().parseFromString(html, 'text/html').getElementById('story-dialog').outerHTML;

const $ = (sel) => document.querySelector(sel);
const dialog = () => $('#story-dialog');
const typed = () => $('#story-dialog-text .sd-typed').textContent;
const rest = () => $('#story-dialog-text .sd-rest').textContent;
const GUARD = STORY_DIALOG.advanceGuardMs;
// Long enough to finish any line (the longest types in ~4.3 s).
const LONG = 60_000;

// A deterministic clock and rAF queue: frames run only when the test says so.
function makeClock() {
  const clock = { t: 1000, queue: new Map(), nextId: 1, requested: 0, cancelled: 0, fired: 0 };
  clock.now = () => clock.t;
  clock.raf = (cb) => { clock.requested += 1; const id = clock.nextId++; clock.queue.set(id, cb); return id; };
  clock.caf = (id) => { if (clock.queue.delete(id)) clock.cancelled += 1; };
  clock.frame = (ms = 16) => {
    clock.t += ms;
    const batch = [...clock.queue.values()];
    clock.queue.clear();
    for (const cb of batch) { clock.fired += 1; cb(clock.t); }
  };
  clock.pending = () => clock.queue.size;
  return clock;
}

function setupDom() {
  document.body.innerHTML = `<button id="opener">Story Log</button>${DIALOG_HTML}`;
}

let clock;
let motionOn;
// Every overlay made, so afterEach can close it: a leaked capture listener
// would preventDefault the next test's keys before its own overlay sees them.
let made = [];
function make() {
  const ov = new StoryDialogOverlay({ motion: () => motionOn, now: clock.now, raf: clock.raf, caf: clock.caf });
  made.push(ov);
  return ov;
}

function key(k, init = {}, target = document.activeElement || document.body) {
  const e = new KeyboardEvent(init.type || 'keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

// Primary taps until the sequence finishes; each tap waits out typing and the guard.
function readThrough(done, max = 40) {
  let taps = 0;
  while (!done.mock.calls.length && taps < max) {
    clock.t += LONG;
    $('#story-dialog-next').click();
    clock.t += GUARD;
    taps += 1;
  }
  return taps;
}

// jsdom catches an exception thrown inside a listener and reports it as a window
// 'error' event, so a click handler that throws would otherwise pass silently.
let listenerErrors;
const onWindowError = (e) => listenerErrors.push(e.error ?? e.message);

describe('StoryDialogOverlay', () => {
  beforeEach(() => {
    listenerErrors = [];
    window.addEventListener('error', onWindowError);
    setupDom();
    clock = makeClock();
    motionOn = true;
    registerPortraits([]);
  });
  afterEach(() => {
    window.removeEventListener('error', onWindowError);
    for (const ov of made) ov.close();
    made = [];
    expect(listenerErrors).toEqual([]);
    registerPortraits([]);
    vi.restoreAllMocks();
  });

  describe('kept behaviour', () => {
    it('renders the first panel and shows the overlay on play', () => {
      make().play('campaign_intro', () => {});
      expect(dialog().style.display).toBe('flex');
      expect($('#story-dialog-name').textContent).toBe(STORY_SPEAKERS.command.name);
      expect($('#story-dialog-text').textContent).toBe(STORY_SEQUENCES.campaign_intro.panels[0].text);
    });

    it('missing sequence id fires onComplete immediately without showing', () => {
      const done = vi.fn();
      make().play('does_not_exist', done);
      expect(done).toHaveBeenCalledTimes(1);
      expect(dialog().style.display).not.toBe('flex');
    });

    it('re-entrant play does not stack listeners (one Primary acts once)', () => {
      const ov = make();
      ov.play('campaign_intro', () => {});
      ov.play('epilogue_outpost_sigma', () => {}); // 2 panels, replaces
      clock.t += LONG;
      // Past typeEnd + guard, one Primary advances exactly once. A stacked
      // second listener would also finish panel 1's typing.
      $('#story-dialog-next').click();
      expect(dialog().dataset.index).toBe('1');
      expect(dialog().dataset.phase).toBe('typing');
      expect($('#story-dialog-name').textContent).toContain('Command');
    });

    it('re-entrant play completes the interrupted sequence (fires its onComplete)', () => {
      const first = vi.fn();
      const ov = make();
      ov.play('campaign_intro', first);
      expect(first).not.toHaveBeenCalled();
      ov.play('epilogue_outpost_sigma', () => {});
      expect(first).toHaveBeenCalledTimes(1);
    });

    it('close() never calls onComplete and is safe to call twice', () => {
      const done = vi.fn();
      const ov = make();
      ov.play('campaign_intro', done);
      ov.close();
      ov.close();
      expect(done).not.toHaveBeenCalled();
      expect(dialog().style.display).toBe('none');
    });
    it('play() interrupting a sequence whose onComplete chains another renders the new sequence', () => {
      const chained = vi.fn();
      const ov = make();
      ov.play('campaign_intro', () => ov.play('campaign_ending', chained));
      ov.play('epilogue_outpost_sigma', () => {});
      const first = STORY_SEQUENCES.epilogue_outpost_sigma.panels[0].text;
      expect(STORY_SEQUENCES.campaign_ending.panels[0].text).not.toBe(first);
      expect(chained).toHaveBeenCalledTimes(1); // the chained beat completed too
      expect(dialog().dataset.index).toBe('0');
      expect($('#story-dialog-text').textContent).toBe(first);
    });
  });

  describe('typing and Primary', () => {
    it('data-phase is written only when the phase changes, not every frame', () => {
      make().play('campaign_intro', () => {});
      const obs = new MutationObserver(() => {});
      obs.observe(dialog(), { attributes: true, attributeFilter: ['data-phase'] });
      for (let i = 0; i < 10; i += 1) clock.frame(16);
      expect(dialog().dataset.phase).toBe('typing');
      expect(obs.takeRecords()).toEqual([]);
      obs.disconnect();
    });

    it('Next during typing finishes the line; a second Next after the guard advances', () => {
      const line = STORY_SEQUENCES.campaign_intro.panels[0].text;
      make().play('campaign_intro', () => {});
      expect(dialog().dataset.phase).toBe('typing');
      clock.t += 10;
      $('#story-dialog-next').click();
      expect(dialog().dataset.phase).toBe('complete');
      expect(typed()).toBe(line);
      expect(rest()).toBe('');
      clock.t += GUARD - 1;
      $('#story-dialog-next').click(); // inside the guard: dropped
      expect(dialog().dataset.index).toBe('0');
      clock.t += 1;
      $('#story-dialog-next').click();
      expect(dialog().dataset.index).toBe('1');
    });

    it('the rAF loop types the line and stops at complete', () => {
      const line = STORY_SEQUENCES.campaign_intro.panels[0].text;
      make().play('campaign_intro', () => {});
      expect(typed()).toBe('');
      expect(rest()).toBe(line);
      clock.frame(STORY_DIALOG.slamDelayMs + STORY_DIALOG.msPerChar * 3);
      expect(typed().length).toBeGreaterThan(0);
      expect(typed().length).toBeLessThan(Array.from(line).length);
      expect(typed() + rest()).toBe(line);
      clock.frame(LONG);
      expect(dialog().dataset.phase).toBe('complete');
      expect(typed()).toBe(line);
      expect(clock.pending()).toBe(0);
    });

    it('#story-dialog-text.textContent is the full line at every phase', () => {
      const line = STORY_SEQUENCES.campaign_intro.panels[0].text;
      make().play('campaign_intro', () => {});
      const seen = [];
      for (let i = 0; i < 12; i += 1) {
        clock.frame(STORY_DIALOG.msPerChar * 7 + 30);
        seen.push($('#story-dialog-text').textContent);
      }
      expect(new Set(seen)).toEqual(new Set([line]));
    });

    it('writes the spans only when the shown count changes', () => {
      make().play('campaign_intro', () => {});
      const obs = new MutationObserver(() => {});
      obs.observe($('#story-dialog-text'), { childList: true, characterData: true, subtree: true });
      clock.frame(1); // still inside the slam delay: nothing shown changes
      clock.frame(1);
      expect(obs.takeRecords()).toEqual([]);
      clock.frame(STORY_DIALOG.slamDelayMs + STORY_DIALOG.msPerChar);
      expect(obs.takeRecords().length).toBeGreaterThan(0); // the observer does see real writes
      obs.disconnect();
    });

    it('a backdrop click is Primary, not skip', () => {
      const done = vi.fn();
      make().play('campaign_intro', done);
      dialog().dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(done).not.toHaveBeenCalled();
      expect(dialog().style.display).toBe('flex');
      expect(dialog().dataset.phase).toBe('complete');
    });

    it('a click on the caption is Primary', () => {
      make().play('campaign_intro', () => {});
      $('#story-dialog-text').click();
      expect(dialog().dataset.phase).toBe('complete');
    });

    it('the last panel relabels Next to Continue and its Primary finishes once', () => {
      const done = vi.fn();
      make().play('epilogue_outpost_sigma', done); // 2 panels
      const next = $('#story-dialog-next');
      expect(next.textContent).toBe('Next ▸');
      expect(next.getAttribute('aria-label')).toBe('Next');
      clock.t += LONG; next.click(); clock.t += GUARD; next.click();
      expect(next.textContent).toBe('Continue ▸');
      expect(next.getAttribute('aria-label')).toBe('Continue');
      expect(done).not.toHaveBeenCalled();
      clock.t += LONG; next.click();
      expect(done).toHaveBeenCalledTimes(1);
      expect(dialog().style.display).toBe('none');
    });

    it.each(Object.keys(STORY_LOG_LABELS))('Story Log beat %s plays to done via Primary', (id) => {
      const done = vi.fn();
      make().play(id, done);
      const taps = readThrough(done);
      expect(done).toHaveBeenCalledTimes(1);
      expect(taps).toBe(STORY_SEQUENCES[id].panels.length);
    });

    it('panel text renders literally, never as markup', () => {
      STORY_SEQUENCES.__literal = { panels: [{ speaker: 'command', text: '<b>&amp;' }] };
      try {
        make().play('__literal', () => {});
        $('#story-dialog-next').click(); // finishes typing: the typed span holds it all
        expect(typed()).toBe('<b>&amp;');
        expect($('#story-dialog-text').textContent).toBe('<b>&amp;');
        expect($('#story-dialog-text b')).toBeNull();
        clock.frame(); // the first panel's live line lands a frame after the dialog shows
        expect($('#story-dialog-live').textContent).toBe('Sol Command: <b>&amp;');
      } finally {
        delete STORY_SEQUENCES.__literal;
      }
    });
  });

  describe('Skip', () => {
    it('Skip during typing calls onComplete exactly once and hides', () => {
      const done = vi.fn();
      make().play('campaign_intro', done);
      $('#story-dialog-skip').click();
      expect(done).toHaveBeenCalledTimes(1);
      expect(dialog().style.display).toBe('none');
    });

    it('a double click on Skip calls onComplete exactly once', () => {
      const done = vi.fn();
      make().play('campaign_intro', done);
      $('#story-dialog-skip').click();
      $('#story-dialog-skip').click();
      expect(done).toHaveBeenCalledTimes(1);
    });

    it('Escape skips, and a second Escape after close does nothing', () => {
      const done = vi.fn();
      make().play('campaign_intro', done);
      const e = key('Escape');
      expect(e.defaultPrevented).toBe(true);
      key('Escape');
      expect(done).toHaveBeenCalledTimes(1);
      expect(dialog().style.display).toBe('none');
    });
  });

  describe('keyboard', () => {
    let bubbleSpy;
    beforeEach(() => {
      bubbleSpy = vi.fn();
      document.addEventListener('keydown', bubbleSpy);
    });
    afterEach(() => document.removeEventListener('keydown', bubbleSpy));

    it.each(['Enter', ' '])('%j is Primary, prevented and not propagated', (k) => {
      make().play('campaign_intro', () => {});
      const e = key(k);
      expect(dialog().dataset.phase).toBe('complete');
      expect(e.defaultPrevented).toBe(true);
      expect(bubbleSpy).not.toHaveBeenCalled();
    });

    it('Enter with focus on Skip skips', () => {
      const done = vi.fn();
      make().play('campaign_intro', done);
      $('#story-dialog-skip').focus();
      key('Enter');
      expect(done).toHaveBeenCalledTimes(1);
    });

    it('a Q keydown is not propagated and not prevented', () => {
      make().play('campaign_intro', () => {});
      const e = key('q');
      expect(bubbleSpy).not.toHaveBeenCalled();
      expect(e.defaultPrevented).toBe(false);
      expect(dialog().dataset.phase).toBe('typing');
    });

    it('Ctrl+R is propagated untouched', () => {
      make().play('campaign_intro', () => {});
      const e = key('r', { ctrlKey: true });
      expect(bubbleSpy).toHaveBeenCalledTimes(1);
      expect(e.defaultPrevented).toBe(false);
    });

    it('an auto-repeat Enter does nothing (but is still swallowed)', () => {
      make().play('campaign_intro', () => {});
      const e = key('Enter', { repeat: true });
      expect(dialog().dataset.phase).toBe('typing');
      expect(bubbleSpy).not.toHaveBeenCalled();
      expect(e.defaultPrevented).toBe(true);
    });

    it('an event already defaultPrevented (the entry guard) is ignored', () => {
      const guard = (e) => e.preventDefault();
      document.addEventListener('keydown', guard, true); // registered first, like the scene's
      try {
        const done = vi.fn();
        make().play('campaign_intro', done);
        key('Enter');
        key('Escape');
        expect(dialog().dataset.phase).toBe('typing');
        expect(done).not.toHaveBeenCalled();
      } finally {
        document.removeEventListener('keydown', guard, true);
      }
    });

    it('a closing Space swallows its keyup once, and a later keyup passes', () => {
      const keyupSpy = vi.fn();
      document.addEventListener('keyup', keyupSpy);
      try {
        STORY_SEQUENCES.__one = { panels: [{ speaker: 'command', text: 'Go.' }] };
        const done = vi.fn();
        make().play('__one', done);
        clock.t += LONG;
        key(' '); // past typeEnd + guard: finishes the one-panel sequence
        expect(done).toHaveBeenCalledTimes(1);
        key(' ', { type: 'keyup' });
        expect(keyupSpy).not.toHaveBeenCalled();
        key(' ', { type: 'keyup' });
        expect(keyupSpy).toHaveBeenCalledTimes(1);
      } finally {
        delete STORY_SEQUENCES.__one;
        document.removeEventListener('keyup', keyupSpy);
      }
    });

    it('the keyup swallow ends on the next keydown', () => {
      const keyupSpy = vi.fn();
      document.addEventListener('keyup', keyupSpy);
      try {
        make().play('campaign_intro', () => {});
        key('Escape');
        key('x');
        key('x', { type: 'keyup' });
        expect(keyupSpy).toHaveBeenCalledTimes(1);
      } finally {
        document.removeEventListener('keyup', keyupSpy);
      }
    });

    it('Tab and Shift+Tab wrap between Skip and Next', () => {
      make().play('campaign_intro', () => {});
      const skipBtn = $('#story-dialog-skip');
      const next = $('#story-dialog-next');
      expect(document.activeElement).toBe(next);
      expect(key('Tab').defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(skipBtn);
      key('Tab');
      expect(document.activeElement).toBe(next);
      key('Tab', { shiftKey: true });
      expect(document.activeElement).toBe(skipBtn);
      key('Tab', { shiftKey: true });
      expect(document.activeElement).toBe(next);
    });
  });

  describe('focus', () => {
    it('goes to Next on play and returns to the opener on finish', () => {
      const opener = $('#opener');
      opener.focus();
      make().play('campaign_intro', () => {});
      expect(document.activeElement).toBe($('#story-dialog-next'));
      $('#story-dialog-skip').click();
      expect(document.activeElement).toBe(opener);
    });

    it('returns to the opener on close()', () => {
      const opener = $('#opener');
      opener.focus();
      const ov = make();
      ov.play('campaign_intro', () => {});
      ov.close();
      expect(document.activeElement).toBe(opener);
    });

    it('is left on <body> when the opener is gone', () => {
      const opener = $('#opener');
      opener.focus();
      const ov = make();
      ov.play('campaign_intro', () => {});
      opener.remove();
      ov.close();
      expect(document.activeElement).toBe(document.body);
    });
  });

  describe('a11y', () => {
    it('the dialog, name and text carry their roles and hidden flags', () => {
      expect(dialog().getAttribute('role')).toBe('dialog');
      expect(dialog().getAttribute('aria-modal')).toBe('true');
      expect(dialog().getAttribute('aria-label')).toBe('Story');
      expect($('#story-dialog-name').getAttribute('aria-hidden')).toBe('true');
      expect($('#story-dialog-text').getAttribute('aria-hidden')).toBe('true');
      expect($('#story-dialog-skip').getAttribute('aria-label')).toBe('Skip story');
      const live = $('#story-dialog-live');
      expect(live.classList.contains('sr-only')).toBe(true);
      expect(live.getAttribute('aria-live')).toBe('polite');
      expect(live.getAttribute('aria-atomic')).toBe('true');
      expect(document.querySelector('#story-dialog [title]')).toBeNull();
    });

    it('the portrait frame (img or fallback initial) is hidden from screen readers', () => {
      expect($('#story-dialog-portrait').getAttribute('aria-hidden')).toBe('true');
    });

    // A live region that enters the accessibility tree already filled is often
    // never announced, so the first line waits a frame after the dialog shows.
    it.each([true, false])('motion %s: the first panel is announced on the next frame, not in play()', (motion) => {
      motionOn = motion;
      const live = $('#story-dialog-live');
      live.textContent = 'stale';
      make().play('campaign_intro', () => {});
      expect(live.textContent).toBe('');
      clock.frame();
      expect(live.textContent).toBe(`${STORY_SPEAKERS.command.name}: ${STORY_SEQUENCES.campaign_intro.panels[0].text}`);
    });

    it('close() before that frame cancels the write', () => {
      const ov = make();
      ov.play('campaign_intro', () => {});
      ov.close();
      clock.frame();
      expect($('#story-dialog-live').textContent).toBe('');
    });

    it('a stale first-line frame that fires after close writes nothing', () => {
      const cbs = [];
      const ov = new StoryDialogOverlay({ motion: () => false, now: clock.now, raf: (cb) => { cbs.push(cb); return cbs.length; }, caf: () => {} });
      made.push(ov);
      ov.play('campaign_intro', () => {});
      ov.close();
      for (const cb of cbs) cb(clock.t);
      expect($('#story-dialog-live').textContent).toBe('');
    });

    it('close() empties the live region, and replaying the same entry announces it again', () => {
      const line = `${STORY_SPEAKERS.command.name}: ${STORY_SEQUENCES.campaign_intro.panels[0].text}`;
      const ov = make();
      ov.play('campaign_intro', () => {});
      clock.frame();
      expect($('#story-dialog-live').textContent).toBe(line);
      ov.close();
      expect($('#story-dialog-live').textContent).toBe('');
      ov.play('campaign_intro', () => {});
      expect($('#story-dialog-live').textContent).toBe('');
      clock.frame();
      expect($('#story-dialog-live').textContent).toBe(line);
    });

    it('a later panel is announced at once, and a first-line frame still queued never overwrites it', () => {
      const panels = STORY_SEQUENCES.campaign_intro.panels;
      const second = `${STORY_SPEAKERS[panels[1].speaker].name}: ${panels[1].text}`;
      make().play('campaign_intro', () => {});
      clock.t += LONG; // no frame has run: panel 0's live write is still queued
      $('#story-dialog-next').click();
      expect(dialog().dataset.index).toBe('1');
      expect($('#story-dialog-live').textContent).toBe(second);
      clock.frame();
      expect($('#story-dialog-live').textContent).toBe(second);
    });

    it('the live region holds "Name: line" once per panel', () => {
      const panels = STORY_SEQUENCES.campaign_intro.panels;
      make().play('campaign_intro', () => {});
      const live = $('#story-dialog-live');
      clock.frame();
      const obs = new MutationObserver(() => {});
      obs.observe(live, { childList: true, characterData: true, subtree: true });
      expect(live.textContent).toBe(`${STORY_SPEAKERS.command.name}: ${panels[0].text}`);
      for (let i = 0; i < 20; i += 1) clock.frame(100);
      expect(obs.takeRecords()).toEqual([]); // typing frames never touch it
      clock.t += LONG;
      $('#story-dialog-next').click();
      expect(live.textContent).toBe(`${STORY_SPEAKERS[panels[1].speaker].name}: ${panels[1].text}`);
      expect(obs.takeRecords().length).toBeGreaterThan(0);
      obs.disconnect();
    });
  });

  describe('close mid-typing', () => {
    it('cancels the rAF, writes nothing more and never calls onComplete', () => {
      const done = vi.fn();
      const ov = make();
      ov.play('campaign_intro', done);
      clock.frame(STORY_DIALOG.slamDelayMs + 100);
      const before = typed();
      expect(clock.pending()).toBe(1);
      ov.close();
      expect(clock.pending()).toBe(0);
      expect(clock.cancelled).toBe(1);
      clock.frame(1000);
      expect(typed()).toBe(before);
      expect(done).not.toHaveBeenCalled();
    });

    it('a stale frame that still fires after close writes nothing', () => {
      const cbs = [];
      const ov = new StoryDialogOverlay({ motion: () => true, now: clock.now, raf: (cb) => { cbs.push(cb); return cbs.length; }, caf: () => {} });
      made.push(ov);
      ov.play('campaign_intro', () => {});
      ov.close();
      const before = typed();
      clock.t += LONG;
      for (const cb of cbs) cb(clock.t);
      expect(typed()).toBe(before);
      expect(dialog().dataset.phase).not.toBe('complete');
    });
  });

  describe('motion', () => {
    it('motion off: complete at once, .motion-off, no animation classes', () => {
      motionOn = false;
      const line = STORY_SEQUENCES.campaign_intro.panels[0].text;
      make().play('campaign_intro', () => {});
      expect(dialog().classList.contains('motion-off')).toBe(true);
      expect(dialog().dataset.phase).toBe('complete');
      expect(typed()).toBe(line);
      expect(dialog().classList.contains('sd-slam')).toBe(false);
      expect(dialog().classList.contains('sd-swap')).toBe(false);
      clock.frame(); // only the one-off live write was queued: no typing loop
      expect(clock.pending()).toBe(0);
    });

    it('motion off: the guard still holds', () => {
      motionOn = false;
      make().play('campaign_intro', () => {});
      $('#story-dialog-next').click();
      expect(dialog().dataset.index).toBe('0');
      clock.t += GUARD;
      $('#story-dialog-next').click();
      expect(dialog().dataset.index).toBe('1');
    });

    it('motion is re-read at each panel change', () => {
      make().play('campaign_intro', () => {});
      expect(dialog().classList.contains('motion-off')).toBe(false);
      motionOn = false;
      clock.t += LONG; $('#story-dialog-next').click();
      expect(dialog().dataset.index).toBe('1');
      expect(dialog().classList.contains('motion-off')).toBe(true);
      expect(dialog().dataset.phase).toBe('complete');
    });

    it('a speaker change slams, the same speaker swaps', () => {
      const panels = STORY_SEQUENCES.campaign_intro.panels;
      expect(panels[0].speaker).toBe(panels[1].speaker);
      make().play('campaign_intro', () => {});
      expect(dialog().classList.contains('sd-slam')).toBe(true);
      expect(dialog().dataset.transition).toBe('slam');
      clock.t += LONG; $('#story-dialog-next').click();
      clock.t += GUARD; $('#story-dialog-next').click();
      expect(dialog().dataset.transition).toBe('swap');
      expect(dialog().classList.contains('sd-swap')).toBe(true);
      expect(dialog().classList.contains('sd-slam')).toBe(false);
    });

    it('close() clears the animation classes', () => {
      const ov = make();
      ov.play('campaign_intro', () => {});
      ov.close();
      expect(dialog().classList.contains('sd-slam')).toBe(false);
      expect(dialog().classList.contains('sd-swap')).toBe(false);
    });

    it('publishes the timing tunables as --sd-* properties', () => {
      make();
      expect(dialog().style.getPropertyValue('--sd-slam-ms')).toBe(`${STORY_DIALOG.slamMs}ms`);
      expect(dialog().style.getPropertyValue('--sd-continue-blink-ms')).toBe(`${STORY_DIALOG.continueBlinkMs}ms`);
      expect(dialog().style.getPropertyValue('--sd-skew-deg')).toBe(`${STORY_DIALOG.skewDeg}deg`);
    });
  });

  describe('per-speaker data', () => {
    // Plays until the given speaker is on screen.
    function playTo(seqId, speaker) {
      make().play(seqId, () => {});
      const panels = STORY_SEQUENCES[seqId].panels;
      const target = panels.findIndex((p) => p.speaker === speaker);
      for (let i = 0; i < target; i += 1) {
        clock.t += LONG; $('#story-dialog-next').click(); clock.t += GUARD; $('#story-dialog-next').click();
      }
      expect(dialog().dataset.index).toBe(String(target));
    }
    const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
    const seqWith = (speaker) => Object.keys(STORY_SEQUENCES).find((id) => STORY_SEQUENCES[id].panels.some((p) => p.speaker === speaker));

    it('Sol Command: left, box, no glitch, its colours', () => {
      playTo('campaign_intro', 'command');
      expect(dialog().dataset.speaker).toBe('command');
      expect(dialog().dataset.side).toBe('left');
      expect(dialog().dataset.shape).toBe('box');
      expect(dialog().dataset.glitch).toBe('0');
      expect(dialog().style.getPropertyValue('--sd-frame')).toBe(hex(STORY_SPEAKERS.command.color));
      expect(dialog().style.getPropertyValue('--sd-caption')).toBe(hex(STORY_SPEAKERS.command.caption));
    });

    it('Rael: data-side="right"', () => {
      playTo('campaign_intro', 'rael');
      expect(dialog().dataset.speaker).toBe('rael');
      expect(dialog().dataset.side).toBe('right');
    });

    it('Veth: data-shape="jagged" data-glitch="1"', () => {
      playTo(seqWith('veth'), 'veth');
      expect(dialog().dataset.shape).toBe('jagged');
      expect(dialog().dataset.glitch).toBe('1');
      expect(dialog().style.getPropertyValue('--sd-frame')).toBe(hex(STORY_SPEAKERS.veth.color));
    });

    it('unknown speaker: data-speaker="unknown", colour vars unset, empty name, "?" face', () => {
      STORY_SEQUENCES.__ghost = { panels: [{ speaker: 'nobody', text: 'Hello.' }] };
      try {
        const ov = make();
        ov.play('epilogue_outpost_sigma', () => {}); // leaves Command's colours behind
        ov.close();
        ov.play('__ghost', () => {});
        expect(dialog().dataset.speaker).toBe('unknown');
        expect(dialog().dataset.side).toBe('left');
        expect(dialog().style.getPropertyValue('--sd-frame')).toBe('');
        expect(dialog().style.getPropertyValue('--sd-caption')).toBe('');
        expect($('#story-dialog-name').textContent).toBe('');
        expect($('#story-dialog-portrait').textContent).toBe('?');
        clock.frame();
        expect($('#story-dialog-live').textContent).toBe('Hello.');
      } finally {
        delete STORY_SEQUENCES.__ghost;
      }
    });

    it('no inline colour is written on the name or the portrait', () => {
      make().play('campaign_intro', () => {});
      expect($('#story-dialog-name').style.color).toBe('');
      expect($('#story-dialog-portrait').style.background).toBe('');
    });

    it('fallback portrait renders the initial inside the frame element', () => {
      make().play('campaign_intro', () => {});
      const portrait = $('#story-dialog-portrait');
      expect(portrait.querySelector('img')).toBeNull();
      expect(portrait.querySelector('.sd-initial').textContent).toBe('S');
    });

    it('registered art renders a decorative img; an img error falls back to the initial', () => {
      registerPortraits(['portrait-command']);
      make().play('campaign_intro', () => {});
      const img = $('#story-dialog-portrait img');
      expect(img.getAttribute('src')).toBe('/assets/portraits/portrait-command.png');
      expect(img.getAttribute('alt')).toBe('');
      img.dispatchEvent(new Event('error'));
      expect($('#story-dialog-portrait img')).toBeNull();
      expect($('#story-dialog-portrait .sd-initial').textContent).toBe('S');
    });

    it('an img error after its panel is gone does not overwrite the new portrait', () => {
      registerPortraits(['portrait-command']);
      make().play('campaign_intro', () => {});
      const stale = $('#story-dialog-portrait img');
      const rael = STORY_SEQUENCES.campaign_intro.panels.findIndex((p) => p.speaker === 'rael');
      for (let i = 0; i < rael; i += 1) {
        clock.t += LONG; $('#story-dialog-next').click(); clock.t += GUARD; $('#story-dialog-next').click();
      }
      expect($('#story-dialog-portrait .sd-initial').textContent).toBe('C');
      stale.dispatchEvent(new Event('error'));
      expect($('#story-dialog-portrait .sd-initial').textContent).toBe('C');
    });
  });

  // The overlay hides on the closing click, so the second tap of a double tap
  // would land on whatever lies beneath (LAUNCH, a pad).
  describe('pointer close guard', () => {
    let under;
    let underSpy;
    const TYPES = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'];
    const hit = (type, target = under) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      target.dispatchEvent(e);
      return e;
    };
    beforeEach(() => {
      under = document.createElement('button');
      under.id = 'under';
      document.body.appendChild(under);
      underSpy = vi.fn();
      for (const type of TYPES) under.addEventListener(type, underSpy);
    });

    it.each(['#story-dialog-skip', '#story-dialog-next'])('after a closing %s click, a tap underneath inside the guard is swallowed', (sel) => {
      STORY_SEQUENCES.__one = { panels: [{ speaker: 'command', text: 'Go.' }] };
      try {
        const done = vi.fn();
        make().play('__one', done);
        clock.t += LONG;
        $(sel).click();
        expect(done).toHaveBeenCalledTimes(1);
        clock.t += GUARD - 1;
        for (const type of TYPES) expect(hit(type).defaultPrevented).toBe(true);
        expect(underSpy).not.toHaveBeenCalled();
      } finally {
        delete STORY_SEQUENCES.__one;
      }
    });

    it('the first event past the guard passes through, and so does the rest', () => {
      make().play('campaign_intro', () => {});
      $('#story-dialog-skip').click();
      clock.t += GUARD;
      expect(hit('pointerdown').defaultPrevented).toBe(false);
      clock.t -= GUARD; // the swallow is gone, not merely timed out
      expect(hit('click').defaultPrevented).toBe(false);
      expect(underSpy).toHaveBeenCalledTimes(2);
    });

    it('a key close arms no tap swallow', () => {
      make().play('campaign_intro', () => {});
      key('Escape');
      hit('click');
      expect(underSpy).toHaveBeenCalledTimes(1);
    });

    it('close() ends the tap swallow', () => {
      const ov = make();
      ov.play('campaign_intro', () => {});
      $('#story-dialog-skip').click();
      ov.close();
      hit('click');
      expect(underSpy).toHaveBeenCalledTimes(1);
    });

    // The reopened dialog covers the screen and judges its own taps (its Primary
    // finishes the line); a swallow left on would eat them before the overlay.
    it('an onComplete that plays again hands the next tap to the new dialog', () => {
      const ov = make();
      ov.play('epilogue_outpost_sigma', () => ov.play('campaign_intro', () => {}));
      $('#story-dialog-skip').click();
      expect(dialog().dataset.phase).toBe('typing');
      clock.t += 10;
      $('#story-dialog-next').click();
      expect(dialog().dataset.phase).toBe('complete');
    });

    it('an onComplete whose chained sequence is missing keeps the swallow (nothing reopened)', () => {
      const ov = make();
      ov.play('campaign_intro', () => ov.play('does_not_exist', () => {}));
      $('#story-dialog-skip').click();
      expect(hit('click').defaultPrevented).toBe(true);
      expect(underSpy).not.toHaveBeenCalled();
    });
  });

  describe('listener pairing', () => {
    // Live listeners keyed by target + type + capture + handler: a remove only
    // counts when it removes something (the 2026-08-17 leak-test pattern).
    function trackLive(...targets) {
      const live = new Set();
      const ids = new WeakMap();
      let nextId = 1;
      const fnId = (fn) => { if (!ids.has(fn)) ids.set(fn, nextId++); return ids.get(fn); };
      const keyOf = (t, type, fn, opts) => `${targets.indexOf(t)}|${type}|${typeof opts === 'object' ? !!opts?.capture : !!opts}|${fnId(fn)}`;
      for (const t of targets) {
        const add = t.addEventListener.bind(t);
        const remove = t.removeEventListener.bind(t);
        vi.spyOn(t, 'addEventListener').mockImplementation((type, fn, opts) => { live.add(keyOf(t, type, fn, opts)); return add(type, fn, opts); });
        vi.spyOn(t, 'removeEventListener').mockImplementation((type, fn, opts) => { live.delete(keyOf(t, type, fn, opts)); return remove(type, fn, opts); });
      }
      return live;
    }

    it('play -> close x3 leaves no document/overlay listeners and no rAF', () => {
      const live = trackLive(document, dialog());
      const ov = make();
      for (let i = 0; i < 3; i += 1) {
        ov.play('campaign_intro', () => {});
        expect(live.size).toBeGreaterThan(0);
        ov.close();
      }
      expect([...live]).toEqual([]);
      expect(clock.pending()).toBe(0);
    });

    it('a key-closed dialog leaves only its keyup tail, which close() removes', () => {
      const live = trackLive(document, dialog());
      const ov = make();
      ov.play('campaign_intro', () => {});
      key('Escape');
      expect(live.size).toBeGreaterThan(0); // the tail
      ov.close();
      expect([...live]).toEqual([]);
    });

    it('an onComplete that calls play() again leaves one listener set and one rAF loop, and slams', () => {
      const live = trackLive(document, dialog());
      const ov = make();
      ov.play('campaign_intro', () => {});
      const single = new Set(live);
      ov.close();
      ov.play('epilogue_outpost_sigma', () => ov.play('campaign_intro', () => {}));
      $('#story-dialog-skip').click();
      expect(new Set(live)).toEqual(single);
      clock.frame(0); // drains the one-off live write; a stacked loop would re-queue twice
      expect(clock.pending()).toBe(1);
      expect(dialog().style.display).toBe('flex');
      expect(dialog().dataset.index).toBe('0');
      expect(dialog().classList.contains('sd-slam')).toBe(true);
      clock.frame(LONG);
      expect(clock.pending()).toBe(0);
      ov.close();
      expect([...live]).toEqual([]);
    });

    it('a key-closed dialog whose onComplete plays again keeps one listener set plus the keyup tail, which eats the next keyup', () => {
      const live = trackLive(document, dialog());
      const ov = make();
      ov.play('campaign_intro', () => {});
      const single = new Set(live);
      key('Escape');
      const tail = new Set(live);
      ov.close();
      expect([...live]).toEqual([]);
      ov.play('epilogue_outpost_sigma', () => ov.play('campaign_intro', () => {}));
      key('Escape');
      expect(dialog().style.display).toBe('flex');
      expect(new Set(live)).toEqual(new Set([...single, ...tail]));
      const keyupSpy = vi.fn();
      window.addEventListener('keyup', keyupSpy);
      try {
        expect(key('Escape', { type: 'keyup' }).defaultPrevented).toBe(true);
        expect(keyupSpy).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener('keyup', keyupSpy);
      }
      expect(new Set(live)).toEqual(single);
      ov.close();
      expect([...live]).toEqual([]);
    });

    it('a pointer-closed dialog leaves only its tap swallow, which the first event past the guard removes', () => {
      const live = trackLive(document, dialog());
      make().play('campaign_intro', () => {});
      $('#story-dialog-skip').click();
      expect(live.size).toBeGreaterThan(0);
      clock.t += GUARD;
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
      expect([...live]).toEqual([]);
    });

    it('close() removes a pending tap swallow', () => {
      const live = trackLive(document, dialog());
      const ov = make();
      ov.play('campaign_intro', () => {});
      $('#story-dialog-skip').click();
      ov.close();
      expect([...live]).toEqual([]);
    });
  });
});
