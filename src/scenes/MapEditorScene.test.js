vi.mock('phaser', () => ({
  default: { Scene: class { constructor(key) { this._key = key; } }, Math: { Clamp: (v, a, b) => Math.min(b, Math.max(a, v)) } },
}));

vi.mock('../systems/RoadRenderer.js', () => ({ bakeRoad: vi.fn((scene, o) => o.key) }));
vi.mock('../systems/PathRenderer.js', () => ({ renderPath: vi.fn() }));
vi.mock('../systems/PlatformRenderer.js', () => ({ renderPlatforms: vi.fn() }));
vi.mock('../systems/renderScale.js', () => ({ getRenderScale: () => 2 }));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import MapEditorScene from './MapEditorScene.js';
import { bakeRoad } from '../systems/RoadRenderer.js';
import { renderPath } from '../systems/PathRenderer.js';
import { MAPS } from '../data/maps.js';
import { ROAD_DEPTH } from '../data/roads.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';

function makeEditor() {
  const s = Object.create(MapEditorScene.prototype);
  Object.assign(s, { drag: null, waypoints: [[0, 0.5], [1, 0.5]], slots: [], W: 1280, H: 720 });
  s._hitTest = vi.fn(() => null);
  s._insertWaypointAt = vi.fn();
  s._render = vi.fn();
  return s;
}
const down = (over, extra = {}) => ({
  worldX: 640, worldY: 360, camera: over ? {} : undefined, rightButtonDown: () => false, ...extra,
});

describe('MapEditorScene pointerdown', () => {
  it('inserts a waypoint at the world point on an empty map click', () => {
    const s = makeEditor();
    s._onPointerDown(down(true));
    expect(s._insertWaypointAt).toHaveBeenCalledWith(640, 360);
  });

  // Over a HUD rail Phaser fires the event with no camera and a stale worldX/Y.
  it('ignores a click over a rail (no camera under the pointer)', () => {
    const s = makeEditor();
    s._onPointerDown(down(false));
    expect(s._hitTest).not.toHaveBeenCalled();
    expect(s._insertWaypointAt).not.toHaveBeenCalled();
    expect(s.drag).toBeNull();
  });
});

describe('MapEditorScene rough edges (#88)', () => {
  const W = 1280, H = 720;
  const withCamera = (s, pt) => {
    const getWorldPoint = vi.fn(() => pt);
    s.cameras = { main: { getWorldPoint } };
    return getWorldPoint;
  };
  const threeWp = (s) => { s.waypoints = [[0, 0.5], [0.5, 0.5], [1, 0.5]]; };

  it('a press during a drag is ignored', () => {
    const s = makeEditor();
    threeWp(s);
    s.drag = { kind: 'wp', index: 1 };
    s._hitTest = vi.fn(() => ({ kind: 'wp', index: 1 }));
    s._onPointerDown({ camera: {}, worldX: 640, worldY: 360, rightButtonDown: () => true });
    expect(s.waypoints.length).toBe(3);
    expect(s.drag).toEqual({ kind: 'wp', index: 1 });
    s._hitTest.mockClear();
    s._onPointerDown({ camera: {}, worldX: 640, worldY: 360, rightButtonDown: () => false });
    expect(s._hitTest).not.toHaveBeenCalled();
    expect(s._insertWaypointAt).not.toHaveBeenCalled();
  });

  it('a drag over a rail follows the cursor to the edge (waypoint)', () => {
    const s = makeEditor();
    threeWp(s);
    s.drag = { kind: 'wp', index: 1 };
    const gwp = withCamera(s, { x: -40, y: 200 });
    s._onPointerMove({ x: 5, y: 300, isDown: true, noButtonDown: () => false, worldX: 640, worldY: 360 });
    expect(gwp).toHaveBeenCalledWith(5, 300);
    expect(s.waypoints[1]).toEqual([0, 200 / H]);
  });

  it('a drag over a rail follows the cursor to the edge (slot)', () => {
    const s = makeEditor();
    s.slots = [[0.5, 0.5]];
    s.drag = { kind: 'slot', index: 0 };
    withCamera(s, { x: W + 30, y: 100 });
    s._onPointerMove({ x: 5, y: 300, isDown: true, noButtonDown: () => false, worldX: 640, worldY: 360 });
    expect(s.slots[0]).toEqual([1, 100 / H]);
  });

  it("only the left button's release ends a drag", () => {
    const s = makeEditor();
    threeWp(s);
    s.drag = { kind: 'wp', index: 1 };
    s._onPointerUp({ leftButtonReleased: () => false, noButtonDown: () => false });
    expect(s.drag).toEqual({ kind: 'wp', index: 1 });
    expect(s._render).not.toHaveBeenCalled();
    s._onPointerUp({ leftButtonReleased: () => true, noButtonDown: () => true });
    expect(s.drag).toBeNull();
    s.drag = { kind: 'wp', index: 1 };
    s._onPointerUp();
    expect(s.drag).toBeNull();
  });

  it('a release that leaves no button held ends the drag (middle button)', () => {
    const s = makeEditor();
    threeWp(s);
    s.drag = { kind: 'wp', index: 1 };
    s._onPointerUp({ leftButtonReleased: () => false, noButtonDown: () => true });
    expect(s.drag).toBeNull();
  });

  it('a move with no button held ends the drag even when isDown is stale', () => {
    const s = makeEditor();
    threeWp(s);
    s.drag = { kind: 'wp', index: 1 };
    const before = [...s.waypoints[1]];
    const gwp = withCamera(s, { x: 10, y: 10 });
    gwp.mockClear();
    s._onPointerMove({ x: 5, y: 300, isDown: true, noButtonDown: () => true });
    expect(s.drag).toBeNull();
    expect(s.waypoints[1]).toEqual(before);
    expect(gwp).not.toHaveBeenCalled();
  });
});

