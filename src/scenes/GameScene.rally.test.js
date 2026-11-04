// Backlog #48: barracks rally mode wired into the REAL GameScene — create, the
// tap pipeline, the frame loop and shutdown — with real Barracks/Soldier entities
// on map 0's road. Phaser's scene graph is stubbed; Graphics layers record their
// calls so the overlay, route and flag can be read back.
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
// The shipped lineWidth equals routeDotRadius (both 2), so a stroke drawn with the
// wrong one would look identical; one px apart here the test can tell them apart.
vi.mock('../data/soldiers.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, RALLY_FLAG: Object.freeze({ ...real.RALLY_FLAG, lineWidth: real.RALLY_FLAG.routeDotRadius + 1 }) };
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadShippedDOM, liveScene, startLevel } from './gameSceneHarness.js';
import { pointAtProgress } from '../systems/pathGeometry.js';
import { isMarching } from '../systems/soldierMarch.js';
import { MELEE_RANGE } from '../systems/soldierCombat.js';
import { RALLY_FLAG, SOLDIER_MARCH } from '../data/soldiers.js';
import { hexToInt } from '../ui/theme.js';

const OK = hexToInt(RALLY_FLAG.ok);
const BAD = hexToInt(RALLY_FLAG.bad);
const FRAME_MS = 100;
// Map 0, pad 0 at (696, 360): its squad rests near progress 0.548. These road
// points sit inside (0.62, 0.50) and outside (0.40) its 130 px range; the pad
// fixture test below pins that, so a map edit fails loudly instead of silently.
const PAD = 0;
const IN_RANGE = 0.62;
const IN_RANGE_BACK = 0.50;
const OUT_OF_RANGE = 0.40;
const OFF_ROAD = { x: 696, y: 260 };

// Every Graphics records its calls; `calls` survives clear() so a test can see one happened.
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

// Calls since the last clear() — what is on screen now.
const sinceClear = (g) => g.calls.slice(g.calls.map(c => c[0]).lastIndexOf('clear') + 1);
// Flags drawn: each pole is a lineBetween from its base straight up by poleHeight.
function flags(g) {
  let colour = null, alpha = null;
  const out = [];
  for (const [m, ...a] of sinceClear(g)) {
    if (m === 'lineStyle') { colour = a[1]; alpha = a[2]; }
    if (m === 'lineBetween' && a[0] === a[2] && a[1] - a[3] === RALLY_FLAG.poleHeight) out.push({ x: a[0], y: a[1], colour, alpha });
  }
  return out;
}
const dots = (g) => sinceClear(g).filter(c => c[0] === 'fillCircle' && c[3] === RALLY_FLAG.routeDotRadius)
  .map(c => ({ x: c[1], y: c[2] }));

const $ = (id) => document.getElementById(id);
const cancelShown = () => !$('cancel-btn').hidden;
const toasts = () => [...document.querySelectorAll('#game .game-toast')].map(t => t.textContent);

function level({ registry = { ambientMotion: false }, debug } = {}) {
  const scene = liveScene({ registry });
  scene.add = recordingAdd();
  startLevel(scene, { mapId: 0, heroId: 'rael', debug });
  return scene;
}
function buildBarracks(scene, slotIndex = PAD) {
  const z = scene.placementManager.getZones()[slotIndex];
  scene._placeAt({ slotIndex, x: z.cx, y: z.cy }, 'barracks');
  return scene.placementManager.getTowers().find(t => t.zoneIndex === slotIndex);
}
const path = (scene) => scene.pathMgr.getPathPoints();
const road = (scene, p) => pointAtProgress(path(scene), p);
const snapped = (scene, pt) => scene.pathMgr.getNearestPathProgress(pt.x, pt.y);
const marching = (b) => b.soldiers.some(s => isMarching(s, b.soldierPathProgress));
const frame = (scene, ms = FRAME_MS) => scene.update(0, ms);
const overlay = (scene) => scene._rallyOverlayGfx;
const routeGfx = (scene) => scene._rallyRouteGfx;

function enterRally(scene, b) {
  scene._openRing(b);
  scene._onRadialActivate(scene.radial._items.find(i => i.id === 'rally'));
}
function rallyTo(scene, b, p) {
  enterRally(scene, b);
  const pt = road(scene, p);
  scene._onTap(pt.x, pt.y);
}
function runUntilArrived(scene, b, cap = 200) {
  for (let i = 0; i < cap && marching(b); i++) frame(scene);
  expect(marching(b)).toBe(false);
}

