// Roadmap 2.1 task 4: DOM long-press tooltips on the tower buttons, run through
// the REAL _bindDOMEvents against one shared DOM, as hudButtons.test.js does.
// The touch two-step confirm moved with the tower panel into the radial
// (roadmap 3.3): see src/ui/RadialMenu.test.js.

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class {} },
  },
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GameScene from './GameScene.js';
import { TOWER_DEFS } from '../data/towers.js';
import { LONG_PRESS_MS, PEEK_LINGER_MS } from '../data/input.js';

const BUTTON_IDS = [
  'wave-btn', 'speed-btn', 'pause-btn', 'msg-btn', 'msg-cancel-btn', 'exit-btn', 'cancel-btn',
];
const DIV_IDS = ['game', 'hud-layer', 'game-msg', 'paused-overlay', 'tower-tooltip'];

function setupDOM() {
  document.body.replaceChildren();
  for (const id of BUTTON_IDS) {
    const b = document.createElement('button'); b.id = id; document.body.appendChild(b);
  }
  for (const id of DIV_IDS) {
    const d = document.createElement('div'); d.id = id; document.body.appendChild(d);
  }
  for (const type of Object.keys(TOWER_DEFS)) {
    const b = document.createElement('button');
    b.className = 'tower-btn'; b.dataset.type = type;
    document.body.appendChild(b);
  }
}

function makeScene() {
  const gs = Object.create(GameScene.prototype);
  gs.selectedType = null;
  gs.game = { events: { emit() {}, on() {}, off() {} }, registry: { get: () => null } };
  gs.events = { once() {}, off() {} };
  gs._sentries = [];
  gs._unwireSceneEvents = () => {};
  gs._syncCancelButton     = () => {};
  gs._bindDOMEvents();
  return gs;
}

const ptr = (type, pointerType) =>
  Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerType, clientX: 0, clientY: 0 });
const click = () => new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
const $ = (id) => document.getElementById(id);
// A real press: pointerdown, pointerup, then the browser's click.
function press(el, pointerType) {
  el.dispatchEvent(ptr('pointerdown', pointerType));
  el.dispatchEvent(ptr('pointerup', pointerType));
  el.dispatchEvent(click());
}

describe('tower button tooltip on touch', () => {
  let gs;
  beforeEach(() => { vi.useFakeTimers(); setupDOM(); gs = makeScene(); });
  afterEach(() => vi.useRealTimers());
  const archer = () => document.querySelector('.tower-btn[data-type="archer"]');

  it('a touch pointerenter does not flash the tooltip', () => {
    archer().dispatchEvent(ptr('pointerenter', 'touch'));
    expect($('tower-tooltip').style.display).not.toBe('block');
  });

  it('a mouse pointerenter shows it and pointerleave hides it (desktop unchanged)', () => {
    archer().dispatchEvent(ptr('pointerenter', 'mouse'));
    expect($('tower-tooltip').style.display).toBe('block');
    archer().dispatchEvent(ptr('pointerleave', 'mouse'));
    expect($('tower-tooltip').style.display).toBe('none');
  });

  it('a long-press shows the tooltip WITHOUT arming a build, then hides after the linger', () => {
    archer().dispatchEvent(ptr('pointerdown', 'touch'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    archer().dispatchEvent(ptr('pointerup', 'touch'));
    archer().dispatchEvent(click());
    expect($('tower-tooltip').style.display).toBe('block');
    expect(gs.selectedType).toBeNull();
    vi.advanceTimersByTime(PEEK_LINGER_MS);
    expect($('tower-tooltip').style.display).toBe('none');
  });

  it('a plain tap still arms the build and shows no tooltip', () => {
    press(archer(), 'touch');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(gs.selectedType).toBe('archer');
    expect($('tower-tooltip').style.display).not.toBe('block');
  });

  it('shutdown detaches the long-press and cancels a pending linger', () => {
    archer().dispatchEvent(ptr('pointerdown', 'touch'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    archer().dispatchEvent(ptr('pointerup', 'touch'));   // linger timer now pending
    const bound = archer();
    gs.shutdown();
    expect(vi.getTimerCount()).toBe(0);
    expect($('tower-tooltip').style.display).toBe('none');
    // The ORIGINAL node (the clone has no listeners anyway): a leaked listener would still fire.
    bound.dispatchEvent(ptr('pointerdown', 'touch'));
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect($('tower-tooltip').style.display).not.toBe('block');
  });
});

describe('toast', () => {
  beforeEach(() => { setupDOM(); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('is a .game-toast in #game (CSS places it over the map) and expires', () => {
    GameScene.prototype._toast.call({}, 'No build slot there');
    const el = $('game').querySelector('.game-toast');
    expect(el?.textContent).toBe('No build slot there');
    vi.advanceTimersByTime(1500);
    expect($('game').querySelector('.game-toast')).toBeNull();
  });
});
