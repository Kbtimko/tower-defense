// Backlog #63: barracks move mode's ghost range ring, driven through the real
// GameScene (create, the tap pipeline, the frame loop) with real Barracks entities
// on map 0's road. Phaser's scene graph is stubbed; Graphics record their calls.
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

import { describe, it, expect, beforeEach } from 'vitest';
import { loadShippedDOM, liveScene, startLevel } from './gameSceneHarness.js';
import { RALLY_FLAG } from '../data/soldiers.js';
import { REPOSITION_SNAP_RADIUS, TAP_TOWER_RADIUS } from '../data/input.js';
import { hexToInt } from '../ui/theme.js';

// Backlog #63: barracks move mode ghosts the range at the pad a tap would land on,
// in the rally style, on the rally overlay layer. Real GameScene, map 0; Graphics record calls.
const OK = hexToInt(RALLY_FLAG.ok);
const BAD = hexToInt(RALLY_FLAG.bad);
const HALO = hexToInt(RALLY_FLAG.halo);
const HALO_WIDTH = RALLY_FLAG.lineWidth + 2 * RALLY_FLAG.haloPx;
// Map 0: pad 0 (696, 360) hosts the barracks. Pad 8 (749, 323) is 64.5 px from it,
// just outside the 60 px snap, so the barracks' own pad can never be the free target.
const PAD = 0;
const NEAR_PAD = 8;
const FAR_PAD = 3;

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

const sinceClear = (g) => g.calls.slice(g.calls.map(c => c[0]).lastIndexOf('clear') + 1);
// Each strokeCircle with the lineStyle (width, colour, alpha) in force when it was drawn.
function rings(g) {
  let style = null;
  const out = [];
  for (const [m, ...a] of sinceClear(g)) {
    if (m === 'lineStyle') style = { width: a[0], colour: a[1], alpha: a[2] };
    if (m === 'strokeCircle') out.push({ x: a[0], y: a[1], r: a[2], ...style });
  }
  return out;
}

function level(mapId = 0) {
  const scene = liveScene({ registry: { ambientMotion: false } });
  scene.add = recordingAdd();
  startLevel(scene, { mapId, heroId: 'rael' });
  return scene;
}
function buildBarracks(scene, slotIndex = PAD) {
  const z = scene.placementManager.getZones()[slotIndex];
  scene._placeAt({ slotIndex, x: z.cx, y: z.cy }, 'barracks');
  return scene.placementManager.getTowers().find(t => t.zoneIndex === slotIndex);
}
const padXY = (scene, i) => { const z = scene.placementManager.getZones()[i]; return { x: z.cx, y: z.cy }; };
function enterMove(scene, b) {
  scene._openRing(b);
  scene._onRadialActivate(scene.radial._items.find(i => i.id === 'reposition'));
}
const overlay = (scene) => scene._rallyOverlayGfx;