// A fake enemy standing on a road vertex, walking forward at `speed` px/s.
function enemyNear(scene, pt, speed = 0) {
  const p = path(scene);
  let i = 0;
  for (let k = 1; k < p.length - 1; k++) if (Math.hypot(p[k].x - pt.x, p[k].y - pt.y) < Math.hypot(p[i].x - pt.x, p[i].y - pt.y)) i = k;
  const e = {
    x: p[i].x, y: p[i].y, waypointIndex: i, currentSpeed: speed, dead: false, reward: 0,
    def: { type: 'drone', flying: false, color: 0, radius: 8 },
    statusEffects: { stun: { active: false } }, update() {}, takeDamage: vi.fn(),
  };
  scene.enemies.push(e);
  return e;
}

describe('rally fixtures (map 0, pad 0)', () => {
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });

  it('the chosen road points are inside / outside the barracks range and on / off the road', () => {
    const s = level();
    const b = buildBarracks(s);
    const d = (p) => Math.hypot(road(s, p).x - b.x, road(s, p).y - b.y);
    expect(d(IN_RANGE)).toBeLessThanOrEqual(b.range);
    expect(d(IN_RANGE_BACK)).toBeLessThanOrEqual(b.range);
    expect(d(OUT_OF_RANGE)).toBeGreaterThan(b.range);
    expect(s.pathMgr.isOnPath(OFF_ROAD.x, OFF_ROAD.y, 40)).toBe(false);
    expect(Math.hypot(OFF_ROAD.x - b.x, OFF_ROAD.y - b.y)).toBeLessThanOrEqual(b.range);
  });
});

describe('rally mode (R2-R4, E24, E36)', () => {
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });

  it('activating Rally closes the ring, arms the mode, shows Cancel and says what to do', () => {
    const s = level();
    const b = buildBarracks(s);
    enterRally(s, b);
    expect(s.radial.isOpen).toBe(false);
    expect(s.rallyMode).toBe(true);
    expect(s.rallyBarracks).toBe(b);
    expect(cancelShown()).toBe(true);
    expect(toasts().at(-1)).toBe('Tap the road inside the ring to rally the squad');
  });

  for (const [name, exit] of [
    ['Escape', (s) => s._onUiCancel()],
    ['the Cancel button', () => $('cancel-btn').click()],
    ['a tap on the same barracks', (s, b) => s._onTap(b.x, b.y)],
  ]) {
    it(`${name} exits rally mode, clears the overlay and toasts nothing`, () => {
      const s = level();
      const b = buildBarracks(s);
      const target = b.soldierPathProgress;
      enterRally(s, b);
      expect(sinceClear(overlay(s)).length).toBeGreaterThan(0);
      const before = toasts().length;
      exit(s, b);
      expect(s.rallyMode).toBe(false);
      expect(s.rallyBarracks).toBeNull();
      expect(overlay(s).calls.at(-1)[0]).toBe('clear');
      expect(toasts().length).toBe(before);
      expect(cancelShown()).toBe(false);
      expect(b.soldierPathProgress).toBe(target);
    });
  }

  it('an off-road tap toasts and stays in the mode', () => {
    const s = level();
    const b = buildBarracks(s);
    const target = b.soldierPathProgress;
    enterRally(s, b);
    s._onTap(OFF_ROAD.x, OFF_ROAD.y);
    expect(toasts().at(-1)).toBe('Rally on the road');
    expect(s.rallyMode).toBe(true);
    expect(cancelShown()).toBe(true);
    expect(b.soldierPathProgress).toBe(target);
  });

  it('a road tap beyond barracks.range toasts and stays in the mode', () => {
    const s = level();
    const b = buildBarracks(s);
    const target = b.soldierPathProgress;
    enterRally(s, b);
    const pt = road(s, OUT_OF_RANGE);
    s._onTap(pt.x, pt.y);
    expect(toasts().at(-1)).toBe('Too far — rally inside the ring');
    expect(s.rallyMode).toBe(true);
    expect(cancelShown()).toBe(true);
    expect(b.soldierPathProgress).toBe(target);
  });

  it('a valid tap sets the target without teleporting anyone and exits the mode', () => {
    const s = level();
    const b = buildBarracks(s);
    const start = b.soldiers.map(sd => ({ p: sd.pathProgress, x: sd.x, y: sd.y }));
    const pt = road(s, IN_RANGE);
    rallyTo(s, b, IN_RANGE);
    expect(b.soldierPathProgress).toBe(snapped(s, pt));
    expect(b.soldiers.map(sd => ({ p: sd.pathProgress, x: sd.x, y: sd.y }))).toEqual(start);
    expect(b.rallyFlag).toEqual({ progress: b.soldierPathProgress, fadeLeftMs: null });
    expect(s.rallyMode).toBe(false);
    expect(cancelShown()).toBe(false);
  });

  it('E36: a rally barracks that is gone cancels the mode on the next tap', () => {
    const s = level();
    const b = buildBarracks(s);
    enterRally(s, b);
    s.placementManager.sellTower(b);
    const before = toasts().length;
    // Off the road: a live barracks would toast and stay, so only the gone-check exits here.
    s._onTap(OFF_ROAD.x, OFF_ROAD.y);
    expect(s.rallyMode).toBe(false);
    expect(s.rallyBarracks).toBeNull();
    expect(toasts().length).toBe(before);
    expect(cancelShown()).toBe(false);
  });

  it('E36: a rally barracks that is gone cancels the mode on the next frame, with no tap', () => {
    const s = level();
    const b = buildBarracks(s);
    enterRally(s, b);
    s.placementManager.towers = s.placementManager.towers.filter(t => t !== b);
    frame(s);
    expect(s.rallyMode).toBe(false);
    expect(s.rallyBarracks).toBeNull();
    expect(sinceClear(overlay(s))).toEqual([]);
    expect(cancelShown()).toBe(false);
  });

  it('E29: the level ending in rally mode hides Cancel', () => {
    const s = level();
    const b = buildBarracks(s);
    enterRally(s, b);
    expect(cancelShown()).toBe(true);
    s._onDefeat();
    expect(cancelShown()).toBe(false);
    expect(s.rallyMode).toBe(false);
  });

  it('the Rally ring peek says what the next tap does', () => {
    const s = level();
    const b = buildBarracks(s);
    s._openRing(b);
    s._onRadialPeek(s.radial._items.find(i => i.id === 'rally'), { left: 0, top: 0, width: 10, height: 10 });
    const tt = $('tower-tooltip');
    expect(tt.querySelector('strong').textContent).toBe('Rally');
    expect(tt.querySelector('.tt-line').textContent).toBe('Then tap the road inside the ring to send the squad there.');
  });
});

