import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { armGestureTail, disarmGestureTail } from './gestureTail.js';

const TAP_TYPES = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'];
const WINDOW = 250;

let t;
const now = () => t;

// Live document listeners keyed by type + capture + handler; a remove only counts
// when it removes something (the 2026-08-17 leak-test pattern).
let live;
let options;
function trackDocument() {
  live = new Set();
  options = [];
  const ids = new WeakMap();
  let nextId = 1;
  const fnId = (fn) => { if (!ids.has(fn)) ids.set(fn, nextId++); return ids.get(fn); };
  const keyOf = (type, fn, opts) => `${type}|${typeof opts === 'object' ? !!opts?.capture : !!opts}|${fnId(fn)}`;
  const add = document.addEventListener.bind(document);
  const remove = document.removeEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, opts) => {
    live.add(keyOf(type, fn, opts));
    options.push([type, opts]);
    return add(type, fn, opts);
  });
  vi.spyOn(document, 'removeEventListener').mockImplementation((type, fn, opts) => {
    live.delete(keyOf(type, fn, opts));
    return remove(type, fn, opts);
  });
}

const liveTypes = () => [...live].map((k) => k.split('|')[0]).sort();

// A plain cancelable bubbling event; jsdom lacks TouchEvent/PointerEvent constructors.
function fire(type, init = {}, target = under) {
  const e = type.startsWith('key')
    ? new KeyboardEvent(type, { key: ' ', bubbles: true, cancelable: true, ...init })
    : new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

let under;
let underSpy;

describe('gestureTail', () => {
  beforeEach(() => {
    t = 1000;
    document.body.innerHTML = '<div id="under"></div>';
    under = document.getElementById('under');
    underSpy = vi.fn();
    for (const type of [...TAP_TYPES, 'keydown', 'keyup']) under.addEventListener(type, underSpy);
    trackDocument();
  });

  afterEach(() => {
    disarmGestureTail();
    vi.restoreAllMocks();
  });

  describe('tap tail', () => {
    it('swallows every pointer, touch and click event inside the window', () => {
      armGestureTail({ now, windowMs: WINDOW, key: false });
      t += WINDOW - 1;
      for (const type of TAP_TYPES) {
        const e = fire(type);
        expect(e.defaultPrevented, type).toBe(true);
      }
      expect(underSpy).not.toHaveBeenCalled();
    });

    it('registers every tap listener capture and non-passive (a passive touchstart cannot preventDefault)', () => {
      armGestureTail({ now, windowMs: WINDOW, key: false });
      const tap = options.filter(([type]) => TAP_TYPES.includes(type));
      expect(tap.map(([type]) => type).sort()).toEqual([...TAP_TYPES].sort());
      for (const [type, opts] of tap) expect(opts, type).toEqual({ capture: true, passive: false });
    });

    it('the first event at the window edge passes and removes every listener', () => {
      armGestureTail({ now, windowMs: WINDOW, key: false });
      expect(liveTypes()).toEqual([...TAP_TYPES].sort());
      t += WINDOW;
      const e = fire('touchstart');
      expect(e.defaultPrevented).toBe(false);
      expect(underSpy).toHaveBeenCalledTimes(1);
      expect([...live]).toEqual([]);
      fire('click');
      expect(underSpy).toHaveBeenCalledTimes(2);
    });

    it('without key, no key listener is added', () => {
      armGestureTail({ now, windowMs: WINDOW, key: false });
      expect(liveTypes().filter((type) => type.startsWith('key'))).toEqual([]);
      const e = fire('keyup');
      expect(e.defaultPrevented).toBe(false);
    });
  });

  describe('key tail', () => {
    it('swallows the next keyup once, then passes keys again', () => {
      armGestureTail({ now, windowMs: WINDOW, key: true });
      const up = fire('keyup');
      expect(up.defaultPrevented).toBe(true);
      expect(liveTypes().filter((type) => type.startsWith('key'))).toEqual([]);
      const again = fire('keyup');
      expect(again.defaultPrevented).toBe(false);
      expect(underSpy).toHaveBeenCalledTimes(1);
    });

    it('swallows held repeats until a fresh keydown, which passes', () => {
      armGestureTail({ now, windowMs: WINDOW, key: true });
      t += 5000; // a long hold: the key tail is not time-bounded
      for (let i = 0; i < 3; i += 1) expect(fire('keydown', { repeat: true }).defaultPrevented).toBe(true);
      expect(underSpy).not.toHaveBeenCalled();
      const fresh = fire('keydown', { repeat: false });
      expect(fresh.defaultPrevented).toBe(false);
      expect(underSpy).toHaveBeenCalledTimes(1);
      expect(liveTypes().filter((type) => type.startsWith('key'))).toEqual([]);
    });

    it('a post-window tap ends the tap tail only; the key tail keeps its own rule', () => {
      armGestureTail({ now, windowMs: WINDOW, key: true });
      t += WINDOW;
      fire('pointerdown');
      expect(liveTypes()).toEqual(['keydown', 'keyup']);
      expect(fire('keydown', { repeat: true }).defaultPrevented).toBe(true);
    });
  });

  describe('lifetime', () => {
    it('disarmGestureTail removes every listener', () => {
      armGestureTail({ now, windowMs: WINDOW, key: true });
      expect(live.size).toBe(TAP_TYPES.length + 2);
      disarmGestureTail();
      expect([...live]).toEqual([]);
      expect(fire('pointerdown').defaultPrevented).toBe(false);
    });

    it('arming again replaces the tail rather than stacking it', () => {
      armGestureTail({ now, windowMs: WINDOW, key: true });
      t += 100;
      armGestureTail({ now, windowMs: WINDOW, key: true });
      expect(live.size).toBe(TAP_TYPES.length + 2);
      // Measured from the second arm: 200 ms in is still inside it.
      t += 200;
      expect(fire('click').defaultPrevented).toBe(true);
    });

    it('module-level: it outlives the owner that armed it', () => {
      let owner = { leave: () => armGestureTail({ now, windowMs: WINDOW, key: false }) };
      owner.leave();
      owner = null;
      t += 10;
      expect(fire('touchend').defaultPrevented).toBe(true);
    });
  });
});
