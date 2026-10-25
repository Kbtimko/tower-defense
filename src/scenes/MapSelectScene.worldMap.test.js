import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor() {} events = { on() {}, once() {} } } },
}));

import MapSelectScene from './MapSelectScene.js';
import { mountMapSelectDom, wireScene, seedSave } from './mapSelectDom.testutil.js';
import { MAPS } from '../data/maps.js';
import { LAYOUT, ROUTE } from '../data/worldMap.js';
import { bannerFor } from '../systems/campaignProgress.js';
import { commandQuote } from '../systems/briefingCard.js';
import { layoutClass, routeFrameFor, cardWidth } from '../systems/worldMapLayout.js';
import { routePoints } from '../systems/worldRoute.js';

const $ = (sel) => document.querySelector(sel);
const PARTIAL = [3, 2, 1, 0, 0, 0, 0, 0, 0, 0];
const ALL = MAPS.map(() => 3);

// A 2D context whose every method is a no-op, so the renderer and its rAF loop run.
function fakeCtx() {
  const target = {
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(target, {
    get: (t, p) => (p in t ? t[p] : () => {}),
    set: (t, p, v) => { t[p] = v; return true; },
  });
}

// Live listeners per target, keyed by type + handler + capture: a remove only
// counts when it removes something, so "zero" means nothing is left attached.
function trackLive(...targets) {
  const live = new Set();
  const key = (t, type, fn, opts) => `${targets.indexOf(t)}|${type}|${typeof opts === 'object' ? !!opts?.capture : !!opts}|${fnId(fn)}`;
  const ids = new WeakMap();
  let nextId = 1;
  const fnId = (fn) => { if (!ids.has(fn)) ids.set(fn, nextId++); return ids.get(fn); };
  for (const t of targets) {
    const add = t.addEventListener.bind(t);
    const remove = t.removeEventListener.bind(t);
    vi.spyOn(t, 'addEventListener').mockImplementation((type, fn, opts) => {
      live.add(key(t, type, fn, opts));
      return add(type, fn, opts);
    });
    vi.spyOn(t, 'removeEventListener').mockImplementation((type, fn, opts) => {
      live.delete(key(t, type, fn, opts));
      return remove(type, fn, opts);
    });
  }
  return live;
}

function makeScene(registry = new Map()) {
  const scene = wireScene(new MapSelectScene(), registry);
  scene.scene = { start: vi.fn() };
  return scene;
}

function passGuard() {
  vi.advanceTimersByTime(LAYOUT.inputGuardMs);
}

describe('MapSelectScene world map', () => {
  let scenes;

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom has no canvas: the renderer no-ops unless a test installs fakeCtx.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    localStorage.clear();
    mountMapSelectDom();
    scenes = [];
  });

  afterEach(() => {
    for (const s of scenes) s.emitShutdown();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function enter(data = {}, registry) {
    const scene = makeScene(registry);
    scenes.push(scene);
    scene.create(data);
    return scene;
  }

  describe('nodes', () => {
    it('are <button>s in route order inside #wm-nodes, leaving the canvases and tags in place', () => {
      seedSave(PARTIAL);
      enter();
      const nodes = [...document.querySelectorAll('#map-overworld .ow-node')];
      expect(nodes.map(n => n.tagName)).toEqual(MAPS.map(() => 'BUTTON'));
      expect(nodes.map(n => Number(n.dataset.mapId))).toEqual(MAPS.map(m => m.id));
      expect(nodes.every(n => n.parentElement.id === 'wm-nodes')).toBe(true);
      for (const id of ['wm-backdrop', 'wm-story', 'wm-earth-tag', 'wm-hive-tag']) {
        expect(document.getElementById(id).parentElement.id).toBe('map-overworld');
      }
    });

    it('put the stars beside the label, not inside it (compact CSS hides the label)', () => {
      seedSave(PARTIAL);
      enter();
      const n0 = $('.ow-node[data-map-id="0"]');
      expect(n0.querySelector('.ow-node-stars').parentElement).toBe(n0);
      expect(n0.querySelector('.ow-node-label .ow-node-stars')).toBeNull();
      expect(n0.querySelector('.ow-node-stars').textContent).toBe('★★★');
    });

    it('locked nodes are :disabled buttons (no click from mouse, Enter or Space), and a click selects nothing', () => {
      seedSave(PARTIAL);
      enter();
      passGuard();
      const locked = $('.ow-node[data-map-id="5"]');
      // Browsers synthesize a click from Enter/Space only on enabled buttons, so
      // :disabled is what keeps the keyboard out (jsdom can't synthesize it).
      expect(locked.matches(':disabled')).toBe(true);
      expect($('.ow-node[data-map-id="3"]').matches(':disabled')).toBe(false);
      locked.click();
      expect(locked.classList.contains('active')).toBe(false);
      expect($('.ow-node.active').dataset.mapId).toBe('3');
      expect($('#featured-name').textContent).toBe(MAPS[3].name);
    });

    it('clicking an open node selects it and opens its card', () => {
      seedSave(PARTIAL);
      enter();
      passGuard();
      $('.ow-node[data-map-id="1"]').click();
      expect($('.ow-node.active').dataset.mapId).toBe('1');
      expect(document.querySelectorAll('.ow-node.active')).toHaveLength(1);
      expect($('#featured-name').textContent).toBe(MAPS[1].name);
    });

    it("count a garbage save entry as 0 stars, so it can't unlock the next node", () => {
      seedSave([3, '3', 3, 0, 0, 0, 0, 0, 0, 0]);
      enter();
      expect($('.ow-node[data-map-id="2"]').disabled).toBe(true);
      expect($('#map-overworld').dataset.frontier).toBe('1');
      // Totals sum the sanitized stars, never string-concatenate the raw save.
      expect($('#total-stars').textContent).toBe('★ 6 / 30');
      const chip = [...document.querySelectorAll('.stat-chip')].find(c => c.querySelector('.stat-chip-lbl').textContent === 'Total Stars');
      expect(chip.querySelector('.stat-chip-val').textContent).toBe('6');
    });
  });

  describe('default selection', () => {
    it('is the frontier', () => {
      seedSave(PARTIAL);
      enter();
      expect($('.ow-node.active').dataset.mapId).toBe('3');
      expect($('#featured-name').textContent).toBe(MAPS[3].name);
    });

    it('is map 1 on a fresh save and Last Light when all are cleared', () => {
      enter();
      expect($('.ow-node.active').dataset.mapId).toBe('0');
      scenes.pop().emitShutdown();
      seedSave(ALL);
      enter();
      expect($('.ow-node.active').dataset.mapId).toBe(String(MAPS.length - 1));
    });

    it('is the mission just played after a defeat or abandon', () => {
      seedSave(PARTIAL);
      enter({ from: { mapId: 1, result: 'defeat', prevStars: 2, stars: 0 } });
      expect($('.ow-node.active').dataset.mapId).toBe('1');
      scenes.pop().emitShutdown();
      enter({ from: { mapId: 2, result: 'abandon', prevStars: 1, stars: 0 } });
      expect($('.ow-node.active').dataset.mapId).toBe('2');
    });

    it('is the frontier after a first-clear victory (arrival end state), and ignores a from that points at a locked map', () => {
      seedSave(PARTIAL);
      // Motion off: the arrival (MapSelectScene.arrival.test.js) jumps to its end state.
      enter({ from: { mapId: 2, result: 'victory', prevStars: 0, stars: 1 } }, new Map([['ambientMotion', false]]));
      expect($('.ow-node.active').dataset.mapId).toBe('3');
      scenes.pop().emitShutdown();
      enter({ from: { mapId: 7, result: 'defeat', prevStars: 0, stars: 0 } });
      expect($('.ow-node.active').dataset.mapId).toBe('3');
    });
  });

  describe('story hooks and banner', () => {
    it('sets data-frontier and data-arrival="none" on entry', () => {
      seedSave(PARTIAL);
      enter();
      expect($('#map-overworld').dataset.frontier).toBe('3');
      expect($('#map-overworld').dataset.arrival).toBe('none');
    });

    it('banner text equals bannerFor (in progress)', () => {
      seedSave(PARTIAL);
      enter();
      const b = bannerFor(PARTIAL);
      expect($('#wm-banner .wm-act').textContent).toBe(b.act);
      expect($('#wm-banner .wm-objective').textContent).toBe(b.objective);
      expect($('#wm-banner .wm-sectors').textContent).toBe(b.sectors);
      expect($('#wm-banner .wm-sectors strong').textContent).toBe('3 of 10');
    });

    it('banner text equals bannerFor (campaign complete)', () => {
      seedSave(ALL);
      enter();
      const b = bannerFor(ALL);
      expect($('#wm-banner .wm-act').textContent).toBe(b.act);
      expect($('#wm-banner .wm-objective').textContent).toBe(b.objective);
      expect($('#wm-banner .wm-sectors').textContent).toBe(b.sectors);
    });
  });

  describe('briefing card and LAUNCH', () => {
    it("shows the selected mission's Command quote and ▶ LAUNCH", () => {
      seedSave(PARTIAL);
      enter();
      expect($('#featured-quote .fq-text').textContent).toBe(commandQuote(MAPS[3].storyKey));
      expect($('#featured-play').textContent).toBe('▶ LAUNCH');
      expect($('#featured-blurb')).toBeNull();
    });

    it('LAUNCH starts GameScene with { mapId, heroId }', () => {
      seedSave(PARTIAL);
      const scene = enter();
      passGuard();
      $('#featured-play').click();
      expect(scene.scene.start).toHaveBeenCalledTimes(1);
      expect(scene.scene.start).toHaveBeenCalledWith('GameScene', { mapId: 3, heroId: 'rael' });
    });
  });

  describe('quote scroll affordance (V3)', () => {
    // jsdom has no layout: give #featured-quote a fixed box and a content height.
    function sizeQuote(content, box = 100) {
      const q = $('#featured-quote');
      Object.defineProperty(q, 'clientHeight', { configurable: true, get: () => box });
      Object.defineProperty(q, 'scrollHeight', { configurable: true, get: () => content });
      return q;
    }

    it('fades the quote bottom only while it overflows, and drops the fade once scrolled to the end', () => {
      seedSave(PARTIAL);
      enter();
      passGuard();
      const q = sizeQuote(180);
      $('.ow-node[data-map-id="1"]').click();
      expect(q.classList.contains('fq-more')).toBe(true);
      q.scrollTop = 80;
      q.dispatchEvent(new Event('scroll'));
      expect(q.classList.contains('fq-more')).toBe(false);
      sizeQuote(90);
      q.scrollTop = 0;
      $('.ow-node[data-map-id="2"]').click();
      expect(q.classList.contains('fq-more')).toBe(false);
    });

    it('re-measures on layout (resize)', () => {
      seedSave(PARTIAL);
      enter();
      const q = sizeQuote(180);
      expect(q.classList.contains('fq-more')).toBe(false);
      window.dispatchEvent(new Event('resize'));
      expect(q.classList.contains('fq-more')).toBe(true);
    });
  });

  describe('input guard', () => {
    it('swallows a click on LAUNCH inside inputGuardMs; data-ready="1" only after it', () => {
      seedSave(PARTIAL);
      const scene = enter();
      expect($('#map-overworld').dataset.ready).toBeUndefined();
      $('#featured-play').click();
      vi.advanceTimersByTime(LAYOUT.inputGuardMs - 1);
      $('#featured-play').click();
      expect(scene.scene.start).not.toHaveBeenCalled();
      expect($('#map-overworld').dataset.ready).toBeUndefined();
      vi.advanceTimersByTime(1);
      expect($('#map-overworld').dataset.ready).toBe('1');
      $('#featured-play').click();
      expect(scene.scene.start).toHaveBeenCalledTimes(1);
    });

    // The guard is for the title's tap or key, never for a browser shortcut (Cmd+R).
    it.each(['ctrlKey', 'metaKey', 'altKey'])('lets a %s shortcut through during the window', (mod) => {
      seedSave(PARTIAL);
      enter();
      for (const type of ['keydown', 'keyup']) {
        const ev = new KeyboardEvent(type, { bubbles: true, cancelable: true, key: 'r', [mod]: true });
        document.body.dispatchEvent(ev);
        expect(ev.defaultPrevented, type).toBe(false);
      }
    });

    it.each(['pointerdown', 'pointerup', 'click', 'keydown', 'keyup'])('blocks %s during the window', (type) => {
      seedSave(PARTIAL);
      enter();
      const seen = vi.fn();
      const target = $('.ow-node[data-map-id="1"]');
      target.addEventListener(type, seen);
      const Ctor = type.startsWith('key') ? KeyboardEvent : MouseEvent;
      const ev = new Ctor(type, { bubbles: true, cancelable: true, key: 'Enter' });
      target.dispatchEvent(ev);
      expect(seen).not.toHaveBeenCalled();
      expect(ev.defaultPrevented).toBe(true);
      passGuard();
      target.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, key: 'Enter' }));
      expect(seen).toHaveBeenCalledTimes(1);
    });
  });

  describe('campaign_intro', () => {
    it('plays on the first entry only', () => {
      enter();
      expect($('#story-dialog').style.display).not.toBe('none');
      passGuard();
      $('#story-dialog-skip').click();
      expect($('#story-dialog').style.display).toBe('none');
      scenes.pop().emitShutdown();
      enter();
      expect($('#story-dialog').style.display).toBe('none');
    });

    it('reads reduced motion live from the registry', () => {
      const registry = new Map([['ambientMotion', false]]);
      enter({}, registry);
      expect($('#story-dialog').classList.contains('motion-off')).toBe(true);
      expect($('#story-dialog').dataset.phase).toBe('complete');
      scenes.pop().emitShutdown();
      localStorage.clear();
      registry.set('ambientMotion', true);
      enter({}, registry);
      expect($('#story-dialog').classList.contains('motion-off')).toBe(false);
      expect($('#story-dialog').dataset.phase).toBe('typing');
    });
  });

  describe('layout', () => {
    function sizeMapSelect(width, height) {
      vi.spyOn($('#map-select'), 'getBoundingClientRect').mockReturnValue({
        x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height,
      });
    }

    it('centres each node on its route point and publishes every --wm-* var from LAYOUT', () => {
      seedSave(PARTIAL);
      mountMapSelectDom();
      sizeMapSelect(1440, 900);
      enter();
      const viewport = { width: 1440, height: 900 };
      const cls = layoutClass(viewport);
      const pts = routePoints(routeFrameFor(viewport, cls), ROUTE);
      for (const m of MAPS) {
        const n = $(`.ow-node[data-map-id="${m.id}"]`);
        expect(n.style.left).toBe(`${pts[m.id + 1].x}px`);
        expect(n.style.top).toBe(`${pts[m.id + 1].y}px`);
      }
      const st = $('#map-select').style;
      expect(st.getPropertyValue('--wm-top')).toBe(`${LAYOUT.topBand[cls]}px`);
      expect(st.getPropertyValue('--wm-card-w')).toBe(`${cardWidth(viewport, cls)}px`);
      expect(st.getPropertyValue('--wm-stats')).toBe(`${LAYOUT.statsStrip[cls]}px`);
      expect(st.getPropertyValue('--wm-gutter')).toBe(`${LAYOUT.gutter}px`);
      expect(st.getPropertyValue('--wm-node')).toBe(`${LAYOUT.node[cls].d}px`);
      expect(st.getPropertyValue('--wm-node-final')).toBe(`${LAYOUT.node[cls].final}px`);
      expect(st.getPropertyValue('--wm-label-w')).toBe(`${LAYOUT.labelW[cls]}px`);
      expect($('#wm-earth-tag').style.left).toBe(`${pts[0].x}px`);
    });

    it('re-lays out on resize with the compact class at 750x340', () => {
      seedSave(PARTIAL);
      sizeMapSelect(1440, 900);
      enter();
      sizeMapSelect(750, 340);
      window.dispatchEvent(new Event('resize'));
      expect($('#map-select').style.getPropertyValue('--wm-node')).toBe(`${LAYOUT.node.compact.d}px`);
      const pts = routePoints(routeFrameFor({ width: 750, height: 340 }, 'compact'), ROUTE);
      expect($('.ow-node[data-map-id="0"]').style.left).toBe(`${pts[1].x}px`);
    });
  });

  describe('reduced motion', () => {
    it('applies .motion-off from the registry, and follows a live change', () => {
      const frames = [];
      vi.stubGlobal('requestAnimationFrame', (cb) => { frames.push(cb); return frames.length; });
      vi.stubGlobal('cancelAnimationFrame', () => {});
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCtx());
      vi.spyOn($('#map-select'), 'getBoundingClientRect').mockReturnValue({ width: 1440, height: 900 });
      const registry = new Map([['ambientMotion', false]]);
      enter({}, registry);
      expect($('#map-select').classList.contains('motion-off')).toBe(true);
      registry.set('ambientMotion', true);
      frames.shift()(16);
      expect($('#map-select').classList.contains('motion-off')).toBe(false);
    });
  });

  describe('lifecycle (Review Focus 5)', () => {
    it('enter -> shutdown x3 with every meta-bar overlay opened and closed leaves no live listeners or rAF', () => {
      const live = trackLive(window, document, $('#featured-quote'));
      const raf = new Set();
      let next = 1;
      vi.stubGlobal('requestAnimationFrame', () => { const id = next++; raf.add(id); return id; });
      vi.stubGlobal('cancelAnimationFrame', (id) => raf.delete(id));
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCtx());
      vi.spyOn($('#map-select'), 'getBoundingClientRect').mockReturnValue({ width: 1440, height: 900 });
      Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
      const fonts = new EventTarget();
      const fontsLive = trackLive(fonts);
      Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
      seedSave(PARTIAL);

      const am = {
        playMusic() {},
        getSettings: () => ({ masterVol: 0, sfxVol: 0, musicVol: 0, muted: true }),
        setMasterVolume() {}, setSfxVolume() {}, setMusicVolume() {}, setMuted() {},
      };
      const scene = makeScene(new Map([['audio', am]]));
      const opened = (id) => getComputedStyle(document.getElementById(id)).display !== 'none'
        && document.getElementById(id).style.display !== 'none';
      try {
        for (let i = 0; i < 3; i++) {
          scene.create({});
          passGuard();
          expect(raf.size).toBe(1);
          for (const [open, overlay, close] of [
            ['open-upgrades', 'upgrade-overlay', 'upgrade-close'],
            ['open-heroes', 'hero-mgmt-overlay', 'hero-mgmt-close'],
            ['open-settings', 'settings-overlay', 'settings-close'],
            ['open-story-log', 'story-log-overlay', 'story-log-close'],
            ['open-codex-ms', 'codex-overlay', 'codex-close'],
          ]) {
            document.getElementById(open).click();
            expect(opened(overlay), `${open} opens ${overlay}`).toBe(true);
            document.getElementById(close).click();
            expect(document.getElementById(overlay).style.display, `${close} closes ${overlay}`).toBe('none');
          }
          // Shutdown with one left open: shutdown must tear it down too.
          document.getElementById('open-settings').click();
          scene.emitShutdown();
          expect([...live]).toEqual([]);
          expect([...fontsLive]).toEqual([]);
          expect(raf.size).toBe(0);
        }
      } finally {
        delete document.fullscreenEnabled;
        delete document.fonts;
      }
    });
  });
});