describe('Move hands the squad a new rally point (R5, S3)', () => {
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });

  it('the target becomes the new pad\'s nearest road point and the squad walks there', () => {
    const s = level();
    const b = buildBarracks(s);
    const start = b.soldiers.map(sd => sd.pathProgress);
    const pad = s.placementManager.getZones()[2];
    s._openRing(b);
    s._onRadialActivate(s.radial._items.find(i => i.id === 'reposition'));
    s._onTap(pad.cx, pad.cy);
    expect(b.zoneIndex).toBe(2);
    const target = s.pathMgr.getNearestPathProgress(pad.cx, pad.cy);
    expect(b.soldierPathProgress).toBe(target);
    expect(b.rallyFlag?.progress).toBe(target);
    expect(b.soldiers.map(sd => sd.pathProgress)).toEqual(start);
    frame(s);
    for (const sd of b.soldiers) {
      expect(sd.pathProgress).toBeGreaterThan(start[0]);
      expect(sd.pathProgress).toBeLessThan(target);
    }
  });
});

describe('march in the frame loop (Decision 2, R9, E14b)', () => {
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });

  it('a march into an enemy halts after it moved, and the enemy is blocked on the next frame', () => {
    const s = level();
    const b = buildBarracks(s);
    rallyTo(s, b, IN_RANGE);
    const e = enemyNear(s, road(s, 0.60), 10);
    const lead = b.soldiers[0];
    let halted = false;
    for (let i = 0; i < 100 && !halted; i++) {
      const was = { x: e.x, y: e.y };
      frame(s);
      if (Math.hypot(lead.x - e.x, lead.y - e.y) < MELEE_RANGE) {
        halted = true;
        // Halt frame: the enemy walked first (no block yet) and the soldier stopped on it.
        expect({ x: e.x, y: e.y }).not.toEqual(was);
        expect(lead.hp).toBe(lead.maxHp);
      }
    }
    expect(halted).toBe(true);
    expect(lead.pathProgress).toBeLessThan(b.soldierPathProgress);
    const held = { x: e.x, y: e.y };
    const p = lead.pathProgress;
    frame(s);
    expect({ x: e.x, y: e.y }).toEqual(held);
    expect(lead.hp).toBeLessThan(lead.maxHp);
    expect(lead.pathProgress).toBe(p);
  });

  it('E14b: an engaged squad ordered away releases its enemy on the next frame', () => {
    const s = level();
    const b = buildBarracks(s);
    const e = enemyNear(s, b.soldiers[0], 30);
    expect(Math.hypot(e.x - b.soldiers[0].x, e.y - b.soldiers[0].y)).toBeLessThan(MELEE_RANGE);
    const pinned = { x: e.x, y: e.y };
    frame(s);
    expect({ x: e.x, y: e.y }).toEqual(pinned);
    rallyTo(s, b, IN_RANGE);
    expect(b.soldiers.every(sd => sd.disengageLeftPx === SOLDIER_MARCH.disengagePx)).toBe(true);
    frame(s);
    expect({ x: e.x, y: e.y }).not.toEqual(pinned);
  });

  it('E8: a re-rally mid-march retargets from where the squad stands', () => {
    const s = level();
    const b = buildBarracks(s);
    rallyTo(s, b, IN_RANGE);
    for (let i = 0; i < 5; i++) frame(s);
    const mid = b.soldiers[0].pathProgress;
    expect(mid).toBeGreaterThan(snapped(s, road(s, IN_RANGE_BACK)));
    rallyTo(s, b, IN_RANGE_BACK);
    frame(s);
    const walkedPx = (mid - b.soldiers[0].pathProgress) * b.totalLength;
    expect(walkedPx).toBeCloseTo(SOLDIER_MARCH.speed * FRAME_MS / 1000, 6);
    const t = road(s, b.soldierPathProgress);
    expect(flags(routeGfx(s)).map(f => ({ x: f.x, y: f.y }))).toEqual([{ x: t.x, y: t.y }]);
  });

  it('E11: selling mid-march leaves no route or flag on the next frame', () => {
    const s = level();
    const b = buildBarracks(s);
    rallyTo(s, b, IN_RANGE);
    frame(s);
    expect(dots(routeGfx(s)).length).toBeGreaterThan(0);
    s.placementManager.sellTower(b);
    frame(s);
    expect(sinceClear(routeGfx(s))).toEqual([]);
  });

  it('E21: at 2x a frame carries the squad twice as far', () => {
    const walked = (speed) => {
      const s = level();
      s.speed = speed;
      const b = buildBarracks(s);
      rallyTo(s, b, IN_RANGE);
      const p0 = b.soldiers[0].pathProgress;
      frame(s);
      return (b.soldiers[0].pathProgress - p0) * b.totalLength;
    };
    expect(walked(1)).toBeCloseTo(SOLDIER_MARCH.speed * FRAME_MS / 1000, 6);
    expect(walked(2)).toBeCloseTo(2 * walked(1), 6);
  });

  it('E22: hit-stop and game over freeze the march', () => {
    for (const freeze of [(s) => { s._hitStopTimer = 10; }, (s) => { s.over = true; }]) {
      const s = level();
      const b = buildBarracks(s);
      rallyTo(s, b, IN_RANGE);
      const p0 = b.soldiers.map(sd => sd.pathProgress);
      freeze(s);
      frame(s);
      expect(b.soldiers.map(sd => sd.pathProgress)).toEqual(p0);
    }
  });
});

