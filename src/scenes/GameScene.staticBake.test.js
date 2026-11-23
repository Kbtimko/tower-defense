// Perf 6.1: the static layer must draw through a baked texture. A display-list
// Graphics is re-triangulated by Phaser EVERY frame, which was the dominant CPU cost.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(key) { this._key = key; } }, GameObjects: { Container: class { constructor() {} add() {} setDepth() { return this; } } } },
}));
vi.mock('../entities/Hero.js', async () => {
  const { HEROES } = await import('../data/heroes.js');
  return { Hero: class { constructor(scene, { x, y, heroId }) { Object.assign(this, { x, y, heroId, def: HEROES[heroId], level: 1, dead: false }); } update() {} destroy() {} } };
});
vi.mock('../entities/Enemy.js', () => ({ Enemy: class { constructor(scene, opts) { Object.assign(this, opts, { dead: false }); } } }));
vi.mock('../systems/AmbientBackgroundLayer.js', () => ({ AmbientBackgroundLayer: class { update() {} destroy() {} } }));
vi.mock('../systems/staticLayerBake.js', () => ({
  createStaticBake: vi.fn(() => ({
    surface: new Proxy({ clear: vi.fn() }, { get: (t, p) => (p in t ? t[p] : (t[p] = vi.fn(() => t))) }),
    image: {},
    rebake: vi.fn(),
    destroy: vi.fn(),
  })),
}));

import GameScene from './GameScene.js';
import { loadShippedDOM, liveScene } from './gameSceneHarness.js';
import { createStaticBake } from '../systems/staticLayerBake.js';
import { getRenderScale } from '../systems/renderScale.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';

function makeScene() {
  const scene = liveScene();
  // Un-stub the harness's no-op: this file is about the real _renderStaticLayers.
  scene._renderStaticLayers = GameScene.prototype._renderStaticLayers;
  const proxyObj = (extra = {}) => new Proxy(extra, { get: (t, p) => (p in t ? t[p] : (t[p] = vi.fn(() => t))) });
  const graphics = vi.fn(() => { const g = proxyObj(); g.setDepth = vi.fn(() => g); return g; });
  scene.add = new Proxy({ graphics }, { get: (t, p) => (p in t ? t[p] : () => proxyObj()) });
  return scene;
}

describe('GameScene static layer bake', () => {
  beforeEach(() => { loadShippedDOM(); vi.clearAllMocks(); });

  it('the static layer draws through the bake, not a display-list Graphics (the per-frame cost)', () => {
    const scene = makeScene();
    scene.init({ mapId: 3 }); scene.create();
    expect(createStaticBake).toHaveBeenCalledWith(scene, { width: WORLD_WIDTH, height: WORLD_HEIGHT, resolution: getRenderScale(), depth: 10 });
    expect(scene._staticLayers).toBe(scene._staticBake.surface);
    const depth10 = scene.add.graphics.mock.results.map(r => r.value).filter(g => g.setDepth.mock.calls.some(([d]) => d === 10));
    expect(depth10).toEqual([]);
  });

  it('create re-bakes once the surface is drawn', () => {
    const scene = makeScene();
    scene.init({ mapId: 3 }); scene.create();
    expect(scene._staticBake.rebake).toHaveBeenCalled();
  });

  it('repainting after a build re-bakes, after the surface is redrawn', () => {
    const scene = makeScene();
    scene.init({ mapId: 3 }); scene.create();
    const order = [];
    scene._staticLayers.clear = vi.fn(() => order.push('surface.clear'));
    scene._staticBake.rebake = vi.fn(() => order.push('rebake'));
    scene._repaintStaticLayers();
    expect(order[0]).toBe('surface.clear');
    expect(order.at(-1)).toBe('rebake');
  });

  it('shutdown destroys the bake and nulls it', () => {
    const scene = makeScene();
    scene.init({ mapId: 3 }); scene.create();
    const bake = scene._staticBake;
    scene.shutdown();
    expect(bake.destroy).toHaveBeenCalledTimes(1);
    expect(scene._staticBake).toBeNull();
    expect(scene._staticLayers).toBeNull();
  });
});