describe('reposition overlay (#63, map 0)', () => {
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });

  it('the ghost ring sits on the free pad a tap would land on', () => {
    const s = level();
    const b = buildBarracks(s);
    enterMove(s, b);
    const own = padXY(s, PAD);
    const target = padXY(s, NEAR_PAD);
    // 45% of the way from the barracks' pad to the free pad: closer to the occupied pad.
    const cursor = { x: own.x + 0.45 * (target.x - own.x), y: own.y + 0.45 * (target.y - own.y) };
    const zones = s.placementManager.getZones();
    const nearestAny = zones.map((z, i) => ({ i, d: Math.hypot(z.cx - cursor.x, z.cy - cursor.y) })).sort((p, q) => p.d - q.d)[0];
    expect(nearestAny.i).toBe(PAD);
    expect(zones[PAD].occupied).toBe(true);
    expect(Math.hypot(target.x - cursor.x, target.y - cursor.y)).toBeLessThanOrEqual(REPOSITION_SNAP_RADIUS);
    expect(s.placementManager.getNearestSlot(cursor.x, cursor.y, REPOSITION_SNAP_RADIUS, true).slotIndex).toBe(NEAR_PAD);
    s._buildCursorX = cursor.x;
    s._buildCursorY = cursor.y;
    s._drawRallyOverlay();
    const r = rings(overlay(s));
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ x: target.x, y: target.y, r: b.range, width: HALO_WIDTH, colour: HALO, alpha: RALLY_FLAG.ghostAlpha });
    expect(r[1]).toEqual({ x: target.x, y: target.y, r: b.range, width: RALLY_FLAG.lineWidth, colour: OK, alpha: RALLY_FLAG.ghostAlpha });
    expect(r.some(k => k.x === b.x && k.y === b.y)).toBe(false);
  });

  it('with no free pad in reach the ring is bad, at the cursor', () => {
    const s = level();
    const b = buildBarracks(s);
    enterMove(s, b);
    const zones = s.placementManager.getZones();
    expect(zones[PAD].occupied).toBe(true);
    const free = zones.filter(z => !z.occupied);
    expect(free.every(z => Math.hypot(z.cx - b.x, z.cy - b.y) > REPOSITION_SNAP_RADIUS)).toBe(true);
    expect(s.placementManager.getNearestSlot(b.x, b.y, REPOSITION_SNAP_RADIUS, true)).toBeFalsy();
    s._buildCursorX = b.x;
    s._buildCursorY = b.y;
    s._drawRallyOverlay();
    const r = rings(overlay(s));
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ x: b.x, y: b.y, r: b.range, width: HALO_WIDTH, colour: HALO, alpha: RALLY_FLAG.ghostAlpha });
    expect(r[1]).toMatchObject({ x: b.x, y: b.y, r: b.range, width: RALLY_FLAG.lineWidth, colour: BAD, alpha: RALLY_FLAG.ghostAlpha });
  });

  it('starting move mode draws at once and seeds the cursor on the barracks', () => {
    const s = level();
    const b = buildBarracks(s);
    s._buildCursorX = 5;
    s._buildCursorY = 5;
    s._openRing(b);
    overlay(s).calls.length = 0;
    s._startReposition();
    expect(s.repositionMode).toBe(true);
    expect(s._buildCursorX).toBe(b.x);
    expect(s._buildCursorY).toBe(b.y);
    const r = rings(overlay(s));
    expect(r).toHaveLength(2);
    expect(r.every(k => k.x === b.x && k.y === b.y && k.r === b.range)).toBe(true);
  });

  it('committing or cancelling the move clears the ring', () => {
    const s = level();
    const b = buildBarracks(s);
    const ended = () => {
      const calls = overlay(s).calls;
      expect(calls.at(-1)[0]).toBe('clear');
      expect(s.repositionMode).toBe(false);
    };
    // Moved path: a free pad.
    enterMove(s, b);
    expect(rings(overlay(s))).toHaveLength(2);
    const dest = padXY(s, FAR_PAD);
    s._repositionTo(dest.x, dest.y);
    expect(b.zoneIndex).toBe(FAR_PAD);
    ended();
    // No-slot path: nowhere near a free pad.
    enterMove(s, b);
    expect(rings(overlay(s))).toHaveLength(2);
    const far = { x: 10, y: 10 };
    expect(s.placementManager.getNearestSlot(far.x, far.y, REPOSITION_SNAP_RADIUS, true)).toBeFalsy();
    s._repositionTo(far.x, far.y);
    expect(b.zoneIndex).toBe(FAR_PAD);
    ended();
  });

  it('tapping the barracks with no free pad in reach cancels', () => {
    const s = level();
    const b = buildBarracks(s);
    enterMove(s, b);
    s._onTap(b.x, b.y);
    expect(s.repositionMode).toBe(false);
    expect(b.zoneIndex).toBe(PAD);
    expect(overlay(s).calls.at(-1)[0]).toBe('clear');
  });

  it('the old cyan ring and path dots are gone', () => {
    const s = level();
    const b = buildBarracks(s);
    enterMove(s, b);
    expect(s.repositionMode).toBe(true);
    s.gfx.calls.length = 0;
    s._drawZones();
    expect(s.gfx.calls.some(c => c[0] === 'lineStyle')).toBe(true);
    expect(s.gfx.calls.filter(c => c[0] === 'lineStyle' && c[2] === 0x4fc3f7)).toEqual([]);
    expect(s.gfx.calls.filter(c => c[0] === 'fillStyle' && c[1] === 0x4fc3f7)).toEqual([]);
  });

  it('leaving move mode for a tower button clears the ghost (paused)', () => {
    const s = level();
    const b = buildBarracks(s);
    enterMove(s, b);
    expect(rings(overlay(s))).toHaveLength(2);
    const btn = document.querySelector('.tower-btn');
    s._selectTowerType('archer', btn);
    expect(s.repositionMode).toBe(false);
    expect(rings(overlay(s))).toHaveLength(0);
  });
});

