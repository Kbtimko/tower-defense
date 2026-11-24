// #49: the scene side of the tier looks. The T4 ring layer, per-frame look
// updates, the drawn-centre muzzle and window.__capture.looks. Unit tests call
// the prototype with hand-built ctx stubs; the live block runs the real
// create/update/shutdown through gameSceneHarness.
vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
        setPosition(x, y) { this.x = x; this.y = y; return this; }
        destroy() { this.destroyed = true; }
      },
    },
  },
}));
vi.mock('../entities/Projectile.js', () => ({
  Projectile: class { constructor(scene, opts) { Object.assign(this, opts); } },
}));
vi.mock('../entities/Hero.js', async () => {
  const { HEROES } = await import('../data/heroes.js');
  return {
    Hero: class {
      constructor(scene, { x, y, heroId }) {
        Object.assign(this, {
          x, y, heroId, def: HEROES[heroId], level: 1, dead: false, hp: 1, maxHp: 1, _timers: { q: 0, w: 0, e: 0 },
        });
      }
      update() {}
      takeDamage() {}
      xpProgress() { return 0; }
      destroy() {}
    },
  };
});
vi.mock('../entities/Enemy.js', () => ({
  Enemy: class { constructor(scene, opts) { Object.assign(this, opts, { dead: false }); } },
}));
vi.mock('../systems/AmbientBackgroundLayer.js', () => ({
  AmbientBackgroundLayer: class { update() {} destroy() {} },
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GameScene from './GameScene.js';
import { setRenderScale, getRenderScale } from '../systems/renderScale.js';
import { loadShippedDOM, liveScene, startLevel } from './gameSceneHarness.js';
import { TIER_RING, TIER_CORE, TIER_EMBERS, towerAccent } from '../data/tierLooks.js';
import { ringBreath, ellipseDashes, expectedTowerLook, corePulse, emberPose } from '../systems/tierLookMath.js';

const proto = GameScene.prototype;

// Records every call; `calls` survives clear() so a test can see one happened.
function recGfx() {
  const target = { calls: [], destroyed: false };
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'then') return undefined;
      return (...args) => {
        t.calls.push([prop, ...args]);
        if (prop === 'destroy') t.destroyed = true;
        return proxy;
      };
    },
  });
  return proxy;
}
// Any other game object: every method chains and repeat reads return the same
// function, so snapshots taken twice compare equal.
function gameObject() {
  const proxy = new Proxy({}, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'then') return undefined;
      t[prop] = () => proxy;
      return t[prop];
    },
  });
  return proxy;
}
const recordingAdd = () => new Proxy({}, { get: (t, prop) => (prop === 'graphics' ? () => recGfx() : () => gameObject()) });
const sinceClear = (g) => g.calls.slice(g.calls.map(c => c[0]).lastIndexOf('clear') + 1);
const named = (g, m) => sinceClear(g).filter(c => c[0] === m);

const tower = (type, x, y, level, branch, footY = 41.2) => ({ type, x, y, level, branch, footY: () => footY });
const ringCtx = ({ towers, ambient = true, fxTime = 0, speed = 1 }) => ({
  _tierRingGfx: recGfx(),
  _fxTime: fxTime,
  speed,
  placementManager: { getTowers: () => towers },
  game: { registry: { get: (k) => (k === 'ambientMotion' ? ambient : null) } },
});
const dashesAt = (cx, cy, phase) => ellipseDashes({
  cx, cy, rx: TIER_RING.rx, ry: TIER_RING.ry,
  dashes: TIER_RING.spin.dashes, duty: TIER_RING.spin.duty, phase,
});

