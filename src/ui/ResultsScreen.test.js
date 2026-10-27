import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ResultsScreen } from './ResultsScreen.js';
import { disarmGestureTail } from './gestureTail.js';
import { resultsModel } from '../systems/resultsModel.js';
import { resultsTimeline } from '../systems/resultsTimeline.js';
import { RESULTS, RESULTS_COPY } from '../data/results.js';
import { STORY_SPEAKERS } from '../data/story.js';
import { STORY_DIALOG } from '../data/storyDialog.js';
import { MAPS } from '../data/maps.js';
import { registerPortraits } from '../systems/portraitFallback.js';

// The shipped #results markup, so the tests exercise the real ids and nesting.
const html = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8');
const RESULTS_HTML = new DOMParser().parseFromString(html, 'text/html').getElementById('results')?.outerHTML ?? '';

const $ = (sel) => document.querySelector(sel);
const root = () => $('#results');
const GUARD = RESULTS.actGuardMs;
const LAST = MAPS.length - 1;
const VICTORY_END = resultsTimeline('victory').endMs;
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

// A deterministic clock and rAF queue: frames run only when the test says so.
function makeClock() {
  const clock = { t: 1000, queue: new Map(), nextId: 1 };
  clock.now = () => clock.t;
  clock.raf = (cb) => { const id = clock.nextId++; clock.queue.set(id, cb); return id; };
  clock.caf = (id) => { clock.queue.delete(id); };
  clock.frame = (ms = 16) => {
    clock.t += ms;
    const batch = [...clock.queue.values()];
    clock.queue.clear();
    for (const cb of batch) cb(clock.t);
  };
  clock.pending = () => clock.queue.size;
  return clock;
}

const victoryRun = (over = {}) => ({
  result: 'victory', mapId: 2, lives: 17, startLives: 22, stars: 2, kills: 214, goldEarned: 3480,
  timeMs: 582_000, wave: 10, waveCount: 10, newBest: { livesLost: false, time: true }, ...over,
});
const defeatRun = (over = {}) => ({
  result: 'defeat', mapId: 2, lives: 0, startLives: 20, stars: 0, kills: 151, goldEarned: 2210,
  timeMs: 425_000, wave: 9, waveCount: 12, newBest: null, ...over,
});

let clock;
let motionOn;
let made;
function make() {
  const rs = new ResultsScreen({ motion: () => motionOn, now: clock.now, raf: clock.raf, caf: clock.caf });
  made.push(rs);
  return rs;
}