// Backlog #89: on map 5 pad 10 is 33.3 px from pad 6, inside the 60 px snap, so a tap
// on the barracks used to move it. A tap within TAP_TOWER_RADIUS now cancels, as rally does.
describe('move-mode tap on the barracks cancels (#89, map 5)', () => {
  const HOME = 6;
  const NEIGHBOUR = 10;
  beforeEach(() => { localStorage.clear(); loadShippedDOM(); });

  function fixture() {
    const s = level(5);
    const b = buildBarracks(s, HOME);
    enterMove(s, b);
    const zones = s.placementManager.getZones();
    const to = padXY(s, NEIGHBOUR);
    const d = Math.hypot(to.x - b.x, to.y - b.y);
    expect(d).toBeLessThan(REPOSITION_SNAP_RADIUS);
    expect(d).toBeGreaterThan(TAP_TOWER_RADIUS + 2);
    expect(zones[NEIGHBOUR].occupied).toBe(false);
    const at = (k) => [b.x + k * (to.x - b.x) / d, b.y + k * (to.y - b.y) / d];
    return { s, b, zones, at };
  }
  const ringAt = (r, x, y) => r.filter(k => k.x === x && k.y === y);

  it('tapping the barracks centre cancels and leaves it on its pad', () => {
    const { s, b, zones } = fixture();
    const home = padXY(s, HOME);
    s._onTap(b.x, b.y);
    expect(s.repositionMode).toBe(false);
    expect(b.zoneIndex).toBe(HOME);
    expect({ x: b.x, y: b.y }).toEqual(home);
    expect(zones[HOME].occupied).toBe(true);
    expect(zones[NEIGHBOUR].occupied).toBe(false);
    expect(document.getElementById('cancel-btn').hidden).toBe(true);
  });

  it('the cancel boundary is TAP_TOWER_RADIUS', () => {
    const { s, b, zones, at } = fixture();
    expect(s.placementManager.getNearestSlot(...at(21), REPOSITION_SNAP_RADIUS, true).slotIndex).toBe(NEIGHBOUR);
    s._onTap(...at(21));
    expect(s.repositionMode).toBe(false);
    expect(b.zoneIndex).toBe(HOME);
    enterMove(s, b);
    s._onTap(...at(23));
    expect(b.zoneIndex).toBe(NEIGHBOUR);
    expect(zones[HOME].occupied).toBe(false);
  });

  it('the ghost on the barracks is the cancel ring', () => {
    const { s, b } = fixture();
    s._buildCursorX = b.x;
    s._buildCursorY = b.y;
    s._drawRallyOverlay();
    const r = rings(overlay(s));
    const to = padXY(s, NEIGHBOUR);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ x: b.x, y: b.y, r: b.range, width: HALO_WIDTH, colour: HALO, alpha: RALLY_FLAG.ghostAlpha });
    expect(r[1]).toEqual({ x: b.x, y: b.y, r: b.range, width: RALLY_FLAG.lineWidth, colour: BAD, alpha: RALLY_FLAG.ghostAlpha });
    expect(ringAt(r, to.x, to.y)).toEqual([]);
  });

  it('the ghost 21 px out is still the cancel ring centred on the barracks', () => {
    const { s, b, at } = fixture();
    [s._buildCursorX, s._buildCursorY] = at(21);
    s._drawRallyOverlay();
    const r = rings(overlay(s));
    expect(r).toHaveLength(2);
    expect(ringAt(r, b.x, b.y)).toHaveLength(2);
    expect(r[1].colour).toBe(BAD);
  });

  it('the ghost 23 px out is the move ring on the neighbour', () => {
    const { s, at } = fixture();
    [s._buildCursorX, s._buildCursorY] = at(23);
    s._drawRallyOverlay();
    const r = rings(overlay(s));
    const to = padXY(s, NEIGHBOUR);
    expect(r).toHaveLength(2);
    expect(ringAt(r, to.x, to.y)).toHaveLength(2);
    expect(r[1].colour).toBe(OK);
  });
});
