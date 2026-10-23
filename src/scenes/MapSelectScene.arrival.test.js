import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor() {} events = { on() {}, once() {} } } },
}));

import MapSelectScene from './MapSelectScene.js';
import { mountMapSelectDom, wireScene, seedSave } from './mapSelectDom.testutil.js';
import { MAPS } from '../data/maps.js';
import { ARRIVAL, LAYOUT, ROUTE, HAZE } from '../data/worldMap.js';
import { bannerFor } from '../systems/campaignProgress.js';
import { arrivalFrame, planArrival } from '../systems/arrivalPlan.js';
import { routeFrameFor, nodeRects } from '../systems/worldMapLayout.js';
import { routePoints, parkShip, routeParamAt, exitParam, flight } from '../systems/worldRoute.js';
import { WorldMapRenderer } from '../ui/WorldMapRenderer.js';

const $ = (sel) => document.querySelector(sel);
const node = (id) => $(`.ow-node[data-map-id="${id}"]`);
const arrival = () => $('#map-overworld').dataset.arrival;
const FRAME_MS = 16;
const LAST = MAPS.length - 1;
const ALL = MAPS.map(() => 3);

// Post-win saves (GameScene saves the win before the map opens).
const AFTER_FIRST_CLEAR = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const FIRST_CLEAR_0 = { mapId: 0, result: 'victory', prevStars: 0, stars: 1 };

function makeScene(registry = new Map()) {
  const scene = wireScene(new MapSelectScene(), registry);
  scene.scene = { start: vi.fn() };
  return scene;
}

function sizeMapSelect(width, height) {
  vi.spyOn($('#map-select'), 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, width, height, right: width, bottom: height,
  });
}

// Live listeners keyed by type + handler + capture, so a remove only counts when
// it removes what was added.
function trackLive(target) {
  const live = new Set();
  const ids = new WeakMap();
  let next = 1;
  const id = (fn) => { if (!ids.has(fn)) ids.set(fn, next++); return ids.get(fn); };
  const key = (type, fn, opts) => `${type}|${typeof opts === 'object' ? !!opts?.capture : !!opts}|${id(fn)}`;
  const add = target.addEventListener.bind(target);
  const remove = target.removeEventListener.bind(target);
  vi.spyOn(target, 'addEventListener').mockImplementation((type, fn, opts) => {
    live.add(key(type, fn, opts));
    return add(type, fn, opts);
  });
  vi.spyOn(target, 'removeEventListener').mockImplementation((type, fn, opts) => {
    live.delete(key(type, fn, opts));
    return remove(type, fn, opts);
  });
  return live;
}