describe('rally overlay (R15, S1, S2, S5)', () => {
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });

  it('E23: entering from a ring left open under a user pause draws the overlay with no update', () => {
    const s = level();
    const b = buildBarracks(s);
    s._openRing(b);
    s._onPauseToggle();
    expect(s._userPaused).toBe(true);
    const update = vi.spyOn(s, 'update');
    s._onRadialActivate(s.radial._items.find(i => i.id === 'rally'));
    expect(update).not.toHaveBeenCalled();
    expect(sinceClear(overlay(s))).toContainEqual(['strokeCircle', b.x, b.y, b.range]);
    expect(flags(overlay(s))).toHaveLength(1);
    // Cancel still works while paused.
    $('cancel-btn').click();
    expect(sinceClear(overlay(s))).toEqual([]);
  });

  it('the range ring and every flag pole stroke at RALLY_FLAG.lineWidth', () => {
    const s = level();
    const b = buildBarracks(s);
    rallyTo(s, b, IN_RANGE);
    frame(s);
    enterRally(s, b);
    const widthsBefore = (g, method) => {
      let width = null;
      const out = [];
      for (const [m, ...a] of sinceClear(g)) {
        if (m === 'lineStyle') width = a[0];
        if (m === method) out.push(width);
      }
      return out;
    };
    expect(widthsBefore(overlay(s), 'strokeCircle')).toEqual([RALLY_FLAG.lineWidth]);
    expect(widthsBefore(overlay(s), 'lineBetween')).toEqual([RALLY_FLAG.lineWidth]);
    expect(widthsBefore(routeGfx(s), 'lineBetween')).toEqual([RALLY_FLAG.lineWidth]);
    expect(dots(routeGfx(s)).length).toBeGreaterThan(0);
  });

  it('the ghost opens on the current rally point, then follows the cursor in the right colour', () => {
    const s = level();
    const b = buildBarracks(s);
    enterRally(s, b);
    // The ghost is the snap of the cursor, so it lands on the rally point to within an ulp.
    const here = road(s, snapped(s, road(s, b.soldierPathProgress)));
    expect(Math.hypot(here.x - road(s, b.soldierPathProgress).x, here.y - road(s, b.soldierPathProgress).y)).toBeLessThan(1e-6);
    expect(flags(overlay(s))).toEqual([{ x: here.x, y: here.y, colour: OK, alpha: RALLY_FLAG.ghostAlpha }]);

    const ghostAt = (x, y) => {
      s._buildCursorX = x; s._buildCursorY = y;
      frame(s);
      expect(sinceClear(overlay(s))).toContainEqual(['strokeCircle', b.x, b.y, b.range]);
      return flags(overlay(s));
    };
    const near = road(s, IN_RANGE);
    const inSnap = road(s, snapped(s, { x: near.x, y: near.y + 5 }));
    expect(ghostAt(near.x, near.y + 5)).toEqual([{ x: inSnap.x, y: inSnap.y, colour: OK, alpha: RALLY_FLAG.ghostAlpha }]);
    const far = road(s, OUT_OF_RANGE);
    const farSnap = road(s, snapped(s, far));
    expect(ghostAt(far.x, far.y)).toEqual([{ x: farSnap.x, y: farSnap.y, colour: BAD, alpha: RALLY_FLAG.ghostAlpha }]);
    // Off the road the ghost is un-snapped, at the cursor.
    expect(ghostAt(OFF_ROAD.x, OFF_ROAD.y)).toEqual([{ x: OFF_ROAD.x, y: OFF_ROAD.y, colour: BAD, alpha: RALLY_FLAG.ghostAlpha }]);
  });
});