describe('GameScene._drawTierRings', () => {
  it('draws a solid ellipse for 4A, 12 dashes for 4B and nothing below T4, on its own layer only', () => {
    const ctx = ringCtx({ towers: [
      tower('archer', 100, 100, 4, 'A'), tower('mage', 300, 200, 4, 'B', 30), tower('cannon', 500, 100, 3, null),
    ] });
    const other = recGfx();
    ctx.gfx = other; ctx._padGlow = other; ctx._rallyRouteGfx = other;
    proto._drawTierRings.call(ctx);
    const g = ctx._tierRingGfx;
    expect(g.calls[0][0]).toBe('clear');
    const ellipses = named(g, 'strokeEllipse');
    expect(ellipses).toHaveLength(1);
    expect(ellipses[0][1]).toBe(100);
    expect(ellipses[0][2]).toBeCloseTo(141.2, 9);
    const dashes = named(g, 'strokePoints');
    expect(dashes).toHaveLength(TIER_RING.spin.dashes);
    expect(dashes.map(c => c[1])).toEqual(dashesAt(300, 230, 0));
    expect(dashes.every(c => c[2] === false)).toBe(true);
    // Each ring in its tower's own accent.
    const styles = named(g, 'lineStyle');
    expect(styles.map(c => c[2])).toEqual([towerAccent('archer'), towerAccent('mage')]);
    expect(styles.every(c => c[1] === TIER_RING.lineWidth)).toBe(true);
    expect(other.calls).toEqual([]);
  });

  it('picks the ring from the tier variant, as expectedTowerLook does', () => {
    const towers = [tower('archer', 0, 0, 4, 'a', 0), tower('mage', 0, 0, 4, null, 0)];
    const ctx = ringCtx({ towers });
    proto._drawTierRings.call(ctx);
    expect(towers.map(t => expectedTowerLook(t.level, t.branch).ring)).toEqual(['solid', null]);
    expect(named(ctx._tierRingGfx, 'strokeEllipse')).toHaveLength(1);
    expect(named(ctx._tierRingGfx, 'strokePoints')).toHaveLength(0);
  });

  it('E28: a no-art tower rings its fallback foot, y + 18', () => {
    const ctx = ringCtx({ towers: [tower('sniper', 50, 60, 4, 'A', 18)] });
    proto._drawTierRings.call(ctx);
    const [[, cx, cy]] = named(ctx._tierRingGfx, 'strokeEllipse');
    expect([cx, cy]).toEqual([50, 78]);
  });

  it('A breathes on _fxTime: size and alpha from ringBreath', () => {
    const ctx = ringCtx({ towers: [tower('archer', 0, 0, 4, 'A', 0)], fxTime: 0.35 });
    proto._drawTierRings.call(ctx);
    const { k, alpha } = ringBreath(0.35, TIER_RING, false);
    expect(k).not.toBe(1);
    const [[, , , w, h]] = named(ctx._tierRingGfx, 'strokeEllipse');
    expect(w).toBeCloseTo(2 * TIER_RING.rx * k, 9);
    expect(h).toBeCloseTo(2 * TIER_RING.ry * k, 9);
    expect(named(ctx._tierRingGfx, 'lineStyle')[0][3]).toBeCloseTo(alpha, 9);
  });

  it('B spins one lap per spin.periodS of _fxTime at full alpha', () => {
    const ctx = ringCtx({ towers: [tower('mage', 0, 0, 4, 'B', 0)], fxTime: 1.2 });
    proto._drawTierRings.call(ctx);
    expect(named(ctx._tierRingGfx, 'strokePoints').map(c => c[1]))
      .toEqual(dashesAt(0, 0, 1.2 / TIER_RING.spin.periodS));
    expect(named(ctx._tierRingGfx, 'lineStyle')[0][3]).toBe(TIER_RING.alpha);
  });

  it('E21: reduced motion holds A at rest size and 0.85, B at phase 0', () => {
    const ctx = ringCtx({ towers: [tower('archer', 0, 0, 4, 'A', 0), tower('mage', 0, 0, 4, 'B', 0)], ambient: false, fxTime: 0.7 });
    proto._drawTierRings.call(ctx);
    const g = ctx._tierRingGfx;
    const [[, , , w, h]] = named(g, 'strokeEllipse');
    expect([w, h]).toEqual([2 * TIER_RING.rx, 2 * TIER_RING.ry]);
    expect(named(g, 'lineStyle').map(c => c[3])).toEqual([0.85, 0.85]);
    expect(named(g, 'strokePoints').map(c => c[1])).toEqual(dashesAt(0, 0, 0));
  });

  it('E22: 2x speed does not change the frame; only _fxTime does', () => {
    const towers = [tower('archer', 0, 0, 4, 'A', 0), tower('mage', 0, 0, 4, 'B', 0)];
    const at1 = ringCtx({ towers, fxTime: 0.9, speed: 1 });
    const at2 = ringCtx({ towers, fxTime: 0.9, speed: 2 });
    proto._drawTierRings.call(at1);
    proto._drawTierRings.call(at2);
    expect(at2._tierRingGfx.calls).toEqual(at1._tierRingGfx.calls);
  });
});