describe('MapEditorScene road preview', () => {
  const map = MAPS[0];
  let image;

  // Chainable no-op stand-in for a Phaser Graphics / Container.
  const chain = () => {
    const proxy = new Proxy({}, { get: (t, p) => (p in t ? t[p] : (t[p] = vi.fn(() => proxy))) });
    return proxy;
  };

  function makeScene() {
    image = { visible: undefined };
    for (const m of ['setDisplaySize', 'setDepth', 'setTexture']) image[m] = vi.fn(() => image);
    image.setVisible = vi.fn((v) => { image.visible = v; return image; });
    const s = Object.create(MapEditorScene.prototype);
    Object.assign(s, {
      mapId: 0, W: WORLD_WIDTH, H: WORLD_HEIGHT, drag: null, _roadDirty: true, _roadImage: null,
      waypoints: map.waypoints.map(([x, y]) => [x, y]),
      slots: map.towerSlots.map(([x, y]) => [x, y]),
      layer: chain(), handles: chain(), labelLayer: chain(),
      hud: { setText: vi.fn() },
      textures: { exists: vi.fn(), remove: vi.fn() },
      add: { image: vi.fn(() => image) },
    });
    s._label = vi.fn();
    return s;
  }
  const px = (i) => ({ x: map.waypoints[i][0] * WORLD_WIDTH, y: map.waypoints[i][1] * WORLD_HEIGHT });

  beforeEach(() => { vi.clearAllMocks(); });

  it("bakes the game's road on first render", () => {
    const s = makeScene();
    s._render();
    expect(bakeRoad).toHaveBeenCalledTimes(1);
    const o = bakeRoad.mock.calls[0][1];
    expect(o).toMatchObject({
      key: 'road_editor@2', resolution: 2, styleKey: map.pathRenderStyle, seed: map.blockerSeed,
      width: WORLD_WIDTH, height: WORLD_HEIGHT,
    });
    expect(o.waypoints[0]).toEqual(px(0));
    expect(s.add.image).toHaveBeenCalledTimes(1);
    expect(image.setDepth).toHaveBeenCalledWith(ROAD_DEPTH);
    expect(renderPath).not.toHaveBeenCalled();
  });

  it('does not re-bake when only the slots change', () => {
    const s = makeScene();
    s._render();
    vi.clearAllMocks();
    s.drag = { kind: 'slot', index: 0 };
    s._render();
    s._onPointerUp();
    expect(bakeRoad).not.toHaveBeenCalled();
  });

  it('shows a live line and hides the baked road while a waypoint is dragged', () => {
    const s = makeScene();
    s._render();
    vi.clearAllMocks();
    s.drag = { kind: 'wp', index: 1 };
    s._roadDirty = true;
    s._render();
    expect(renderPath).toHaveBeenCalledTimes(1);
    expect(bakeRoad).not.toHaveBeenCalled();
    expect(image.setVisible).toHaveBeenLastCalledWith(false);
  });

  it('re-bakes once when the waypoint drag ends', () => {
    const s = makeScene();
    s._render();
    s.drag = { kind: 'wp', index: 1 };
    s._roadDirty = true;
    s._render();
    vi.clearAllMocks();
    s.textures.exists.mockReturnValue(true);
    s._onPointerUp();
    expect(s.textures.remove).toHaveBeenCalledWith('road_editor@2');
    expect(bakeRoad).toHaveBeenCalledTimes(1);
    // Order is the contract: bakeRoad returns early when the key already exists, so a bake
    // before the remove would silently serve the old road.
    expect(s.textures.remove.mock.invocationCallOrder[0]).toBeLessThan(bakeRoad.mock.invocationCallOrder[0]);
    expect(image.setTexture).toHaveBeenCalledWith('road_editor@2');
    expect(image.setVisible).toHaveBeenLastCalledWith(true);
    expect(s.drag).toBeNull();
  });

  it("the HUD slot target is the map's shipped slot count", () => {
    const id = MAPS.findIndex(m => m.towerSlots.length !== 6 + m.id);
    expect(id).toBeGreaterThanOrEqual(0);
    const n = MAPS[id].towerSlots.length;
    const s = makeScene();
    s.mapId = id;
    s.slots = MAPS[id].towerSlots.map(([x, y]) => [x, y]);
    s.waypoints = MAPS[id].waypoints.map(([x, y]) => [x, y]);
    s._renderHud();
    expect(s.hud.setText.mock.calls.at(-1)[0]).toContain(`slots: ${n} / ${n} OK`);
    s.slots.push([0.5, 0.5]);
    s._renderHud();
    expect(s.hud.setText.mock.calls.at(-1)[0]).toContain(`slots: ${n + 1} / ${n} MISMATCH`);
  });

  it('pointermove on a waypoint marks the road dirty without baking', () => {
    const s = makeScene();
    s._roadDirty = false;
    s.drag = { kind: 'wp', index: 1 };
    s.cameras = { main: { getWorldPoint: vi.fn(() => ({ x: 300, y: 200 })) } };
    s._onPointerMove({ x: 900, y: 50, isDown: true, noButtonDown: () => false });
    expect(s._roadDirty).toBe(true);
    expect(bakeRoad).not.toHaveBeenCalled();
    expect(s.waypoints[1]).toEqual([300 / WORLD_WIDTH, 200 / WORLD_HEIGHT]);
  });

  it('a move with the button already up ends the drag (focus lost mid-drag)', () => {
    const s = makeScene();
    s._render();
    s.drag = { kind: 'wp', index: 1 };
    const before = [...s.waypoints[1]];
    s._render();
    vi.clearAllMocks();
    s._onPointerMove({ worldX: 300, worldY: 200, isDown: false, noButtonDown: () => true });
    expect(s.drag).toBeNull();
    expect(s.waypoints[1]).toEqual(before);
    expect(image.setVisible).toHaveBeenLastCalledWith(true);
  });

  // Phaser emits only pointerupoutside when the button is released off the canvas.
  it('also ends a drag released off the canvas', () => {
    const s = makeScene();
    s.input = { on: vi.fn() };
    s._bindPointer();
    expect(s.input.on).toHaveBeenCalledWith('pointerupoutside', MapEditorScene.prototype._onPointerUp, s);
    expect(s.input.on).toHaveBeenCalledWith('pointerup', MapEditorScene.prototype._onPointerUp, s);
  });

  it('inserting or deleting a waypoint re-bakes', () => {
    const s = makeScene();
    s._render();
    vi.clearAllMocks();
    const a = px(0), b = px(1);
    s._insertWaypointAt((a.x + b.x) / 2, (a.y + b.y) / 2);
    expect(bakeRoad).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    const p = px(1);
    s._onPointerDown({ worldX: p.x, worldY: p.y, camera: {}, rightButtonDown: () => true });
    expect(bakeRoad).toHaveBeenCalledTimes(1);
  });

  it('a legacy map keeps the renderPath look', () => {
    const s = makeScene();
    map.roadRenderer = 'legacy';
    try {
      s._render();
      expect(renderPath).toHaveBeenCalled();
      expect(bakeRoad).not.toHaveBeenCalled();
    } finally { delete map.roadRenderer; }
  });
});
