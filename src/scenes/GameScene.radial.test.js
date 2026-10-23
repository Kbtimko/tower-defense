// Roadmap 3.3: the radial wired into the REAL GameScene tap pipeline, economy and
// placement manager, against the shipped #radial markup. Towers are fakes (the
// real ones need a Phaser scene graph) that upgrade exactly as Tower/Barracks do.
vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class {} },
  },
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import GameScene from './GameScene.js';
import { EconomyManager } from '../systems/EconomyManager.js';
import { TowerPlacementManager, sellRefund } from '../systems/TowerPlacementManager.js';
import { previewRange } from '../systems/rangePreview.js';
import { TOWER_DEFS } from '../data/towers.js';
import { MAPS } from '../data/maps.js';
import { CANVAS_WIDTH, RAIL_WIDTH, WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';

const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
const shipped = new DOMParser().parseFromString(html, 'text/html').getElementById('radial');

const TIER4_MAP = MAPS.findIndex(m => m.maxTierAllowed >= 4);
const TIER2_MAP = MAPS.findIndex(m => m.maxTierAllowed === 2);

function setupDOM() {
  document.body.replaceChildren();
  const add = (tag, id, parent = document.body) => {
    const el = document.createElement(tag);
    if (id) el.id = id;
    parent.appendChild(el);
    return el;
  };
  add('div', 'game');
  const layer = add('div', 'hud-layer');
  layer.appendChild(document.importNode(shipped, true));
  const cancel = add('button', 'cancel-btn');
  cancel.hidden = true;
  for (const id of ['stat-lives', 'stat-gold', 'stat-wave', 'stat-kills', 'tower-tooltip',
    'msg-title', 'msg-body', 'game-msg', 'paused-overlay']) add('div', id);
  for (const id of ['msg-btn', 'msg-cancel-btn', 'exit-btn', 'pause-btn']) add('button', id);
  for (const type of Object.keys(TOWER_DEFS)) {
    const b = add('button');
    b.className = 'tower-btn';
    b.dataset.type = type;
  }
}

// Same semantics as Phaser's eventemitter3 for what matters here: `on` appends.
class SceneEmitter {
  constructor() { this._h = new Map(); }
  _list(e) { if (!this._h.has(e)) this._h.set(e, []); return this._h.get(e); }
  on(e, fn, ctx) { this._list(e).push({ fn, ctx, once: false }); return this; }
  once(e, fn, ctx) { this._list(e).push({ fn, ctx, once: true }); return this; }
  off(e, fn, ctx) { this._h.set(e, this._list(e).filter(h => !(h.fn === fn && h.ctx === ctx))); return this; }
  emit(e, ...args) {
    for (const h of this._list(e).slice()) { if (h.once) this.off(e, h.fn, h.ctx); h.fn.apply(h.ctx, args); }
    return this;
  }
}

// Mirrors Tower.upgrade / Barracks.upgrade: table value × meta multiplier.
function fakeTower(type, { x, y, def, zoneIndex, modifiers }) {
  const dm = modifiers.towerDamageMult ?? 1;
  const rm = modifiers.towerRangeMult ?? 1;
  const t = {
    type, x, y, zoneIndex, def, level: 1, branch: null, fireRate: def.fireRate, pierce: def.pierce,
    damage: Math.round(def.damage * dm), range: Math.round(def.range * rm), _damageMult: dm, _rangeMult: rm,
    showRange: vi.fn(), hideRange: vi.fn(), destroy: vi.fn(), startPop: vi.fn(),
    spawnSoldiers: vi.fn(), _rebuildSoldiers: vi.fn(),
    upgrade(tier, branch = null) {
      const key = tier === 4 && branch ? `tier4${branch}` : `tier${tier}`;
      const td = def[key];
      this.level = tier;
      if (branch) this.branch = branch;
      if (td.damage !== undefined) this.damage = Math.round(td.damage * dm);
      if (td.range !== undefined) this.range = Math.round(td.range * rm);
      if (type === 'barracks') this.soldierStats = def.soldierStats[key] ?? this.soldierStats;
    },
  };
  if (type === 'barracks') t.soldierStats = def.soldierStats.tier1;
  return t;
}

const fakeGfx = () => {
  const g = {};
  for (const m of ['clear', 'lineStyle', 'strokeCircle', 'fillStyle', 'fillCircle', 'destroy']) g[m] = vi.fn(() => g);
  return g;
};

const ZONES = () => [
  { cx: 300, cy: 300, radius: 20, occupied: false },
  { cx: 600, cy: 300, radius: 20, occupied: false },
];

function makeScene({ gold = 500, mapId = TIER2_MAP, mods = {} } = {}) {
  const scene = Object.create(GameScene.prototype);
  const events = new SceneEmitter();
  const zones = ZONES();
  const economy = new EconomyManager(gold, 20, events);
  Object.assign(scene, {
    events, mapId, kills: 0, over: false, won: false,
    aimMode: false, _aimSlot: null, repositionMode: false, repositioningBarracks: null,
    selectedType: null, selectedTower: null, _sentries: [],
    _towerRangeMult: mods.towerRangeMult ?? 1, _towerCostMult: mods.towerCostMult ?? 1,
    economy,
    placementManager: new TowerPlacementManager(zones, economy, (type, s, opts) => fakeTower(type, opts), mods),
    waveMgr: { currentWave: 0 },
    pathMgr: { isOnPath: () => true, getNearestPathProgress: () => 0.5, getPathPoints: () => [] },
    hero: {
      dead: false, level: 5, _timers: { w: 0 }, moveToProgress: vi.fn(),
      def: { abilities: { w: { aim: true } }, stats: { abilityUnlockLevels: { w: 1 } } },
    },
    inspector: {
      inspectableAt: () => null, tryClickInspect: vi.fn(), peekTower: vi.fn(), hidePeek: vi.fn(), destroy: vi.fn(),
    },
    game: { events: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }, registry: { get: (k) => (k === 'ambientMotion' ? false : null) } },
    _previewGfx: fakeGfx(),
    _commitStats: vi.fn(),
  });
  scene._wireSceneEvents();
  scene._createRadial();
  scene._bindCancelButton();
  return scene;
}