describe('GameScene._updateTowerLooks', () => {
  it('E26: updates every tower, the barracks with no fireRate included', () => {
    const barracks = { type: 'barracks', fireRate: 0, updateLook: vi.fn() };
    const archer = { type: 'archer', fireRate: 1, updateLook: vi.fn() };
    const ctx = ringCtx({ towers: [barracks, archer], fxTime: 2.5 });
    proto._updateTowerLooks.call(ctx);
    expect(barracks.updateLook).toHaveBeenCalledWith(2.5, false);
    expect(archer.updateLook).toHaveBeenCalledWith(2.5, false);
  });

  it('passes reduced motion through', () => {
    const t = { updateLook: vi.fn() };
    proto._updateTowerLooks.call(ringCtx({ towers: [t], ambient: false, fxTime: 1 }));
    expect(t.updateLook).toHaveBeenCalledWith(1, true);
  });
});

// A change made under a user pause must show at once (R12, E24, E25, E5):
// update() does not run while paused, but the scene still renders.
describe('ring layer redraws on board changes', () => {
  it('_upgradeSelectedTower redraws after a successful upgrade only', () => {
    const ctx = {
      selectedTower: { level: 1, type: 'archer', x: 0, y: 0 }, mapId: 0,
      placementManager: { upgradeTower: vi.fn(() => true) },
      _playTowerPop: vi.fn(), _refreshRadial: vi.fn(), _toast: vi.fn(), _drawTierRings: vi.fn(),
      _updateTowerLooks: vi.fn(),
    };
    proto._upgradeSelectedTower.call(ctx);
    expect(ctx._drawTierRings).toHaveBeenCalledTimes(1);
    expect(ctx._updateTowerLooks).toHaveBeenCalledTimes(1);
    ctx._drawTierRings.mockClear();
    ctx._updateTowerLooks.mockClear();
    ctx.placementManager.upgradeTower = vi.fn(() => false);
    proto._upgradeSelectedTower.call(ctx);
    expect(ctx._drawTierRings).not.toHaveBeenCalled();
    expect(ctx._updateTowerLooks).not.toHaveBeenCalled();
  });

  it('_placeAt redraws', () => {
    const ctx = {
      placementManager: { placeTower: vi.fn(() => ({ type: 'archer' })) },
      _playTowerPop: vi.fn(), _repaintStaticLayers: vi.fn(), _toast: vi.fn(), _drawTierRings: vi.fn(),
    };
    proto._placeAt.call(ctx, { slotIndex: 1, x: 10, y: 20 }, 'archer');
    expect(ctx._drawTierRings).toHaveBeenCalledTimes(1);
  });

  it('_sellSelectedTower redraws (E5: no ring left behind)', () => {
    const ctx = {
      selectedTower: { x: 1, y: 2 },
      placementManager: { sellTower: vi.fn(() => 36) },
      _playSellFx: vi.fn(), _repaintStaticLayers: vi.fn(), _closeRadial: vi.fn(), _drawTierRings: vi.fn(),
    };
    proto._sellSelectedTower.call(ctx);
    expect(ctx._drawTierRings).toHaveBeenCalledTimes(1);
  });

  it('_repositionTo redraws (E25: the ring follows the moved barracks)', () => {
    const barracks = { zoneIndex: 0, setPosition: vi.fn(), setDepth: vi.fn(), setRallyPoint: vi.fn() };
    const ctx = {
      repositioningBarracks: barracks, enemies: [],
      placementManager: {
        getNearestSlot: () => ({ slotIndex: 1, x: 400, y: 300 }),
        getZones: () => [{ occupied: true }, { occupied: false }],
      },
      pathMgr: { getNearestPathProgress: () => 0.5 },
      _repaintStaticLayers: vi.fn(), _drawTierRings: vi.fn(),
    };
    proto._repositionTo.call(ctx, 400, 300);
    expect(ctx._drawTierRings).toHaveBeenCalledTimes(1);
  });
});

