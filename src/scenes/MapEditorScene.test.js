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
    expect(s.textures.remove.mock.invocationCallOrder[0]).toBeLessThan(bakeRoad.mock.invocationCallOrder[0]);
    expect(image.setTexture).toHaveBeenCalledWith('road_editor@2');
    expect(image.setVisible).toHaveBeenLastCalledWith(true);
    expect(s.drag).toBeNull();
  });

  it('pointermove on a waypoint marks the road dirty without baking', () => {
    const s = makeScene();
    s._roadDirty = false;
    s.drag = { kind: 'wp', index: 1 };
    s._onPointerMove({ worldX: 300, worldY: 200 });
    expect(s._roadDirty).toBe(true);
    expect(bakeRoad).not.toHaveBeenCalled();
    expect(s.waypoints[1]).toEqual([300 / WORLD_WIDTH, 200 / WORLD_HEIGHT]);
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