const radial = () => document.getElementById('radial');
const isOpen = () => !radial().hidden;
const $item = (id) => document.querySelector(`#radial .radial-item[data-id="${id}"]`);
const $hub = () => document.getElementById('radial-hub');
const hubText = () => $hub().textContent;
const cancelShown = () => !document.getElementById('cancel-btn').hidden;
const toasts = () => [...document.querySelectorAll('#game .game-toast')].map(t => t.textContent);
const ptr = (type, pointerType) =>
  Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerType, clientX: 0, clientY: 0 });
// A mouse click that began on the radial (the opening-release guard needs the pointerdown).
function clickItem(el) {
  el.dispatchEvent(ptr('pointerdown', 'mouse'));
  el.dispatchEvent(ptr('pointerup', 'mouse'));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
}
const tapZone = (scene, i) => {
  const z = scene.placementManager.getZones()[i];
  scene._onTap(z.cx, z.cy);
};
function buildAt(scene, i, type) {
  tapZone(scene, i);
  clickItem($item(`build:${type}`));
  return scene.placementManager.getTowers().find(t => t.zoneIndex === i);
}

describe('GameScene radial wiring', () => {
  beforeEach(() => { vi.useFakeTimers(); setupDOM(); });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  describe('build radial', () => {
    it('a tap on a free pad with nothing armed opens the build radial there', () => {
      const s = makeScene();
      tapZone(s, 0);
      expect(isOpen()).toBe(true);
      expect(radial().dataset.kind).toBe('build');
      expect(document.querySelectorAll('#radial .radial-item:not([hidden])').length).toBe(Object.keys(TOWER_DEFS).length);
      expect(cancelShown()).toBe(true);
      expect(document.querySelectorAll('.tower-btn.selected').length).toBe(0);
      expect(s.hero.moveToProgress).not.toHaveBeenCalled();
    });

    it('a build item deducts gold once, places once, and closes', () => {
      const s = makeScene({ gold: 500 });
      const place = vi.spyOn(s.placementManager, 'placeTower');
      const tower = buildAt(s, 0, 'archer');
      expect(place).toHaveBeenCalledTimes(1);
      expect(s.economy.gold).toBe(500 - TOWER_DEFS.archer.cost);
      expect(tower?.type).toBe('archer');
      expect(isOpen()).toBe(false);
      expect(cancelShown()).toBe(false);
    });

    it('shows and charges the meta-discounted price', () => {
      const s = makeScene({ gold: 500, mods: { towerCostMult: 0.9 } });
      tapZone(s, 0);
      const price = Math.round(TOWER_DEFS.archer.cost * 0.9);
      expect($item('build:archer').textContent).toContain(`${price}g`);
      clickItem($item('build:archer'));
      expect(s.economy.gold).toBe(500 - price);
    });

    // The rail and the radial must never disagree about a price.
    it('the rail tooltip and its affordability dimming use the discounted price too', () => {
      const price = Math.round(TOWER_DEFS.archer.cost * 0.9);
      const s = makeScene({ gold: price, mods: { towerCostMult: 0.9 } });
      const btn = document.querySelector('.tower-btn[data-type="archer"]');
      s._showTowerTooltip(btn);
      expect(document.getElementById('tower-tooltip').textContent).toContain(`${price}g`);
      expect(document.getElementById('tower-tooltip').textContent).not.toContain(`${TOWER_DEFS.archer.cost}g`);
      s._updateHUD();
      expect(btn.style.opacity).toBe('1');
    });

    it('a barracks built from the radial spawns its soldiers', () => {
      const s = makeScene();
      const b = buildAt(s, 0, 'barracks');
      expect(b.spawnSoldiers).toHaveBeenCalledTimes(1);
    });

    it('an unaffordable item only toasts: no gold spent, the radial stays open', () => {
      const s = makeScene({ gold: 10 });
      tapZone(s, 0);
      clickItem($item('build:archer'));
      expect(s.economy.gold).toBe(10);
      expect(s.placementManager.getTowers()).toEqual([]);
      expect(toasts()).toContain('Not enough gold!');
      expect(isOpen()).toBe(true);
    });

    it('gold earned while open flips an item to ready in place', () => {
      const s = makeScene({ gold: 10 });
      tapZone(s, 0);
      expect($item('build:archer').getAttribute('aria-disabled')).toBe('true');
      s.economy.earn(100);
      expect($item('build:archer').hasAttribute('aria-disabled')).toBe(false);
    });

    it('the hub tap closes; the selection ring sits on the pad while open', () => {
      const s = makeScene();
      tapZone(s, 0);
      expect(s._buildSlot.slotIndex).toBe(0);
      clickItem($hub());
      expect(isOpen()).toBe(false);
      expect(s._buildSlot).toBeNull();
    });

    it('a tap off any target only closes: the hero does not move (D5)', () => {
      const s = makeScene();
      tapZone(s, 0);
      s._onTap(50, 50);
      expect(isOpen()).toBe(false);
      expect(s.hero.moveToProgress).not.toHaveBeenCalled();
    });

    it('a tap on another free pad retargets', () => {
      const s = makeScene();
      tapZone(s, 0);
      tapZone(s, 1);
      expect(isOpen()).toBe(true);
      expect(s._buildSlot.slotIndex).toBe(1);
    });

    it('an armed rail build still places on a pad tap, with no radial', () => {
      const s = makeScene();
      s._selectTowerType('archer', document.querySelector('.tower-btn[data-type="archer"]'));
      tapZone(s, 0);
      expect(isOpen()).toBe(false);
      expect(s.placementManager.getTowers().length).toBe(1);
    });

    it('no radial opens once the level is over', () => {
      const s = makeScene();
      s.over = true;
      tapZone(s, 0);
      expect(isOpen()).toBe(false);
    });
  });

  describe('upgrade ring', () => {
    it('a tap on a tower opens its ring and shows its range', () => {
      const s = makeScene();
      const t = buildAt(s, 0, 'archer');
      s._onTap(t.x, t.y);
      expect(radial().dataset.kind).toBe('tower');
      expect(s.selectedTower).toBe(t);
      expect(t.showRange).toHaveBeenCalled();
      expect(hubText()).toContain('T1');
      expect($item('upgrade').textContent).toContain(TOWER_DEFS.archer.tier2.label);
      expect($item('upgrade').querySelector('.radial-cost').textContent).toBe(`${TOWER_DEFS.archer.tier2.cost}g`);
      expect($item('sell').textContent).toContain(`+${sellRefund(t.totalCost)}g`);
    });

    it('upgrade re-renders the ring in place', () => {
      const s = makeScene({ gold: 500 });
      const t = buildAt(s, 0, 'archer');
      s._onTap(t.x, t.y);
      const before = s.economy.gold;
      clickItem($item('upgrade'));
      expect(t.level).toBe(2);
      expect(s.economy.gold).toBe(before - TOWER_DEFS.archer.tier2.cost);
      expect(isOpen()).toBe(true);
      expect(hubText()).toContain('T2');
      // Map is capped at tier 2, so the next tier reads locked.
      expect($item('upgrade').dataset.state).toBe('locked');
    });

    it('a locked item toasts its unlock map and buys nothing', () => {
      const s = makeScene({ gold: 500 });
      const t = buildAt(s, 0, 'archer');
      s._onTap(t.x, t.y);
      clickItem($item('upgrade'));
      const gold = s.economy.gold;
      clickItem($item('upgrade'));
      expect(t.level).toBe(2);
      expect(s.economy.gold).toBe(gold);
      expect(toasts().some(m => /Map \d+/.test(m))).toBe(true);
    });

    it('sell refunds, removes the tower, hides its range and closes', () => {
      const s = makeScene({ gold: 500 });
      const t = buildAt(s, 0, 'archer');
      s._onTap(t.x, t.y);
      const gold = s.economy.gold;
      clickItem($item('sell'));
      expect(s.placementManager.getTowers()).toEqual([]);
      expect(s.economy.gold).toBe(gold + sellRefund(t.totalCost));
      expect(isOpen()).toBe(false);
      expect(t.hideRange).toHaveBeenCalled();
      expect(s.selectedTower).toBeNull();
    });

    it('a tap on its own tower (the hub) closes; another tower retargets', () => {
      const s = makeScene({ gold: 500 });
      const a = buildAt(s, 0, 'archer');
      const b = buildAt(s, 1, 'mage');
      s._onTap(a.x, a.y);
      s._onTap(b.x, b.y);
      expect(s.selectedTower).toBe(b);
      expect(a.hideRange).toHaveBeenCalled();
      s._onTap(b.x, b.y);
      expect(isOpen()).toBe(false);
    });

    // Port of GameScene.barracksTier4 (#44): a T3 barracks once threw and never opened.
    it('a T3 barracks on a tier-4 map offers both branches and buys Vanguard', () => {
      const s = makeScene({ gold: 2000, mapId: TIER4_MAP });
      const b = buildAt(s, 0, 'barracks');
      s._onTap(b.x, b.y);
      clickItem($item('upgrade'));
      clickItem($item('upgrade'));
      expect(b.level).toBe(3);
      expect($item('upgrade')).toBeNull();
      expect($item('branchA').textContent).toContain(TOWER_DEFS.barracks.tier4A.label);
      expect($item('branchB').textContent).toContain(TOWER_DEFS.barracks.tier4B.label);
      expect($item('branchA').textContent).toContain(`${TOWER_DEFS.barracks.tier4A.cost}g`);
      expect($item('branchB').textContent).toContain(`${TOWER_DEFS.barracks.tier4B.cost}g`);
      expect($item('sell')).not.toBeNull();
      expect($item('reposition')).not.toBeNull();
      clickItem($item('branchA'));
      expect(b.branch).toBe('A');
      expect(b.soldierStats.canBlockFlyers).toBe(true);
      expect(b._rebuildSoldiers).toHaveBeenCalled();
      expect(hubText()).toContain(TOWER_DEFS.barracks.tier4A.label);
      expect($item('upgrade').dataset.state).toBe('maxed');
    });

    it('a T3 barracks on a tier-3 map shows the branches locked', () => {
      const tier3 = MAPS.findIndex(m => m.maxTierAllowed === 3);
      const s = makeScene({ gold: 2000, mapId: tier3 });
      const b = buildAt(s, 0, 'barracks');
      s._onTap(b.x, b.y);
      clickItem($item('upgrade'));
      clickItem($item('upgrade'));
      expect($item('branchA').dataset.state).toBe('locked');
      expect($item('branchB').dataset.state).toBe('locked');
    });
  });

  describe('modes close the radial', () => {
    it('starting aim closes it', () => {
      const s = makeScene();
      tapZone(s, 0);
      s._onAbility({ slot: 'w' });
      expect(isOpen()).toBe(false);
      expect(s.aimMode).toBe(true);
    });

    it('arming a rail tower closes it', () => {
      const s = makeScene();
      tapZone(s, 0);
      s._selectTowerType('cannon', document.querySelector('.tower-btn[data-type="cannon"]'));
      expect(isOpen()).toBe(false);
      expect(s.selectedType).toBe('cannon');
    });

    it('reposition closes the ring and enters reposition mode', () => {
      const s = makeScene();
      const b = buildAt(s, 0, 'barracks');
      s._onTap(b.x, b.y);
      clickItem($item('reposition'));
      expect(isOpen()).toBe(false);
      expect(s.repositionMode).toBe(true);
      expect(s.repositioningBarracks).toBe(b);
      expect(cancelShown()).toBe(true);
    });

    it('Escape (ui:cancel) closes it', () => {
      const s = makeScene();
      tapZone(s, 0);
      s._onUiCancel();
      expect(isOpen()).toBe(false);
      expect(cancelShown()).toBe(false);
    });

    it('the ✕ Cancel button closes it', () => {
      const s = makeScene();
      tapZone(s, 0);
      document.getElementById('cancel-btn').click();
      expect(isOpen()).toBe(false);
    });

    it('defeat closes it', () => {
      const s = makeScene();
      tapZone(s, 0);
      s._onDefeat();
      expect(isOpen()).toBe(false);
    });

    it('victory closes it', () => {
      const s = makeScene();
      s.economy.lives = 20;
      s.saveMgr = { setStars: vi.fn(), hasSeenBeat: () => true, markBeatSeen: vi.fn() };
      tapZone(s, 0);
      s._onVictory();
      expect(isOpen()).toBe(false);
    });
  });

  describe('range preview', () => {
    it('a build item previews its range at the pad, gold when affordable, red when not', () => {
      const s = makeScene({ gold: 70 });
      tapZone(s, 0);
      const g = s._previewGfx;
      $item('build:archer').focus();
      const r = previewRange(TOWER_DEFS.archer.range, 1);
      expect(g.strokeCircle).toHaveBeenLastCalledWith(300, 300, r);
      expect(g.lineStyle.mock.calls.at(-1)[1]).toBe(0xffd700);
      $item('build:sniper').focus();
      expect(g.lineStyle.mock.calls.at(-1)[1]).toBe(0x884444);
      expect(hubText()).toContain(TOWER_DEFS.sniper.name);
    });

    it('closing clears the preview', () => {
      const s = makeScene();
      tapZone(s, 0);
      $item('build:archer').focus();
      s._previewGfx.clear.mockClear();
      s._onUiCancel();
      expect(s._previewGfx.clear).toHaveBeenCalled();
    });

    it('an upgrade previews the resulting range at the tower', () => {
      const s = makeScene();
      const t = buildAt(s, 0, 'archer');
      s._onTap(t.x, t.y);
      $item('upgrade').focus();
      expect(s._previewGfx.strokeCircle).toHaveBeenLastCalledWith(t.x, t.y, TOWER_DEFS.archer.tier2.range);
    });
  });

  describe('item peek', () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    const tip = () => document.getElementById('tower-tooltip');

    it('a build item peeks its name, cost and matchups', () => {
      const s = makeScene();
      tapZone(s, 0);
      s._onRadialPeek(s.radial._items[0], rect);
      expect(tip().style.display).toBe('block');
      expect(tip().textContent).toContain(TOWER_DEFS.archer.name);
    });

    it('an upgrade peeks the stat deltas', () => {
      const s = makeScene();
      const t = buildAt(s, 0, 'archer');
      s._onTap(t.x, t.y);
      s._onRadialPeek(s.radial._items.find(i => i.id === 'upgrade'), rect);
      expect(tip().textContent).toContain('DMG 15 → 25');
    });

    it('a branch peeks label, effect and armour with the tower damage multiplier', () => {
      // 28 × 1.06 rounds to 30: colossus armour 15 then absorbs exactly half
      // (it would read 54% if the multiplier were dropped).
      const s = makeScene({ gold: 2000, mapId: TIER4_MAP, mods: { towerDamageMult: 1.06 } });
      const t = buildAt(s, 0, 'ice');
      t.level = 3;
      s._onTap(t.x, t.y);
      s._onRadialPeek(s.radial._items.find(i => i.id === 'branchA'), rect);
      expect(tip().textContent).toContain(TOWER_DEFS.ice.tier4A.label);
      expect(tip().textContent).toContain(TOWER_DEFS.ice.tier4A.passiveEffect);
      expect(tip().textContent).toContain('🛡');
      expect(tip().textContent).toContain('Colossus 50%');
    });

    it('peeking a branch then sell leaves no armour rows behind', () => {
      const s = makeScene({ gold: 2000, mapId: TIER4_MAP });
      const t = buildAt(s, 0, 'ice');
      t.level = 3;
      s._onTap(t.x, t.y);
      s._onRadialPeek(s.radial._items.find(i => i.id === 'branchA'), rect);
      expect(tip().querySelector('.ar-heavy, .ar-floor')).not.toBeNull();
      s._onRadialPeek(s.radial._items.find(i => i.id === 'sell'), rect);
      expect(tip().querySelector('.ar-heavy, .ar-floor')).toBeNull();
      expect(tip().textContent).not.toContain('🛡');
    });

    // Body-level and z50: over a rail it would hide the controls under it.
    it('the peek is clamped to the map rect, never over a rail', () => {
      const s = makeScene();
      const game = document.getElementById('game');
      const canvas = game.appendChild(document.createElement('canvas'));
      game.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1440, height: 900 });
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: CANVAS_WIDTH, height: WORLD_HEIGHT });
      Object.defineProperty(tip(), 'offsetWidth', { configurable: true, get: () => 200 });
      Object.defineProperty(tip(), 'offsetHeight', { configurable: true, get: () => 80 });
      // A window wider than the map, so only a map clamp keeps the card off the right rail.
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(CANVAS_WIDTH + 400);
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(WORLD_HEIGHT + 200);
      tapZone(s, 0);
      // A radial footprint hard against the map's right edge.
      const nearRight = { left: RAIL_WIDTH + WORLD_WIDTH - 150, top: 300, width: 150, height: 150 };
      s._onRadialPeek(s.radial._items[0], nearRight);
      const left = parseFloat(tip().style.left);
      expect(left).toBeGreaterThanOrEqual(RAIL_WIDTH);
      expect(left + 200).toBeLessThanOrEqual(RAIL_WIDTH + WORLD_WIDTH);
    });

    it('sell peeks the refund', () => {
      const s = makeScene();
      const t = buildAt(s, 0, 'archer');
      s._onTap(t.x, t.y);
      s._onRadialPeek(s.radial._items.find(i => i.id === 'sell'), rect);
      expect(tip().textContent).toContain(`${sellRefund(t.totalCost)}`);
    });

    it('the ring hub peeks the tower inspector; the build hub peeks nothing', () => {
      const s = makeScene();
      const t = buildAt(s, 0, 'archer');
      s._onTap(t.x, t.y);
      s._onRadialPeek({ id: 'hub' }, rect);
      expect(s.inspector.peekTower).toHaveBeenCalledWith(t, rect);
      s.inspector.peekTower.mockClear();
      tapZone(s, 1);
      s._onRadialPeek({ id: 'hub' }, rect);
      expect(s.inspector.peekTower).not.toHaveBeenCalled();
      expect(tip().style.display).not.toBe('block');
    });
  });

  describe('lifecycle', () => {
    it('shutdown → re-create → one radial listener: one tap builds once and charges once', () => {
      const s = makeScene({ gold: 500 });
      // Level 1 used the radial, so its presenter holds live items when the level ends.
      tapZone(s, 0);
      s.shutdown();
      // Phaser reuses the same scene instance for the next level entry.
      s._sentries = [];
      s._previewGfx = fakeGfx();
      s._wireSceneEvents();
      s._createRadial();
      const place = vi.spyOn(s.placementManager, 'placeTower');
      // A leaked level-1 presenter would report the same click a second time.
      const activate = vi.spyOn(s, '_onRadialActivate');
      tapZone(s, 0);
      clickItem($item('build:archer'));
      expect(activate).toHaveBeenCalledTimes(1);
      expect(place).toHaveBeenCalledTimes(1);
      expect(s.economy.gold).toBe(500 - TOWER_DEFS.archer.cost);
    });

    it('shutdown closes an open radial and restores the shipped markup', () => {
      const s = makeScene();
      tapZone(s, 0);
      s.shutdown();
      expect(isOpen()).toBe(false);
      expect(document.querySelectorAll('#radial [data-id]').length).toBe(0);
      expect(s.radial).toBeNull();
    });
  });
});
