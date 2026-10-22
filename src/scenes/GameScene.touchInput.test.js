// Roadmap 2.1 task 4: DOM long-press tooltips and the touch two-step confirm,
// run through the REAL _bindDOMEvents / _bindConfirmable / _closeTowerPanel
// against one shared DOM, as hudButtons.test.js does.

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class {} },
  },
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GameScene from './GameScene.js';
import { TOWER_DEFS } from '../data/towers.js';
import { LONG_PRESS_MS, PEEK_LINGER_MS, CONFIRM_WINDOW_MS } from '../data/input.js';

const BUTTON_IDS = [
  'wave-btn', 'speed-btn', 'pause-btn', 'panel-upgrade-btn', 'panel-sell-btn',
  'panel-reposition-btn', 'msg-btn', 'msg-cancel-btn', 'exit-btn', 'cancel-btn',
];
const PANEL_IDS = [
  'game', 'panel-name', 'panel-lvl', 'panel-dmg', 'panel-rng', 'panel-spd',
  'panel-matchups', 'panel-armour',
];
const DIV_IDS = [
  'hud-layer', 'game-msg', 'paused-overlay', 'tower-tooltip', 'tower-panel', 'panel-branch-picker', 'panel-std-stats', 'panel-barracks-stats',
];

function setupDOM() {
  document.body.replaceChildren();
  for (const id of BUTTON_IDS) {
    const b = document.createElement('button'); b.id = id; document.body.appendChild(b);
  }
  for (const id of DIV_IDS) {
    const d = document.createElement('div'); d.id = id; document.body.appendChild(d);
  }
  for (const id of PANEL_IDS) {
    const d = document.createElement('div'); d.id = id; document.body.appendChild(d);
  }
  for (const type of Object.keys(TOWER_DEFS)) {
    const b = document.createElement('button');
    b.className = 'tower-btn'; b.dataset.type = type;
    document.body.appendChild(b);
  }
  document.getElementById('panel-upgrade-btn').textContent = 'Upgrade 💰120: Longbow';
  document.getElementById('panel-sell-btn').textContent    = '💰 Sell (72g)';
}