describe('E34: shots leave the drawn centre', () => {
  it('muzzle flash and projectile start at muzzlePoint; targeting measures from x/y', () => {
    // (180, 100) is 80 px from the pad but ~207 px from the muzzle point, so a
    // range check made from the muzzle would find no target.
    const t = {
      type: 'archer', branch: null, level: 4, x: 100, y: 100, range: 200, damage: 10, fireRate: 1,
      cooldown: 0, splashRadius: 0, pierce: 0, slow: 0, updatePop: () => {},
      muzzlePoint: () => ({ x: 5, y: -11 }),
      _sprite: { setFacing: vi.fn(), setState: vi.fn() },
    };
    const ctx = {
      placementManager: { getTowers: () => [t] },
      enemies: [{ x: 180, y: 100, waypointIndex: 1 }],
      projectiles: [],
      _projectilePool: { acquire: opts => ({ ...opts }) },
      particleSpawner: { spawnMuzzleFlash: vi.fn() },
      game: { registry: { get: () => null } },
    };
    proto._updateTowers.call(ctx, 0.016);
    expect(ctx.particleSpawner.spawnMuzzleFlash).toHaveBeenCalledWith(5, -11, 'archer', 4, null);
    expect(ctx.projectiles).toHaveLength(1);
    expect(ctx.projectiles[0]).toMatchObject({ x: 5, y: -11 });
  });
});