describe('MapSelectScene post-win arrival (spec 2.3)', () => {
  let scenes;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
    vi.stubGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(performance.now()), FRAME_MS));
    vi.stubGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
    // jsdom has no canvas: the renderer no-ops, render() is still called.
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

  describe('first clear of the frontier (advance)', () => {
    it('plays from the pre-win state to the next node with its card open after totalMs', () => {
      seedSave(AFTER_FIRST_CLEAR);
      enter({ from: FIRST_CLEAR_0 });
      expect(arrival()).toBe('playing');
      // Pre-win: frontier at the won map, next node locked, old sector count, card on the won map.
      expect($('#map-overworld').dataset.frontier).toBe('0');
      expect(node(1).classList.contains('locked')).toBe(true);
      expect(node(1).disabled).toBe(true);
      expect($('#wm-banner .wm-sectors').textContent).toBe(bannerFor([0, ...AFTER_FIRST_CLEAR.slice(1)]).sectors);
      expect(node(0).querySelector('.ow-node-stars').textContent).toBe('—');
      expect($('#featured-name').textContent).toBe(MAPS[0].name);

      vi.advanceTimersByTime(ARRIVAL.stampStartMs + ARRIVAL.stampEachMs);
      expect(node(0).querySelector('.ow-node-stars').textContent).toBe('★☆☆');
      expect(node(1).classList.contains('locked')).toBe(true);

      vi.advanceTimersByTime(ARRIVAL.lightStartMs - ARRIVAL.stampStartMs - ARRIVAL.stampEachMs + FRAME_MS);
      expect(node(1).classList.contains('next')).toBe(true);
      expect($('#map-overworld').dataset.frontier).toBe('1');
      expect($('#wm-banner .wm-sectors').textContent).toBe(bannerFor(AFTER_FIRST_CLEAR).sectors);
      expect(arrival()).toBe('playing');

      vi.advanceTimersByTime(ARRIVAL.totalMs - ARRIVAL.lightStartMs - FRAME_MS);
      expect(arrival()).toBe('done');
      expect($('#map-overworld').dataset.frontier).toBe('1');
      expect($('#featured-name').textContent).toBe(MAPS[1].name);
      expect(node(1).classList.contains('next')).toBe(true);
      expect(node(1).classList.contains('active')).toBe(true);
      expect(node(1).disabled).toBe(false);
      expect(document.querySelectorAll('.ow-node.active')).toHaveLength(1);
    });

    // The backdrop's idle repaint cap (final review I2) must not reach the arrival:
    // the story layer repaints on every rAF while it plays.
    it('the story layer repaints on every frame while the arrival plays', () => {
      const render = vi.spyOn(WorldMapRenderer.prototype, 'render');
      sizeMapSelect(1440, 900);
      seedSave(AFTER_FIRST_CLEAR);
      enter({ from: FIRST_CLEAR_0 });
      const before = render.mock.calls.length;
      const frames = 30;
      vi.advanceTimersByTime(frames * FRAME_MS);
      expect(arrival()).toBe('playing');
      expect(render.mock.calls.length - before).toBeGreaterThanOrEqual(frames);
    });

    it('the lit next node is selectable once the arrival is done', () => {
      seedSave([1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
      enter({ from: { mapId: 1, result: 'victory', prevStars: 0, stars: 1 } });
      vi.advanceTimersByTime(ARRIVAL.totalMs);
      node(0).click();
      expect($('#featured-name').textContent).toBe(MAPS[0].name);
      node(2).click();
      expect($('#featured-name').textContent).toBe(MAPS[2].name);
      expect(node(2).classList.contains('active')).toBe(true);
    });
  });

  describe('skip', () => {
    it.each([
      ['pointerdown', () => new MouseEvent('pointerdown', { bubbles: true, cancelable: true })],
      ['keydown', () => new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })],
    ])('a %s jumps to the end, is swallowed, and its trailing click selects/launches nothing', (_type, make) => {
      seedSave(AFTER_FIRST_CLEAR);
      const scene = enter({ from: FIRST_CLEAR_0 });
      vi.advanceTimersByTime(LAYOUT.inputGuardMs);
      expect(arrival()).toBe('playing');
      const ev = make();
      const stop = vi.spyOn(ev, 'stopPropagation');
      const prevent = vi.spyOn(ev, 'preventDefault');
      const seen = vi.fn();
      node(0).addEventListener(ev.type, seen);
      node(0).dispatchEvent(ev);
      expect(arrival()).toBe('done');
      expect(stop).toHaveBeenCalled();
      expect(prevent).toHaveBeenCalled();
      expect(seen).not.toHaveBeenCalled();
      // The rest of the same gesture lands on a node and LAUNCH: neither acts.
      node(0).click();
      $('#featured-play').click();
      expect($('.ow-node.active').dataset.mapId).toBe('1');
      expect($('#featured-name').textContent).toBe(MAPS[1].name);
      expect(scene.scene.start).not.toHaveBeenCalled();
    });

    it('removes the skip and visibility handlers when the arrival ends (natural end and skip)', () => {
      const rootLive = trackLive($('#map-select'));
      const docLive = trackLive(document);
      seedSave(AFTER_FIRST_CLEAR);
      const arrivalKeys = () => [...docLive].filter(k => /^(visibilitychange|keydown)\|/.test(k));
      enter({ from: FIRST_CLEAR_0 });
      vi.advanceTimersByTime(LAYOUT.inputGuardMs);
      expect(rootLive.size).toBe(1);
      expect(arrivalKeys()).toHaveLength(2);
      vi.advanceTimersByTime(ARRIVAL.totalMs);
      expect(arrival()).toBe('done');
      expect([...rootLive]).toEqual([]);
      expect(arrivalKeys()).toEqual([]);

      scenes.pop().emitShutdown();
      enter({ from: FIRST_CLEAR_0 });
      vi.advanceTimersByTime(LAYOUT.inputGuardMs);
      expect(rootLive.size).toBe(1);
      node(0).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect([...rootLive]).toEqual([]);
      // The skip's gesture swallow lives until the next gesture starts, then goes too.
      node(0).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(arrivalKeys()).toEqual([]);
      expect([...docLive].filter(k => /^(pointerup|click|keyup|pointerdown)\|/.test(k))).toEqual([]);
    });

    it('a key skips even with focus on <body> (the usual case after the title)', () => {
      seedSave(AFTER_FIRST_CLEAR);
      enter({ from: FIRST_CLEAR_0 });
      vi.advanceTimersByTime(LAYOUT.inputGuardMs);
      const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' });
      document.body.dispatchEvent(ev);
      expect(arrival()).toBe('done');
      expect(ev.defaultPrevented).toBe(true);
    });

    it('swallows the rest of the gesture however long the press is held; the next gesture acts', () => {
      seedSave(AFTER_FIRST_CLEAR);
      enter({ from: FIRST_CLEAR_0 });
      vi.advanceTimersByTime(LAYOUT.inputGuardMs);
      node(0).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(arrival()).toBe('done');
      vi.advanceTimersByTime(LAYOUT.inputGuardMs * 4);
      const up = new MouseEvent('pointerup', { bubbles: true, cancelable: true });
      node(0).dispatchEvent(up);
      node(0).click();
      expect(up.defaultPrevented).toBe(true);
      expect($('.ow-node.active').dataset.mapId).toBe('1');
      // A new press is not eaten, and its click selects.
      const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
      node(0).dispatchEvent(down);
      expect(down.defaultPrevented).toBe(false);
      node(0).click();
      expect($('.ow-node.active').dataset.mapId).toBe('0');
    });

    it('a key skip swallows its keyup and click; the next key acts', () => {
      seedSave(AFTER_FIRST_CLEAR);
      enter({ from: FIRST_CLEAR_0 });
      vi.advanceTimersByTime(LAYOUT.inputGuardMs);
      node(0).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: ' ' }));
      vi.advanceTimersByTime(LAYOUT.inputGuardMs * 4);
      const up = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: ' ' });
      node(0).dispatchEvent(up);
      node(0).click();
      expect(up.defaultPrevented).toBe(true);
      expect($('.ow-node.active').dataset.mapId).toBe('1');
      const next = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' });
      node(0).dispatchEvent(next);
      expect(next.defaultPrevented).toBe(false);
      node(0).click();
      expect($('.ow-node.active').dataset.mapId).toBe('0');
    });

    it('a skip followed by shutdown leaves zero net document / #map-select listeners', () => {
      const rootLive = trackLive($('#map-select'));
      const docLive = trackLive(document);
      seedSave(AFTER_FIRST_CLEAR);
      enter({ from: FIRST_CLEAR_0 });
      vi.advanceTimersByTime(LAYOUT.inputGuardMs);
      node(0).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(docLive.size).toBeGreaterThan(0);
      scenes.pop().emitShutdown();
      expect([...rootLive]).toEqual([]);
      expect([...docLive]).toEqual([]);
    });

    it('shutdown mid-arrival removes the handlers and stops the loop', () => {
      const rootLive = trackLive($('#map-select'));
      seedSave(AFTER_FIRST_CLEAR);
      enter({ from: FIRST_CLEAR_0 });
      vi.advanceTimersByTime(ARRIVAL.flyStartMs);
      scenes.pop().emitShutdown();
      expect([...rootLive]).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('waits for a story dialog open on entry, then plays', () => {
    seedSave(AFTER_FIRST_CLEAR, { seenStoryBeats: {} });
    enter({ from: FIRST_CLEAR_0 });
    expect($('#story-dialog').style.display).toBe('flex');
    expect(arrival()).toBe('waiting');
    vi.advanceTimersByTime(ARRIVAL.totalMs * 2);
    expect(arrival()).toBe('waiting');
    expect($('#map-overworld').dataset.frontier).toBe('0');
    $('#story-dialog-skip').click();
    expect(arrival()).toBe('playing');
    vi.advanceTimersByTime(ARRIVAL.totalMs);
    expect(arrival()).toBe('done');
    expect($('#featured-name').textContent).toBe(MAPS[1].name);
  });

  it('the end state carries no one-shot animation classes (class-identical to a fresh entry)', () => {
    seedSave(AFTER_FIRST_CLEAR);
    enter({ from: FIRST_CLEAR_0 });
    vi.advanceTimersByTime(ARRIVAL.lightStartMs + FRAME_MS);
    expect(document.querySelectorAll('.wm-stamp').length).toBeGreaterThan(0);
    vi.advanceTimersByTime(ARRIVAL.totalMs);
    expect(arrival()).toBe('done');
    expect(document.querySelectorAll('.wm-stamp, .wm-fade, .wm-focus')).toHaveLength(0);
  });

  it('a skip right after the lit beat also ends with no animation classes', () => {
    seedSave([3, 3, 3, 3, 0, 0, 0, 0, 0, 0]);
    enter({ from: { mapId: 3, result: 'victory', prevStars: 0, stars: 3 } });
    vi.advanceTimersByTime(ARRIVAL.lightStartMs + FRAME_MS);
    // The objective changes with the frontier, so that banner line cross-faded.
    expect(document.querySelectorAll('#wm-banner .wm-fade').length).toBeGreaterThan(0);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
    expect(arrival()).toBe('done');
    expect(document.querySelectorAll('.wm-stamp, .wm-fade, .wm-focus')).toHaveLength(0);
  });

  it('motion off: the end state at once, next node selected with its card open', () => {
    seedSave(AFTER_FIRST_CLEAR);
    enter({ from: FIRST_CLEAR_0 }, new Map([['ambientMotion', false]]));
    expect(arrival()).toBe('done');
    expect($('#map-overworld').dataset.frontier).toBe('1');
    expect(node(1).classList.contains('active')).toBe(true);
    expect(node(1).classList.contains('next')).toBe(true);
    expect($('#featured-name').textContent).toBe(MAPS[1].name);
    expect(node(0).querySelector('.ow-node-stars').textContent).toBe('★☆☆');
  });

  it('a hidden tab jumps the arrival to its end state on return', () => {
    seedSave(AFTER_FIRST_CLEAR);
    enter({ from: FIRST_CLEAR_0 });
    vi.advanceTimersByTime(ARRIVAL.flyStartMs);
    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    } finally {
      delete document.hidden;
    }
    expect(arrival()).toBe('done');
    expect($('#featured-name').textContent).toBe(MAPS[1].name);
  });

  it('create({}) after a create({ from }) entry does not replay', () => {
    seedSave(AFTER_FIRST_CLEAR);
    const scene = makeScene();
    scenes.push(scene);
    scene.create({ from: FIRST_CLEAR_0 });
    vi.advanceTimersByTime(ARRIVAL.totalMs);
    scene.emitShutdown();
    scene.create({});
    expect(arrival()).toBe('none');
    expect($('#map-overworld').dataset.frontier).toBe('1');
    expect($('#featured-name').textContent).toBe(MAPS[1].name);
  });

  it('a replay with more stars only re-stamps; the card stays on that mission', () => {
    seedSave([3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    enter({ from: { mapId: 0, result: 'victory', prevStars: 1, stars: 3 } });
    expect(arrival()).toBe('playing');
    expect(node(0).querySelector('.ow-node-stars').textContent).toBe('★☆☆');
    expect($('#map-overworld').dataset.frontier).toBe('1');
    expect($('#featured-name').textContent).toBe(MAPS[0].name);
    vi.advanceTimersByTime(ARRIVAL.stampStartMs + ARRIVAL.stampEachMs);
    expect(node(0).querySelector('.ow-node-stars').textContent).toBe('★★☆');
    vi.advanceTimersByTime(ARRIVAL.totalMs);
    expect(arrival()).toBe('done');
    expect(node(0).querySelector('.ow-node-stars').textContent).toBe('★★★');
    expect($('#featured-name').textContent).toBe(MAPS[0].name);
    expect($('.ow-node.active').dataset.mapId).toBe('0');
    expect($('#map-overworld').dataset.frontier).toBe('1');
  });

  it('a replay with the same or fewer stars: none, card on the replayed mission', () => {
    seedSave([3, 2, 1, 0, 0, 0, 0, 0, 0, 0]);
    enter({ from: { mapId: 0, result: 'victory', prevStars: 3, stars: 2 } });
    expect(arrival()).toBe('none');
    expect($('.ow-node.active').dataset.mapId).toBe('0');
    expect($('#featured-name').textContent).toBe(MAPS[0].name);
  });

  it('defeat: none, and that mission is selected', () => {
    seedSave([3, 2, 1, 0, 0, 0, 0, 0, 0, 0]);
    enter({ from: { mapId: 1, result: 'defeat', prevStars: 2, stars: 0 } });
    expect(arrival()).toBe('none');
    expect($('.ow-node.active').dataset.mapId).toBe('1');
    vi.advanceTimersByTime(ARRIVAL.totalMs);
    expect(arrival()).toBe('none');
  });

  it('complete: the banner switches to complete; the last render has frontAlpha 0 and hiveDim 1', () => {
    const render = vi.spyOn(WorldMapRenderer.prototype, 'render');
    sizeMapSelect(1440, 900);
    seedSave(ALL);
    enter({ from: { mapId: LAST, result: 'victory', prevStars: 0, stars: 3 } });
    expect(arrival()).toBe('playing');
    expect(bannerFor(ALL).complete).toBe(true);
    expect($('#wm-banner .wm-act').textContent).not.toBe(bannerFor(ALL).act);
    expect(render.mock.lastCall[0]).toMatchObject({ frontAlpha: 1, hiveDim: 0 });
    expect(render.mock.lastCall[0].frontR).toBeGreaterThan(0);

    vi.advanceTimersByTime(ARRIVAL.frontStartMs + ARRIVAL.frontMs / 2);
    const mid = render.mock.lastCall[0];
    expect(mid.hiveDim).toBeGreaterThan(0);
    expect(mid.hiveDim).toBeLessThan(1);
    expect(mid.frontAlpha).toBeGreaterThan(0);
    expect(mid.frontAlpha).toBeLessThan(1);

    vi.advanceTimersByTime(ARRIVAL.totalMs);
    expect(arrival()).toBe('done');
    const b = bannerFor(ALL);
    expect($('#wm-banner .wm-act').textContent).toBe(b.act);
    expect($('#wm-banner .wm-objective').textContent).toBe(b.objective);
    expect($('#featured-name').textContent).toBe(MAPS[LAST].name);
    const last = render.mock.lastCall[0];
    expect(last.frontAlpha).toBe(0);
    expect(last.hiveDim).toBe(1);
    expect(last.trailT).toBe(1);
  });

  it('a fresh entry with the hive as the frontier keeps a visible minimum haze', () => {
    const render = vi.spyOn(WorldMapRenderer.prototype, 'render');
    sizeMapSelect(1440, 900);
    seedSave([...MAPS.slice(1).map(() => 3), 0]);
    enter({});
    expect($('#map-overworld').dataset.frontier).toBe(String(LAST));
    const s = render.mock.lastCall[0];
    expect(s.frontR).toBeGreaterThanOrEqual(HAZE.minRadiusPx);
    expect(s.frontAlpha).toBe(1);
  });

  describe('story layer', () => {
    function geometry(width, height, cls) {
      const frame = routeFrameFor({ width, height }, cls);
      const points = routePoints(frame, ROUTE);
      return { frame, points, rects: nodeRects(frame, ROUTE, cls) };
    }

    it('starts with the ship at the won node exit and the trail at the node; ends parked at the next one', () => {
      const render = vi.spyOn(WorldMapRenderer.prototype, 'render');
      sizeMapSelect(1440, 900);
      seedSave(AFTER_FIRST_CLEAR);
      enter({ from: FIRST_CLEAR_0 });
      const { frame, points, rects } = geometry(1440, 900, 'tall');
      expect(render.mock.lastCall[0].ship).toEqual({ param: exitParam(points, 1, rects), offset: 0 });
      expect(render.mock.lastCall[0].trailT).toBeCloseTo(routeParamAt(points, 1));
      // Still there through the focus and stamp beats.
      vi.advanceTimersByTime(ARRIVAL.flyStartMs - FRAME_MS);
      expect(render.mock.lastCall[0].ship).toEqual({ param: exitParam(points, 1, rects), offset: 0 });
      expect(render.mock.lastCall[0].trailT).toBeCloseTo(routeParamAt(points, 1));
      // In flight: the trail is behind the ship and only grows.
      let prev = routeParamAt(points, 1);
      const step = FRAME_MS * 8;
      let elapsed = ARRIVAL.flyStartMs - FRAME_MS;
      while (elapsed + step < ARRIVAL.flyStartMs + ARRIVAL.flyMs) {
        vi.advanceTimersByTime(step);
        elapsed += step;
        const s = render.mock.lastCall[0];
        expect(s.trailT).toBeLessThan(s.ship.param);
        expect(s.trailT).toBeGreaterThanOrEqual(prev);
        prev = s.trailT;
      }
      vi.advanceTimersByTime(ARRIVAL.totalMs);
      expect(render.mock.lastCall[0].ship).toEqual(parkShip(points, 2, rects, frame));
      expect(render.mock.lastCall[0].trailT).toBeCloseTo(routeParamAt(points, 2));
    });

    it('a resize mid-flight keeps the fractions in the new geometry', () => {
      const render = vi.spyOn(WorldMapRenderer.prototype, 'render');
      sizeMapSelect(1440, 900);
      seedSave(AFTER_FIRST_CLEAR);
      enter({ from: FIRST_CLEAR_0 });
      // On a frame boundary, so the frame the resize redraws is the one at t.
      const t = FRAME_MS * Math.round((ARRIVAL.flyStartMs + ARRIVAL.flyMs / 2) / FRAME_MS);
      vi.advanceTimersByTime(t);
      sizeMapSelect(750, 340);
      window.dispatchEvent(new Event('resize'));
      expect(arrival()).toBe('playing');
      const f = arrivalFrame(planArrival({ from: FIRST_CLEAR_0, stars: AFTER_FIRST_CLEAR }), t);
      expect(f.shipT).toBeGreaterThan(0);
      expect(f.shipT).toBeLessThan(1);
      const { frame, points, rects } = geometry(750, 340, 'compact');
      const want = flight(points, 1, 2, rects, frame, f.shipT);
      const s = render.mock.lastCall[0];
      expect(s.points).toEqual(points);
      expect(s.ship.param).toBeCloseTo(want.ship.param);
      expect(s.ship.offset).toBeCloseTo(want.ship.offset);
      expect(s.trailT).toBeCloseTo(want.trailT);
    });
  });
});