describe('route and planted flag (R16, S11)', () => {
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });

  it('a dotted route runs from the farthest live soldier to the flag while marching', () => {
    const s = level({ registry: {} });
    const b = buildBarracks(s);
    rallyTo(s, b, IN_RANGE);
    frame(s);
    // A straggler further back (say, one that was held up) sets where the route starts.
    const back = b.soldiers[0].pathProgress - 0.01;
    b.soldiers[2].setPathProgress(back, path(s));
    s._drawRallyRoutes(0);
    const d = dots(routeGfx(s));
    const from = road(s, back);
    const to = road(s, b.soldierPathProgress);
    expect(d[0]).toEqual({ x: from.x, y: from.y });
    expect(d.at(-1)).toEqual({ x: to.x, y: to.y });
    expect(flags(routeGfx(s))).toEqual([{ x: to.x, y: to.y, colour: OK, alpha: 1 }]);
  });

  it('Review Focus 4: the flag fades after arrival with no wave started', () => {
    const s = level({ registry: {} });
    const b = buildBarracks(s);
    expect(s.waveMgr.currentWave).toBe(0);
    rallyTo(s, b, IN_RANGE);
    runUntilArrived(s, b);
    expect(b.rallyFlag.fadeLeftMs).toBe(RALLY_FLAG.fadeMs);
    expect(dots(routeGfx(s))).toEqual([]);
    expect(flags(routeGfx(s))[0].alpha).toBe(1);
    const frames = Math.ceil(RALLY_FLAG.fadeMs / FRAME_MS);
    let last = 1;
    for (let i = 1; i < frames; i++) {
      frame(s);
      const [f] = flags(routeGfx(s));
      expect(f.alpha).toBeLessThan(last);
      last = f.alpha;
    }
    expect(b.rallyFlag).not.toBeNull();
    frame(s);
    expect(b.rallyFlag).toBeNull();
    expect(flags(routeGfx(s))).toEqual([]);
    expect(s._runMs).toBe(0);
  });

  it('under reduced motion the flag is gone on the arrival frame', () => {
    const s = level({ registry: { ambientMotion: false } });
    const b = buildBarracks(s);
    rallyTo(s, b, IN_RANGE);
    frame(s);
    expect(flags(routeGfx(s))).toHaveLength(1);
    runUntilArrived(s, b);
    expect(b.rallyFlag).toBeNull();
    expect(sinceClear(routeGfx(s))).toEqual([]);
  });
});