function key(code, init = {}, target = document.activeElement || document.body) {
  const keys = { Space: ' ', Enter: 'Enter', Escape: 'Escape', Tab: 'Tab', KeyQ: 'q', Digit1: '1', KeyR: 'r' };
  const e = new KeyboardEvent(init.type || 'keydown', { key: keys[code], code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}
const click = (el) => { const e = new MouseEvent('click', { bubbles: true, cancelable: true }); el.dispatchEvent(e); return e; };
// Drains frames until the natural end of the reveal.
const playOut = (ms = VICTORY_END) => { for (let i = 0; i < 400 && clock.pending() && clock.t < 1000 + ms + 100; i += 1) clock.frame(16); };

let listenerErrors;
const onWindowError = (e) => listenerErrors.push(e.error ?? e.message);

describe('ResultsScreen', () => {
  beforeEach(() => {
    listenerErrors = [];
    window.addEventListener('error', onWindowError);
    document.body.innerHTML = RESULTS_HTML;
    clock = makeClock();
    motionOn = true;
    made = [];
    registerPortraits([]);
  });

  afterEach(() => {
    for (const rs of made) rs.close();
    disarmGestureTail();
    registerPortraits([]);
    window.removeEventListener('error', onWindowError);
    vi.restoreAllMocks();
    expect(listenerErrors).toEqual([]);
  });

  describe('render', () => {
    it('renders a victory model: texts, stars, chips, caption and data attributes', () => {
      const model = resultsModel(victoryRun());
      make().open(model, () => {});
      const r = root();
      expect(r.hidden).toBe(false);
      expect(r.dataset).toMatchObject({ result: 'victory', final: '0', stars: '2', phase: 'revealing', speaker: 'command', shape: 'box', glitch: '0' });
      expect($('#results-kicker').textContent).toBe(model.kicker);
      expect($('#results-banner-text').textContent).toBe('SECTOR HELD!');
      expect($('#results-stars').getAttribute('aria-label')).toBe('2 of 3 stars');
      expect([...document.querySelectorAll('.rs-star')].map((s) => s.dataset.earned)).toEqual(['1', '1', '0']);
      const chips = [...document.querySelectorAll('#results-chips .rs-chip')];
      expect(chips.map((c) => c.querySelector('.rs-chip-val').textContent)).toEqual(['17/22', '214', '3,480', '9:42']);
      expect(chips.map((c) => c.querySelector('.rs-chip-lbl').textContent)).toEqual(['LIVES', 'KILLS', 'GOLD', 'TIME']);
      expect(chips.map((c) => c.querySelector('.rs-new-best').hidden)).toEqual([true, true, true, false]);
      expect(chips[3].querySelector('.rs-new-best').textContent).toBe(RESULTS_COPY.newBest);
      expect(chips.every((c) => c.classList.contains('rs-reveal'))).toBe(true);
      expect($('#results-speaker').textContent).toBe(STORY_SPEAKERS.command.name);
      expect($('#results-line').textContent).toBe(model.line);
      expect(r.style.getPropertyValue('--rs-frame')).toBe(hex(STORY_SPEAKERS.command.color));
      expect(r.style.getPropertyValue('--rs-caption')).toBe(hex(STORY_SPEAKERS.command.caption));
    });

    it('lists actions primary first in DOM order, labelled from the copy, unused ones hidden', () => {
      make().open(resultsModel(victoryRun()), () => {});
      const visible = [...document.querySelectorAll('#results-actions .rs-btn')].filter((b) => !b.hidden);
      expect(visible.map((b) => b.id)).toEqual(['results-next', 'results-retry', 'results-map']);
      expect(visible.map((b) => b.textContent)).toEqual(['NEXT MISSION ▸', '↻ RETRY', 'WORLD MAP']);
      expect(visible.map((b) => b.getAttribute('aria-label'))).toEqual(['Next mission', 'Retry', 'World map']);
      expect(visible.map((b) => b.classList.contains('rs-btn--primary'))).toEqual([true, false, false]);
    });

    it('a defeat: the Veth look, no earned stars, RETRY primary and NEXT hidden', () => {
      make().open(resultsModel(defeatRun()), () => {});
      const r = root();
      expect(r.dataset).toMatchObject({ result: 'defeat', stars: '0', speaker: 'veth', shape: 'jagged', glitch: '1' });
      expect($('#results-banner-text').textContent).toBe('THE LINE FELL');
      expect(document.querySelectorAll('.rs-star[data-earned="1"]').length).toBe(0);
      expect($('#results-next').hidden).toBe(true);
      const order = [...document.querySelectorAll('#results-actions .rs-btn')].filter((b) => !b.hidden).map((b) => b.id);
      expect(order).toEqual(['results-retry', 'results-map']);
      expect($('#results-retry').classList.contains('rs-btn--primary')).toBe(true);
      expect($('#results-next').classList.contains('rs-btn--primary')).toBe(false);
      expect([...document.querySelectorAll('.rs-new-best')].every((n) => n.hidden)).toBe(true);
      expect(r.style.getPropertyValue('--rs-frame')).toBe(hex(STORY_SPEAKERS.veth.color));
    });

    it('a final victory: WORLD MAP primary, RETRY, no NEXT', () => {
      make().open(resultsModel(victoryRun({ mapId: LAST })), () => {});
      expect(root().dataset.final).toBe('1');
      expect($('#results-kicker').textContent).toBe(RESULTS_COPY.campaignComplete);
      expect($('#results-next').hidden).toBe(true);
      const order = [...document.querySelectorAll('#results-actions .rs-btn')].filter((b) => !b.hidden).map((b) => b.id);
      expect(order).toEqual(['results-map', 'results-retry']);
    });

    it('publishes the --rs-* timings and per-element --rs-at delays from the timeline', () => {
      make().open(resultsModel(victoryRun()), () => {});
      const tl = resultsTimeline('victory');
      const r = root();
      expect(r.style.getPropertyValue('--rs-fade-ms')).toBe(`${RESULTS.fadeMs}ms`);
      expect(r.style.getPropertyValue('--rs-star-ms')).toBe(`${RESULTS.starMs}ms`);
      expect(r.style.getPropertyValue('--rs-skew-deg')).toBe(`${RESULTS.skewDeg}deg`);
      expect(r.style.getPropertyValue('--rs-glitch-period-ms')).toBe(`${STORY_DIALOG.glitchPeriodMs}ms`);
      const at = (el) => el.style.getPropertyValue('--rs-at');
      expect([...document.querySelectorAll('.rs-star')].map(at)).toEqual(tl.stars.map((b) => `${b.at}ms`));
      expect([...document.querySelectorAll('.rs-chip')].map(at)).toEqual(tl.chips.map((b) => `${b.at}ms`));
      expect(at(document.querySelectorAll('.rs-new-best')[3])).toBe(`${tl.newBest[3].at}ms`);
      expect(at($('#results-caption'))).toBe(`${tl.caption.at}ms`);
      expect(at($('#results-actions'))).toBe(`${tl.actions.at}ms`);
    });

    it('a missing portrait renders the initial; registered art renders an img whose error falls back', () => {
      make().open(resultsModel(victoryRun()), () => {});
      expect($('#results-portrait img')).toBeNull();
      expect($('#results-portrait .rs-initial').textContent).toBe('S');
      made[0].close();
      registerPortraits(['portrait-command']);
      made[0].open(resultsModel(victoryRun()), () => {});
      const img = $('#results-portrait img');
      expect(img.getAttribute('src')).toBe('/assets/portraits/portrait-command.png');
      expect(img.alt).toBe('');
      img.dispatchEvent(new Event('error'));
      expect($('#results-portrait img')).toBeNull();
      expect($('#results-portrait .rs-initial').textContent).toBe('S');
    });
  });

  describe('flow', () => {
    it('focuses the root at open and the primary at the natural end', () => {
      make().open(resultsModel(victoryRun()), () => {});
      expect(document.activeElement).toBe(root());
      playOut();
      expect(root().dataset.phase).toBe('ready');
      expect(root().classList.contains('rs-done')).toBe(true);
      expect(document.activeElement).toBe($('#results-next'));
      expect(clock.pending()).toBe(0);
    });

    it('a click while revealing finishes the reveal and does not act', () => {
      const onAction = vi.fn();
      make().open(resultsModel(victoryRun()), onAction);
      clock.frame(16);
      click($('#results-next'));
      expect(root().dataset.phase).toBe('ready');
      expect(root().classList.contains('rs-done')).toBe(true);
      expect(onAction).not.toHaveBeenCalled();
      expect(root().hidden).toBe(false);
    });

    it('a click on a button inside the guard does nothing; after it acts once and hides the root', () => {
      const onAction = vi.fn();
      make().open(resultsModel(victoryRun()), onAction);
      click(root());
      clock.t += GUARD - 1;
      click($('#results-next'));
      expect(onAction).not.toHaveBeenCalled();
      clock.t += 1;
      click($('#results-next'));
      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onAction).toHaveBeenCalledWith('next');
      expect(root().hidden).toBe(true);
      click($('#results-retry'));
      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('a click on the stage when ready does nothing', () => {
      const onAction = vi.fn();
      make().open(resultsModel(victoryRun()), onAction);
      click(root());
      clock.t += GUARD * 4;
      click($('.rs-stage'));
      click($('#results-line'));
      expect(onAction).not.toHaveBeenCalled();
      expect(root().hidden).toBe(false);
    });

    // Input is dispatched before rAF, so after a stall the stored flow can still read
    // revealing past endMs + guard: the decision must tick first.
    it('a stage tap after a stall past the end and the guard (no frame run) does not act or throw', () => {
      const onAction = vi.fn();
      make().open(resultsModel(victoryRun()), onAction);
      clock.t += VICTORY_END + GUARD + 500;
      click($('.rs-stage'));
      expect(onAction).not.toHaveBeenCalled();
      expect(root().dataset.phase).toBe('ready');
      expect(root().hidden).toBe(false);
    });

    it('Tab after a stall past the end (no frame run) wraps from the primary like any ready Tab', () => {
      make().open(resultsModel(victoryRun()), () => {});
      clock.t += VICTORY_END + GUARD + 500;
      key('Tab');
      expect(root().dataset.phase).toBe('ready');
      expect(document.activeElement).toBe($('#results-retry'));
    });

    it('motion off: ready at once with .motion-off, and the guard still holds', () => {
      motionOn = false;
      const onAction = vi.fn();
      make().open(resultsModel(victoryRun()), onAction);
      expect(root().dataset.phase).toBe('ready');
      expect(root().classList.contains('motion-off')).toBe(true);
      expect(root().classList.contains('rs-done')).toBe(true);
      expect(document.activeElement).toBe($('#results-next'));
      click($('#results-next'));
      expect(onAction).not.toHaveBeenCalled();
      clock.t += GUARD;
      click($('#results-next'));
      expect(onAction).toHaveBeenCalledWith('next');
    });

    it('fills the live region once, a frame after open', () => {
      const model = resultsModel(victoryRun());
      make().open(model, () => {});
      expect($('#results-live').textContent).toBe('');
      clock.frame(16);
      expect($('#results-live').textContent).toBe(model.announcement);
      const writes = vi.fn();
      new MutationObserver(writes).observe($('#results-live'), { childList: true, characterData: true, subtree: true });
      playOut();
      return Promise.resolve().then(() => expect(writes).not.toHaveBeenCalled());
    });
  });

  describe('keyboard', () => {
    const ready = (model = resultsModel(victoryRun())) => {
      const onAction = vi.fn();
      make().open(model, onAction);
      playOut();
      clock.t += GUARD;
      return onAction;
    };

    it('Enter acts on the focused button', () => {
      const onAction = ready();
      $('#results-retry').focus();
      key('Enter');
      expect(onAction).toHaveBeenCalledWith('retry');
    });

    it('Space with focus on the root acts on the primary', () => {
      const onAction = ready();
      root().focus();
      key('Space');
      expect(onAction).toHaveBeenCalledWith('next');
    });

    it('Escape is WORLD MAP', () => {
      const onAction = ready();
      key('Escape');
      expect(onAction).toHaveBeenCalledWith('map');
    });

    it('Enter while revealing only finishes', () => {
      const onAction = vi.fn();
      make().open(resultsModel(victoryRun()), onAction);
      key('Enter');
      expect(root().dataset.phase).toBe('ready');
      expect(onAction).not.toHaveBeenCalled();
    });

    it('Enter, Space and Escape are prevented and not propagated; Q is stopped only; Ctrl+R propagates', () => {
      const bubbleSpy = vi.fn();
      document.addEventListener('keydown', bubbleSpy);
      try {
        make().open(resultsModel(victoryRun()), () => {});
        for (const code of ['Space', 'Enter']) expect(key(code).defaultPrevented, code).toBe(true);
        playOut();
        const q = key('KeyQ');
        expect(q.defaultPrevented).toBe(false);
        expect(key('Escape').defaultPrevented).toBe(true);
        expect(bubbleSpy).not.toHaveBeenCalled();
        made[0].open(resultsModel(victoryRun()), () => {});
        const reload = key('KeyR', { ctrlKey: true });
        expect(reload.defaultPrevented).toBe(false);
        expect(bubbleSpy).toHaveBeenCalledTimes(1);
      } finally {
        document.removeEventListener('keydown', bubbleSpy);
      }
    });

    // Review Focus 2: Phaser's keyboard plugin listens on window (bubble).
    it('no game key reaches a window bubble listener, revealing or ready; Ctrl+R does', () => {
      const windowSpy = vi.fn();
      window.addEventListener('keydown', windowSpy);
      try {
        const onAction = vi.fn();
        make().open(resultsModel(victoryRun()), onAction);
        const codes = ['Digit1', 'KeyQ', 'Space', 'Enter', 'Escape'];
        for (const code of codes) key(code, {}, document.body);
        expect(windowSpy).not.toHaveBeenCalled();
        playOut();
        clock.t += GUARD;
        for (const code of ['Digit1', 'KeyQ']) key(code, { repeat: false }, document.body);
        for (const code of ['Space', 'Enter', 'Escape']) key(code, { repeat: true }, document.body);
        expect(windowSpy).not.toHaveBeenCalled();
        expect(onAction).not.toHaveBeenCalled();
        key('KeyR', { ctrlKey: true }, document.body);
        expect(windowSpy).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener('keydown', windowSpy);
      }
    });

    it('a repeat keydown is swallowed without acting; a defaultPrevented one is ignored', () => {
      const onAction = ready();
      const rep = key('Enter', { repeat: true });
      expect(rep.defaultPrevented).toBe(true);
      expect(onAction).not.toHaveBeenCalled();
      const guard = (e) => e.preventDefault();
      document.addEventListener('keydown', guard, true);
      try {
        made[0].close();
        made[0].open(resultsModel(victoryRun()), onAction);
        // The guard was registered first, so it runs before the screen's capture listener.
        key('Enter');
        expect(root().dataset.phase).toBe('revealing');
      } finally {
        document.removeEventListener('keydown', guard, true);
      }
      expect(onAction).not.toHaveBeenCalled();
    });

    it('Tab wraps over the visible buttons only', () => {
      ready(resultsModel(defeatRun()));
      expect(document.activeElement).toBe($('#results-retry'));
      expect(key('Tab').defaultPrevented).toBe(true);
      expect(document.activeElement).toBe($('#results-map'));
      key('Tab');
      expect(document.activeElement).toBe($('#results-retry'));
      key('Tab', { shiftKey: true });
      expect(document.activeElement).toBe($('#results-map'));
    });

    it('Tab while revealing is prevented and moves nothing', () => {
      make().open(resultsModel(victoryRun()), () => {});
      expect(key('Tab').defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(root());
      expect(root().dataset.phase).toBe('revealing');
    });
  });

  describe('leaving', () => {
    it('an action by tap arms the tap tail, which outlives the closed screen', () => {
      const onAction = vi.fn();
      make().open(resultsModel(victoryRun()), onAction);
      click(root());
      clock.t += GUARD;
      click($('#results-retry'));
      expect(onAction).toHaveBeenCalledWith('retry');
      made[0].close();
      clock.t += GUARD - 1;
      const second = new Event('touchstart', { bubbles: true, cancelable: true });
      document.body.dispatchEvent(second);
      expect(second.defaultPrevented).toBe(true);
    });

    it('an action by key also arms the key tail (the keyup is swallowed)', () => {
      const onAction = vi.fn();
      make().open(resultsModel(victoryRun()), onAction);
      playOut();
      clock.t += GUARD;
      key('Space');
      expect(onAction).toHaveBeenCalledWith('next');
      expect(key('Space', { type: 'keyup' }, document.body).defaultPrevented).toBe(true);
    });

    it('close() twice is safe; close() mid-reveal cancels the rAF and never acts', () => {
      const onAction = vi.fn();
      const rs = make();
      rs.open(resultsModel(victoryRun()), onAction);
      clock.frame(16);
      expect(clock.pending()).toBeGreaterThan(0);
      rs.close();
      rs.close();
      expect(clock.pending()).toBe(0);
      expect(onAction).not.toHaveBeenCalled();
      const r = root();
      expect(r.hidden).toBe(true);
      expect(r.classList.contains('rs-done') || r.classList.contains('motion-off')).toBe(false);
      for (const k of ['result', 'final', 'phase', 'stars', 'speaker', 'shape', 'glitch']) expect(r.dataset[k], k).toBeUndefined();
      expect($('#results-live').textContent).toBe('');
    });

    it('close() before the first frame leaves the live region empty', () => {
      const rs = make();
      rs.open(resultsModel(victoryRun()), () => {});
      rs.close();
      clock.frame(16);
      expect($('#results-live').textContent).toBe('');
    });
  });

  describe('listener pairing', () => {
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

    it('open -> close x3 leaves no document or root listeners and no rAF', () => {
      const live = trackLive(document, root());
      const rs = make();
      for (let i = 0; i < 3; i += 1) {
        rs.open(resultsModel(i % 2 ? defeatRun() : victoryRun()), () => {});
        expect(live.size).toBe(2);
        rs.close();
      }
      expect([...live]).toEqual([]);
      expect(clock.pending()).toBe(0);
    });

    it('open twice without close keeps one listener set', () => {
      const live = trackLive(document, root());
      const rs = make();
      rs.open(resultsModel(victoryRun()), () => {});
      rs.open(resultsModel(defeatRun()), () => {});
      expect(live.size).toBe(2);
      rs.close();
      expect([...live]).toEqual([]);
    });
  });
});