function makeScene() {
  const gs = Object.create(GameScene.prototype);
  gs.selectedType = null;
  gs.game = { events: { emit() {}, on() {}, off() {} }, registry: { get: () => null } };
  gs.events = { once() {}, off() {} };
  gs._sentries = [];
  gs._unwireSceneEvents = () => {};
  gs._upgradeSelectedTower = vi.fn();
  gs._sellSelectedTower    = vi.fn();
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

describe('touch two-step confirm', () => {
  let gs;
  beforeEach(() => { vi.useFakeTimers(); setupDOM(); gs = makeScene(); });
  afterEach(() => vi.useRealTimers());
  const up = () => $('panel-upgrade-btn');
  const sell = () => $('panel-sell-btn');

  it('touch: first press arms with the cost kept in the label, second executes', () => {
    press(up(), 'touch');
    expect(gs._upgradeSelectedTower).not.toHaveBeenCalled();
    expect(up().classList.contains('confirming')).toBe(true);
    expect(up().textContent).toBe('Tap again: Upgrade 💰120: Longbow');
    press(up(), 'touch');
    expect(gs._upgradeSelectedTower).toHaveBeenCalledTimes(1);
    expect(up().classList.contains('confirming')).toBe(false);
    expect(up().textContent).toBe('Upgrade 💰120: Longbow');
  });

  it('pen behaves like touch', () => {
    press(sell(), 'pen');
    expect(gs._sellSelectedTower).not.toHaveBeenCalled();
    expect(sell().textContent).toBe('Tap again: 💰 Sell (72g)');
  });

  it('mouse executes on the first click and never arms', () => {
    press(up(), 'mouse');
    expect(gs._upgradeSelectedTower).toHaveBeenCalledTimes(1);
    expect(up().classList.contains('confirming')).toBe(false);
  });

  it('a keyboard activation (click with detail 0) executes at once', () => {
    up().dispatchEvent(ptr('pointerdown', 'touch'));   // stale touch pointerType
    up().dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(gs._upgradeSelectedTower).toHaveBeenCalledTimes(1);
  });

  it('reverts label and class after CONFIRM_WINDOW_MS, and a later press re-arms', () => {
    press(up(), 'touch');
    vi.advanceTimersByTime(CONFIRM_WINDOW_MS);
    expect(up().classList.contains('confirming')).toBe(false);
    expect(up().textContent).toBe('Upgrade 💰120: Longbow');
    press(up(), 'touch');
    expect(gs._upgradeSelectedTower).not.toHaveBeenCalled();
    expect(up().classList.contains('confirming')).toBe(true);
  });

  it('pressing the other button disarms the first and arms the second', () => {
    press(up(), 'touch');
    press(sell(), 'touch');
    expect(up().classList.contains('confirming')).toBe(false);
    expect(up().textContent).toBe('Upgrade 💰120: Longbow');
    expect(sell().classList.contains('confirming')).toBe(true);
    press(up(), 'touch');                       // up must re-arm, not confirm
    expect(gs._upgradeSelectedTower).not.toHaveBeenCalled();
    expect(gs._sellSelectedTower).not.toHaveBeenCalled();
  });

  it('closing the panel disarms: the next press arms again instead of executing', () => {
    press(up(), 'touch');
    gs._closeTowerPanel();
    expect(up().classList.contains('confirming')).toBe(false);
    expect(up().textContent).toBe('Upgrade 💰120: Longbow');
    press(up(), 'touch');
    expect(gs._upgradeSelectedTower).not.toHaveBeenCalled();
  });

  it('opening another tower disarms: tower B does not upgrade on one tap with A\'s armed gate', () => {
    gs.mapId = 0;
    gs.placementManager = {};
    const towerB = { id: 2, type: 'archer', level: 1, branch: null, damage: 10, range: 100,
                     fireRate: 1, totalCost: 60 };
    press(up(), 'touch');                        // armed on tower A
    expect(up().classList.contains('confirming')).toBe(true);
    GameScene.prototype._openTowerPanel.call(gs, towerB, 10, 10);   // REAL panel open
    expect(up().classList.contains('confirming')).toBe(false);
    expect(up().textContent).toMatch(/^Upgrade/);
    press(up(), 'touch');                        // first press on B must arm, not execute
    expect(gs._upgradeSelectedTower).not.toHaveBeenCalled();
    expect(up().classList.contains('confirming')).toBe(true);
  });

  it('a re-render of the label (post-upgrade cost change) is not clobbered by a stale revert', () => {
    press(up(), 'touch');
    // _openTowerPanel starts with _resetConfirm, then writes the new label.
    gs._resetConfirm();
    up().textContent = 'Upgrade 💰300: Sniper';
    vi.advanceTimersByTime(CONFIRM_WINDOW_MS);
    expect(up().textContent).toBe('Upgrade 💰300: Sniper');
  });

  it('branch Choose buttons use the same gate, keyed per branch', () => {
    const picker = $('panel-branch-picker');
    gs.selectedTower = { _damageMult: 1 };
    GameScene.prototype._renderBranchPicker.call(gs, picker, TOWER_DEFS.ice, { maxTierAllowed: 4 });
    const [a, b] = picker.querySelectorAll('.branch-choose-btn');
    press(a, 'touch');
    expect(gs._upgradeSelectedTower).not.toHaveBeenCalled();
    expect(a.textContent).toBe('Tap again: Choose');
    press(b, 'touch');                          // other branch: re-arm, not confirm
    expect(gs._upgradeSelectedTower).not.toHaveBeenCalled();
    expect(a.textContent).toBe('Choose');
    press(b, 'touch');
    expect(gs._upgradeSelectedTower).toHaveBeenCalledWith('B');
  });

  it('shutdown clears an armed button before the clone and cancels the timer', () => {
    press(up(), 'touch');
    gs.shutdown();
    expect(up().classList.contains('confirming')).toBe(false);
    expect(up().textContent).toBe('Upgrade 💰120: Longbow');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('tower panel position across upgrades', () => {
  beforeEach(() => { setupDOM(); });

  it('two consecutive upgrades reopen the panel at the same left/top', () => {
    const gs = Object.create(GameScene.prototype);
    gs.mapId = 0;
    gs.selectedType = null;
    gs._toast = vi.fn();
    gs._playTowerPop = vi.fn();
    gs._syncCancelButton = () => {};
    const tower = { id: 1, type: 'archer', level: 1, branch: null, damage: 10, range: 100,
                    fireRate: 1, totalCost: 60 };
    gs.placementManager = { upgradeTower: vi.fn((t, lvl) => { t.level = lvl; return true; }) };
    // Real layout is absent in jsdom, so give the clamp a roomy game area.
    $('game').getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
    GameScene.prototype._openTowerPanel.call(gs, tower, 200, 300);
    const panel = $('tower-panel');
    const opened = { left: panel.style.left, top: panel.style.top };
    expect(opened).toEqual({ left: '210px', top: '290px' });
    gs.selectedTower = tower;
    // maxTierAllowed on map 0 is 2, so keep the tower below it for both calls.
    gs._upgradeSelectedTower();
    expect({ left: panel.style.left, top: panel.style.top }).toEqual(opened);
    tower.level = 1;
    gs._upgradeSelectedTower();
    expect({ left: panel.style.left, top: panel.style.top }).toEqual(opened);
    expect(gs.placementManager.upgradeTower).toHaveBeenCalledTimes(2);
  });
});
