// Roadmap 1.7 GameScene wiring: procedural road behind the ROAD_RENDERER flag.
vi.mock('phaser', () => ({
  default: { Scene: class { constructor(key) { this._key = key; } }, GameObjects: { Container: class {} } },
}));
vi.mock('../systems/RoadRenderer.js', () => ({ bakeRoad: vi.fn((s, o) => o.key) }));
vi.mock('../systems/PathEndpoints.js', () => ({
  PathEndpoints: vi.fn(function (scene, opts) { this.opts = opts; this.update = vi.fn(); this.destroy = vi.fn(); }),
}));
vi.mock('../systems/PathRenderer.js', () => ({ renderPath: vi.fn() }));
vi.mock('../systems/PlatformRenderer.js', () => ({ renderPlatforms: vi.fn() }));
vi.mock('../systems/BlockerPlacement.js', () => ({ computeBlockerPlacements: () => [] }));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import GameScene from './GameScene.js';
import { bakeRoad } from '../systems/RoadRenderer.js';
import { PathEndpoints } from '../systems/PathEndpoints.js';
import { renderPath } from '../systems/PathRenderer.js';
import { ROAD_DEPTH, ROAD_RENDERER, roadRendererFor, ROAD_STYLES } from '../data/roads.js';
import { MAPS } from '../data/maps.js';

const map = { ...MAPS[0], blockerSeed: 7 };
const makeScene = (textures = new Set()) => {
  const image = { setDepth: vi.fn().mockReturnThis(), destroy: vi.fn() };
  const ctx = Object.create(GameScene.prototype);
  Object.assign(ctx, {
    scale: { width: 800, height: 600 },
    textures: { exists: (k) => textures.has(k) },
    add: { image: vi.fn(() => image) },
    pathMgr: {
      waypoints: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      path: [{ x: 0, y: 5 }, { x: 50, y: 50 }, { x: 99, y: 98 }],
      buildZones: [],
    },
    _staticLayers: { clear: vi.fn() },
  });
  ctx.add.text = vi.fn(() => ({ setOrigin: vi.fn().mockReturnThis(), setDepth: vi.fn().mockReturnThis() }));
  return { ctx, image };
};

beforeEach(() => vi.clearAllMocks());

describe('roadRendererFor', () => {
  it('defaults to the global flag (procedural)', () => {
    expect(ROAD_RENDERER).toBe('procedural');
    expect(roadRendererFor({})).toBe('procedural');
  });
  it('honours a per-map legacy override', () => {
    expect(roadRendererFor({ roadRenderer: 'legacy' })).toBe('legacy');
  });
  it('every real map resolves a road style', () => {
    for (const m of MAPS) expect(ROAD_STYLES[m.pathRenderStyle], `map ${m.id}`).toBeTruthy();
  });
});

describe('procedural road in GameScene', () => {
  it('bakes under road_map_<id> and adds the image at ROAD_DEPTH', () => {
    const { ctx, image } = makeScene();
    ctx._setupRoad(map);
    expect(bakeRoad).toHaveBeenCalledTimes(1);
    expect(bakeRoad.mock.calls[0][1]).toMatchObject({
      key: `road_map_${map.id}`, waypoints: ctx.pathMgr.waypoints,
      styleKey: map.pathRenderStyle, seed: map.blockerSeed, width: 800, height: 600,
    });
    expect(ctx.add.image).toHaveBeenCalledWith(400, 300, `road_map_${map.id}`);
    expect(image.setDepth).toHaveBeenCalledWith(ROAD_DEPTH);
  });

  it('creates endpoints from the first/last dense path points and adds no IN/OUT labels', () => {
    const { ctx } = makeScene();
    ctx._setupRoad(map);
    expect(PathEndpoints.mock.calls[0][1]).toMatchObject({
      start: { x: 0, y: 5 }, end: { x: 99, y: 98 }, family: ROAD_STYLES[map.pathRenderStyle].family,
    });
    expect(ctx.add.text).not.toHaveBeenCalled();
  });

  it('skips renderPath in the static layer', () => {
    const { ctx } = makeScene();
    ctx._renderStaticLayers(map);
    expect(renderPath).not.toHaveBeenCalled();
  });

  it('replay: the texture already exists, bakeRoad is still asked but a second scene run adds a fresh image', () => {
    const { ctx } = makeScene(new Set([`road_map_${map.id}`]));
    ctx._setupRoad(map);
    // bakeRoad owns the exists() short-circuit; the scene must never remove the texture
    expect(bakeRoad).toHaveBeenCalledTimes(1);
    expect(ctx.textures.remove).toBeUndefined();
  });

  it('shutdown teardown destroys endpoints and image, tolerates a second call', () => {
    const { ctx, image } = makeScene();
    ctx._setupRoad(map);
    const endpoints = ctx._endpoints;
    ctx._teardownRoad();
    expect(endpoints.destroy).toHaveBeenCalledTimes(1);
    expect(image.destroy).toHaveBeenCalledTimes(1);
    expect(ctx._endpoints).toBeNull();
    expect(() => ctx._teardownRoad()).not.toThrow();
  });
});

describe('_drawPath legacy IN/OUT dots', () => {
  it('draws no dots on a procedural map (they would bury the portal and beacon)', () => {
    const { ctx } = makeScene();
    ctx.gfx = { fillStyle: vi.fn(), fillCircle: vi.fn() };
    ctx._setupRoad(map);
    ctx._drawPath();
    expect(ctx.gfx.fillCircle).not.toHaveBeenCalled();
  });
  it('draws two dots on a legacy map', () => {
    const { ctx } = makeScene();
    ctx.gfx = { fillStyle: vi.fn(), fillCircle: vi.fn() };
    ctx._setupRoad({ ...map, roadRenderer: 'legacy' });
    ctx._drawPath();
    expect(ctx.gfx.fillCircle).toHaveBeenCalledTimes(2);
  });
});

describe('legacy road in GameScene', () => {
  const legacy = { ...map, roadRenderer: 'legacy' };
  it('calls renderPath, bakes nothing, keeps IN/OUT labels', () => {
    const { ctx } = makeScene();
    ctx._renderStaticLayers(legacy);
    expect(renderPath).toHaveBeenCalledWith(ctx._staticLayers, ctx.pathMgr.waypoints, legacy.pathRenderStyle);
    ctx._setupRoad(legacy);
    expect(bakeRoad).not.toHaveBeenCalled();
    expect(PathEndpoints).not.toHaveBeenCalled();
    expect(ctx.add.text).toHaveBeenCalledTimes(2);
    expect(ctx.add.text.mock.calls[0][2]).toBe('IN');
    expect(ctx.add.text.mock.calls[1][2]).toBe('OUT');
  });
});