describe('live level: ring layer, frame loop and __capture.looks', () => {
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });
  afterEach(() => { delete window.__capture; });

  const BUILD = [
    { type: 'archer', slot: 0, tier: 4, branch: 'A' },
    { type: 'mage', slot: 1, tier: 4, branch: 'B' },
    { type: 'barracks', slot: 2, tier: 2, branch: null },
  ];
  function level(ambientMotion) {
    const scene = liveScene({ registry: { ambientMotion } });
    scene.add = recordingAdd();
    startLevel(scene, {
      mapId: 4, heroId: 'rael',
      debug: { mapId: 4, heroId: 'rael', build: BUILD, wave: null, errors: [], autoSend: false },
    });
    return scene;
  }
  const byType = (s, type) => s.placementManager.getTowers().find(t => t.type === type);

  it('create puts the ring layer at TIER_RING.depth and shutdown destroys it', () => {
    const s = level(false);
    const g = s._tierRingGfx;
    expect(g.calls).toContainEqual(['setDepth', TIER_RING.depth]);
    s.events.emit('shutdown');
    expect(g.destroyed).toBe(true);
    expect(s._tierRingGfx).toBeNull();
  });

  it('update() updates every look and draws the rings', () => {
    const s = level(false);
    const barracks = byType(s, 'barracks');
    const spy = vi.spyOn(barracks, 'updateLook');
    s.update(0, 100);
    expect(spy).toHaveBeenCalledWith(s._fxTime, true);
    const archer = byType(s, 'archer');
    const [[, cx, cy]] = named(s._tierRingGfx, 'strokeEllipse');
    expect([cx, cy]).toEqual([archer.x, archer.y + archer.footY()]);
    expect(named(s._tierRingGfx, 'strokePoints')).toHaveLength(TIER_RING.spin.dashes);
  });

  it('__capture.renderScale reports the boot-time render scale', () => {
    setRenderScale(2);
    try {
      level(false);
      expect(window.__capture.renderScale).toBe(getRenderScale());
      expect(window.__capture.renderScale).toBe(2);
    } finally { setRenderScale(1); }
  });

  it('__capture.looks reports every tower and soldier as drawn (reduced motion repeats exactly)', () => {
    const s = level(false);
    s.update(0, 100);
    s.update(0, 100);
    const { towers, soldiers } = window.__capture.looks;
    const placed = s.placementManager.getTowers();
    expect(towers).toEqual(placed.map(t => expect.objectContaining(t.lookSnapshot())));
    expect(towers.map(t => [t.type, t.level, t.branch, t.ring, t.ringPhase])).toEqual([
      ['archer', 4, 'A', 'solid', 1],
      ['mage', 4, 'B', 'dashed', 0],
      ['barracks', 2, null, null, null],
    ]);
    const squad = byType(s, 'barracks').soldiers;
    expect(squad.length).toBeGreaterThan(0);
    expect(soldiers).toEqual(squad.map(x => ({ ...x.lookSnapshot(), keyExists: false })));
  });

  it('ringPhase is what the ring animates: breath k for A, lap phase for B', () => {
    const s = level(true);
    s.update(0, 100);
    const t = s._fxTime; // the capture block runs before this frame's _fxTime advance
    s.update(0, 100);
    const [a, b] = window.__capture.looks.towers;
    expect(a.ringPhase).toBe(ringBreath(t, TIER_RING, false).k);
    expect(b.ringPhase).toBe(t / TIER_RING.spin.periodS);
  });

  // E24: update() is stopped under the user pause, so the upgrade itself must pose
  // the new marks. Images keep real alpha/position so an unposed ember shows as
  // alpha 0 at (0, 0).
  it('E24: a paused upgrade poses the new core and embers at once, at the frozen _fxTime', () => {
    const images = [];
    const image = () => {
      const state = { x: 0, y: 0, alpha: 1 };
      const proxy = new Proxy(state, {
        get(t, prop) {
          if (prop === 'setPosition') return (x, y) => { t.x = x; t.y = y; return proxy; };
          if (prop === 'setAlpha') return (a) => { t.alpha = a; return proxy; };
          if (prop in t) return t[prop];
          if (prop === 'then') return undefined;
          return () => proxy;
        },
      });
      images.push(proxy);
      return proxy;
    };
    const scene = liveScene({ registry: { ambientMotion: true } });
    scene.add = new Proxy({}, { get: (t, prop) => (prop === 'graphics' ? () => recGfx() : prop === 'image' ? image : () => gameObject()) });
    startLevel(scene, {
      mapId: 4, heroId: 'rael',
      debug: { mapId: 4, heroId: 'rael', build: [{ type: 'archer', slot: 0, tier: 1, branch: null }], wave: null, errors: [], autoSend: false },
    });
    scene.economy.earn(100000);
    // Not a multiple of any period, so a posed core differs from the default alpha 1.
    scene._fxTime = 0.37;
    const archer = byType(scene, 'archer');
    scene.selectedTower = archer;

    scene._upgradeSelectedTower();
    const look = archer._look;
    expect(archer.level).toBe(2);
    const core = corePulse(0.37, TIER_CORE, false);
    expect(core).not.toBe(1);
    expect(look._glow.alpha).toBeCloseTo(core, 9);
    expect(look._hot.alpha).toBeCloseTo(core, 9);

    scene._upgradeSelectedTower();
    expect(archer.level).toBe(3);
    expect(look._embers).toHaveLength(TIER_EMBERS.count);
    look._embers.forEach((e, i) => {
      const p = emberPose(0.37, i, TIER_EMBERS, look._ground, false);
      expect(e.alpha).toBeGreaterThan(0);
      expect([e.x, e.y]).not.toEqual([0, 0]);
      expect(e.x).toBeCloseTo(p.dx, 9);
      expect(e.y).toBeCloseTo(p.dy, 9);
      expect(e.alpha).toBeCloseTo(p.alpha, 9);
    });
    expect(images.length).toBeGreaterThan(0);
  });

  it('keyExists asks the texture manager about the resolved key; a null key never exists', () => {
    const s = level(false);
    const squad = byType(s, 'barracks').soldiers;
    expect(squad.length).toBeGreaterThanOrEqual(3);
    // No art loads under jsdom, so the resolved keys are planted.
    ['soldier-t2', 'soldier-missing', null].forEach((key, i) => {
      const real = squad[i].lookSnapshot.bind(squad[i]);
      vi.spyOn(squad[i], 'lookSnapshot').mockImplementation(() => ({ ...real(), key }));
    });
    s.textures = { exists: (k) => k !== 'soldier-missing' };
    s.update(0, 100);
    expect(window.__capture.looks.soldiers.slice(0, 3).map(x => [x.key, x.keyExists])).toEqual([
      ['soldier-t2', true], ['soldier-missing', false], [null, false],
    ]);
  });
});
