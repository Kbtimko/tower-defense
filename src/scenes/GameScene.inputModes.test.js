vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
      },
    },
  },
}));

vi.mock('../entities/Projectile.js', () => ({
  Projectile: class { constructor(scene, opts) { Object.assign(this, opts); } },
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import GameScene from './GameScene.js';

function setupDOM() {
  document.body.replaceChildren();
  const cancel = document.createElement('button');
  cancel.id = 'cancel-btn';
  cancel.hidden = true;
  document.body.appendChild(cancel);
  for (const type of ['archer', 'cannon']) {
    const b = document.createElement('button');
    b.className = 'tower-btn'; b.dataset.type = type;
    document.body.appendChild(b);
  }
}

const cancelShown = () => !document.getElementById('cancel-btn').hidden;

function makeScene(overrides = {}) {
  const scene = Object.create(GameScene.prototype);
  Object.assign(scene, {
    aimMode: false,
    _aimSlot: null,
    repositionMode: false,
    repositioningBarracks: null,
    selectedType: null,
    selectedTower: null,
    game: { events: { emit: vi.fn(), on: vi.fn(), off: vi.fn() } },
    hero: {
      dead: false, level: 5, _timers: { w: 0 },
      def: { abilities: { w: { aim: true } }, stats: { abilityUnlockLevels: { w: 1 } } },
      fireAbility: vi.fn(() => null),
      moveToProgress: vi.fn(),
    },
    placementManager: {
      getTowers: () => [],
      getNearestSlot: () => null,
      placeTower: vi.fn(() => ({ type: 'archer' })),
      getZones: () => [],
    },
    inspector: { inspectableAt: () => null, tryClickInspect: vi.fn(() => true) },
    pathMgr: { isOnPath: () => true, getNearestPathProgress: () => 0.5, getPathPoints: () => [] },
    _closeTowerPanel: vi.fn(),
    _openTowerPanel: vi.fn(),
    _repaintStaticLayers: vi.fn(),
    _redrawZones: vi.fn(),
    _playTowerPop: vi.fn(),
    _toast: vi.fn(),
  }, overrides);
  return scene;
}

const btn = (type) => document.querySelector(`.tower-btn[data-type="${type}"]`);

describe('Cancel button follows the active mode', () => {
  beforeEach(setupDOM);

  it('shows when a tower type is armed and hides when it is toggled off', () => {
    const s = makeScene();
    s._selectTowerType('archer', btn('archer'));
    expect(cancelShown()).toBe(true);
    s._selectTowerType('archer', btn('archer'));
    expect(cancelShown()).toBe(false);
  });

  it('shows on aim entry and hides once the aimed ability fires', () => {
    const s = makeScene();
    s._onAbility({ slot: 'w' });
    expect(cancelShown()).toBe(true);
    s._triggerAimAbility(10, 10);
    expect(cancelShown()).toBe(false);
  });

  it('shows on reposition entry and hides when a tap cancels it', () => {
    const s = makeScene({ selectedTower: { type: 'barracks' } });
    document.body.appendChild(Object.assign(document.createElement('div'), { id: 'tower-panel' }));
    s._startReposition();
    expect(cancelShown()).toBe(true);
    s._onTap(400, 300); // no free slot within 60px -> silent cancel, as today
    expect(cancelShown()).toBe(false);
  });

  it('stays up after a placement because the build mode persists', () => {
    const s = makeScene({
      placementManager: {
        getTowers: () => [],
        getNearestSlot: () => ({ slotIndex: 0, x: 400, y: 300 }),
        placeTower: vi.fn(() => ({ type: 'archer' })),
        getZones: () => [],
      },
    });
    s._selectTowerType('archer', btn('archer'));
    s._onTap(400, 300);
    expect(s.placementManager.placeTower).toHaveBeenCalled();
    expect(cancelShown()).toBe(true);
  });

  it('hides when a build tap lands on no slot', () => {
    const s = makeScene();
    s._selectTowerType('archer', btn('archer'));
    s._onTap(400, 300);
    expect(cancelShown()).toBe(false);
  });

  it('hides when tapping a tower clears the build to open its panel', () => {
    const tower = { x: 400, y: 300 };
    const s = makeScene({
      placementManager: { getTowers: () => [tower], getNearestSlot: () => null, getZones: () => [] },
      scale: { displayScale: { x: 1, y: 1 } },
    });
    const game = Object.assign(document.createElement('div'), { id: 'game' });
    document.body.appendChild(game);
    s._selectTowerType('archer', btn('archer'));
    s._onTap(400, 300);
    expect(s._openTowerPanel).toHaveBeenCalled();
    expect(cancelShown()).toBe(false);
  });
});

describe('_cancelMode', () => {
  beforeEach(setupDOM);

  it('clears build, aim and reposition, the tower highlight and the button', () => {
    const s = makeScene();
    s._selectTowerType('archer', btn('archer'));
    s.aimMode = true; s._aimSlot = 'w';
    s.repositionMode = true; s.repositioningBarracks = {};
    s._cancelMode();
    expect(s.selectedType).toBeNull();
    expect(s.aimMode).toBe(false);
    expect(s._aimSlot).toBeNull();
    expect(s.repositionMode).toBe(false);
    expect(s.repositioningBarracks).toBeNull();
    expect(document.querySelectorAll('.tower-btn.selected').length).toBe(0);
    expect(cancelShown()).toBe(false);
  });

  it('tells the HUD the aim ended, and fires no ability', () => {
    const s = makeScene();
    s._onAbility({ slot: 'w' });
    s._cancelMode();
    expect(s.game.events.emit).toHaveBeenCalledWith('hero:aim-cancel');
    expect(s.hero.fireAbility).not.toHaveBeenCalled();
  });

  it('does not announce an aim cancel when nothing was being aimed', () => {
    const s = makeScene();
    s._selectTowerType('archer', btn('archer'));
    s._cancelMode();
    expect(s.game.events.emit).not.toHaveBeenCalledWith('hero:aim-cancel');
  });

  it('the Cancel button click cancels the mode', () => {
    const s = makeScene();
    // _bindDOMEvents wires every HUD control; only the cancel button matters here.
    s._bindCancelButton();
    s._selectTowerType('archer', btn('archer'));
    document.getElementById('cancel-btn').click();
    expect(s.selectedType).toBeNull();
  });
});

describe('ui:cancel (Escape)', () => {
  beforeEach(setupDOM);

  it('cancels an active mode', () => {
    const s = makeScene();
    s._onAbility({ slot: 'w' });
    s._onUiCancel();
    expect(s.aimMode).toBe(false);
    expect(s.game.events.emit).toHaveBeenCalledWith('hero:aim-cancel');
  });

  it('is a no-op with no mode, leaving Escape to the inspector and overlays', () => {
    const s = makeScene();
    const spy = vi.spyOn(s, '_cancelMode');
    s._onUiCancel();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('_onTap inspect step', () => {
  beforeEach(setupDOM);

  it('pins through tryClickInspect and does not move the hero', () => {
    const target = { kind: 'enemy', target: {} };
    const s = makeScene({ inspector: { inspectableAt: () => target, tryClickInspect: vi.fn(() => true) } });
    s._onTap(400, 300);
    expect(s.inspector.tryClickInspect).toHaveBeenCalledWith(400, 300);
    expect(s._closeTowerPanel).toHaveBeenCalled();
    expect(s.hero.moveToProgress).not.toHaveBeenCalled();
  });

  it('never calls the pinning tryClickInspect when nothing is inspectable', () => {
    const s = makeScene();
    s._onTap(400, 300);
    expect(s.inspector.tryClickInspect).not.toHaveBeenCalled();
    expect(s.hero.moveToProgress).toHaveBeenCalledWith(0.5);
  });

  it('a dead hero ignores a path tap but still closes the panel', () => {
    const s = makeScene();
    s.hero.dead = true;
    s._onTap(400, 300);
    expect(s._closeTowerPanel).toHaveBeenCalled();
    expect(s.hero.moveToProgress).not.toHaveBeenCalled();
    expect(s._toast).not.toHaveBeenCalled();
  });

  it('an off-path tap toasts instead of moving', () => {
    const s = makeScene({ pathMgr: { isOnPath: () => false, getNearestPathProgress: () => 0 } });
    s._onTap(400, 300);
    expect(s._toast).toHaveBeenCalledWith('Hero can only move along the path');
    expect(s.hero.moveToProgress).not.toHaveBeenCalled();
  });

  it('an armed aim fires at the tap point ahead of a tower under it', () => {
    const s = makeScene({
      placementManager: { getTowers: () => [{ x: 400, y: 300 }], getNearestSlot: () => null, getZones: () => [] },
    });
    s._onAbility({ slot: 'w' });
    s._onTap(400, 300);
    expect(s.hero.fireAbility).toHaveBeenCalledWith('w', { x: 400, y: 300 });
    expect(s._openTowerPanel).not.toHaveBeenCalled();
  });
});

describe('Cancel button at level end', () => {
  beforeEach(() => {
    setupDOM();
    for (const id of ['msg-title', 'msg-body', 'msg-btn', 'msg-cancel-btn', 'exit-btn', 'pause-btn', 'game-msg']) {
      document.body.appendChild(Object.assign(document.createElement('div'), { id }));
    }
  });

  it('is hidden once the level is lost or won, even with a mode armed', () => {
    for (const flag of ['over', 'won']) {
      const s = makeScene();
      s._selectTowerType('archer', btn('archer'));
      expect(cancelShown()).toBe(true);
      s[flag] = true;
      s._syncCancelButton();
      expect(cancelShown()).toBe(false);
    }
  });

  it('defeat hides it without waiting for another mode change', () => {
    const s = makeScene({
      over: false,
      game: { events: { emit: vi.fn() }, registry: { get: () => null } },
      waveMgr: { currentWave: 3 },
      _commitStats: vi.fn(),
    });
    s._selectTowerType('archer', btn('archer'));
    s._onDefeat();
    expect(cancelShown()).toBe(false);
  });

  it('victory hides it without waiting for another mode change', () => {
    const s = makeScene({
      won: false, mapId: 0, kills: 0,
      game: { events: { emit: vi.fn() }, registry: { get: () => null } },
      economy: { lives: 20 },
      saveMgr: { setStars: vi.fn(), hasSeenBeat: () => true, markBeatSeen: vi.fn() },
      _commitStats: vi.fn(),
    });
    s._selectTowerType('archer', btn('archer'));
    s._onVictory();
    expect(cancelShown()).toBe(false);
  });
});