describe('spec edge cases in the scene (E4, E9, E10/E14e, E34)', () => {
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });

  it('E4: a rally onto the current point does not march; the flag plants, fades and goes', () => {
    const s = level({ registry: {} });
    const b = buildBarracks(s);
    const here = road(s, b.soldierPathProgress);
    expect(Math.hypot(here.x - b.x, here.y - b.y)).toBeGreaterThanOrEqual(22); // not a tap on the barracks
    const start = b.soldiers.map(sd => ({ x: sd.x, y: sd.y }));
    enterRally(s, b);
    s._onTap(here.x, here.y);
    expect(s.rallyMode).toBe(false);
    expect(b.rallyFlag).not.toBeNull();
    frame(s);
    expect(marching(b)).toBe(false);
    for (const [i, sd] of b.soldiers.entries()) {
      expect(Math.hypot(sd.x - start[i].x, sd.y - start[i].y)).toBeLessThan(1e-6);
    }
    expect(dots(routeGfx(s))).toEqual([]);
    expect(b.rallyFlag.fadeLeftMs).toBe(RALLY_FLAG.fadeMs);
    expect(flags(routeGfx(s))).toHaveLength(1);
    for (let i = 0; i < Math.ceil(RALLY_FLAG.fadeMs / FRAME_MS); i++) frame(s);
    expect(b.rallyFlag).toBeNull();
    expect(flags(routeGfx(s))).toEqual([]);
  });

  it('E9: a Move mid-march retargets from where the squad stands and disengages an engaged soldier', () => {
    const s = level();
    const b = buildBarracks(s);
    rallyTo(s, b, IN_RANGE);
    for (let i = 0; i < 5; i++) frame(s);
    const mid = b.soldiers.map(sd => sd.pathProgress);
    enemyNear(s, b.soldiers[0]);
    expect(b.soldiers.every(sd => sd.disengageLeftPx === 0)).toBe(true);
    const pad = s.placementManager.getZones()[3];
    s._openRing(b);
    s._onRadialActivate(s.radial._items.find(i => i.id === 'reposition'));
    s._onTap(pad.cx, pad.cy);
    const target = s.pathMgr.getNearestPathProgress(pad.cx, pad.cy);
    expect(b.zoneIndex).toBe(3);
    expect(b.soldierPathProgress).toBe(target);
    expect(target).toBeLessThan(mid[0]); // the new point is back the way they came
    expect(b.soldiers.map(sd => sd.pathProgress)).toEqual(mid);
    expect(b.soldiers.every(sd => sd.disengageLeftPx === SOLDIER_MARCH.disengagePx)).toBe(true);
    frame(s);
    // Walked away from the enemy beside it instead of halting on it.
    for (const [i, sd] of b.soldiers.entries()) {
      expect((mid[i] - sd.pathProgress) * b.totalLength).toBeCloseTo(SOLDIER_MARCH.speed * FRAME_MS / 1000, 6);
    }
  });

  it('E10/E14e: an upgrade mid-march rebuilds live soldiers where they stand and they keep walking; the dead appear at the target', () => {
    const s = level();
    const b = buildBarracks(s);
    s.economy.gold = 10000;
    rallyTo(s, b, IN_RANGE);
    for (let i = 0; i < 5; i++) frame(s);
    b.soldiers[2].takeDamage(1e9);
    expect(b.soldiers[2].dead).toBe(true);
    const mid = b.soldiers[0].pathProgress;
    const before = [...b.soldiers];
    s._openRing(b);
    s._onRadialActivate(s.radial._items.find(i => i.id === 'upgrade'));
    expect(b.level).toBe(2);
    expect(b.soldiers.some(sd => before.includes(sd))).toBe(false);
    const target = b.soldierPathProgress;
    expect(b.soldiers.map(sd => sd.pathProgress)).toEqual(
      b.soldiers.map((_, i) => (i < 2 ? mid : target)),
    );
    expect(marching(b)).toBe(true);
    frame(s);
    for (const sd of b.soldiers.slice(0, 2)) {
      expect((sd.pathProgress - mid) * b.totalLength).toBeCloseTo(SOLDIER_MARCH.speed * FRAME_MS / 1000, 6);
    }
    expect(b.soldiers.slice(2).every(sd => sd.pathProgress === target)).toBe(true);
  });

  it('E34: reduced motion switched on mid-march applies next frame and drops the flag on arrival', () => {
    const registry = {};
    const s = level({ registry });
    const b = buildBarracks(s);
    rallyTo(s, b, IN_RANGE);
    for (let i = 0; i < 3; i++) frame(s);
    const lead = b.soldiers[0];
    const bob = () => lead._view.y - lead._offset.dy;
    expect(Math.abs(bob())).toBeGreaterThan(0.01); // full motion: the walk bob is on
    registry.ambientMotion = false;
    frame(s);
    expect(marching(b)).toBe(true);
    expect(bob()).toBe(0);
    runUntilArrived(s, b);
    expect(b.rallyFlag).toBeNull();
    expect(sinceClear(routeGfx(s))).toEqual([]);
  });
});

describe('Review Focus 3: leaving in rally mode', () => {
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });

  it('RETRY in rally mode leaves no rally state', () => {
    const s = level();
    const b = buildBarracks(s);
    rallyTo(s, b, IN_RANGE);
    frame(s);
    enterRally(s, b);
    const oldOverlay = overlay(s);
    const oldRoute = routeGfx(s);
    s._retry();
    expect(s.scene.restart).toHaveBeenCalledTimes(1);
    expect(oldOverlay.destroyed).toBe(true);
    expect(oldRoute.destroyed).toBe(true);
    expect(s.rallyMode).toBe(false);
    expect(s.rallyBarracks).toBeNull();
    expect(overlay(s)).not.toBe(oldOverlay);
    expect(routeGfx(s)).not.toBe(oldRoute);
    expect(cancelShown()).toBe(false);
    frame(s);
    expect(sinceClear(overlay(s))).toEqual([]);
    expect(sinceClear(routeGfx(s))).toEqual([]);
  });
});

describe('Review Focus 5: the muzzle flash lands on the drawn soldier', () => {
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });

  it('spawns at drawnPosition(), not the logical road point', () => {
    const s = level();
    const b = buildBarracks(s);
    frame(s); // lays the formation out
    const lead = b.soldiers[0];
    const drawn = lead.drawnPosition();
    expect(Math.hypot(drawn.x - lead.x, drawn.y - lead.y)).toBeGreaterThan(1);
    const seen = [];
    s.particleSpawner.spawnMuzzleFlash = vi.fn((x, y) => seen.push({ x, y, drawn: lead.drawnPosition() }));
    enemyNear(s, lead);
    frame(s);
    expect(seen).toHaveLength(1);
    expect({ x: seen[0].x, y: seen[0].y }).toEqual(seen[0].drawn);
  });
});

describe('E31: debug-built barracks', () => {
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });
  afterEach(() => { delete window.__capture; });

  it('are not marching at load and report it in __capture.rally', () => {
    const s = level({
      debug: { mapId: 0, heroId: 'rael', build: [{ type: 'barracks', slot: PAD, tier: 2, branch: null }], wave: null, errors: [], autoSend: false },
    });
    const [b] = s.placementManager.getTowers();
    frame(s);
    const [entry] = window.__capture.rally;
    expect(entry.target).toBe(b.soldierPathProgress);
    expect(entry.marching).toBe(false);
    expect(entry.soldiers).toEqual(b.soldiers.map(() => ({ progress: b.soldierPathProgress, dead: false })));
    rallyTo(s, b, IN_RANGE);
    frame(s);
    frame(s);
    expect(window.__capture.rally[0].marching).toBe(true);
  });
});
