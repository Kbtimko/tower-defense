// Test-only: runs the REAL GameScene init/create/shutdown against the shipped
// index.html markup, with Phaser's scene graph stubbed. Not imported by the game.
// Callers must vi.mock('phaser'), Hero, Enemy and AmbientBackgroundLayer.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import GameScene from './GameScene.js';

const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
const SHIPPED_BODY = new DOMParser().parseFromString(html, 'text/html').body;

export function loadShippedDOM() {
  document.body.replaceChildren(...[...SHIPPED_BODY.childNodes].map(n => document.importNode(n, true)));
}

// Same semantics as Phaser's eventemitter3 for what matters here: `on` appends.
export class SceneEmitter {
  constructor() { this._h = new Map(); }
  _list(e) { if (!this._h.has(e)) this._h.set(e, []); return this._h.get(e); }
  on(e, fn, ctx) { this._list(e).push({ fn, ctx, once: false }); return this; }
  once(e, fn, ctx) { this._list(e).push({ fn, ctx, once: true }); return this; }
  off(e, fn, ctx) { this._h.set(e, this._list(e).filter(h => !(h.fn === fn && h.ctx === ctx))); return this; }
  emit(e, ...args) {
    for (const h of this._list(e).slice()) { if (h.once) this.off(e, h.fn, h.ctx); h.fn.apply(h.ctx, args); }
    return this;
  }
  // With ctx, only that owner's handlers: damage-dealt also has DamageNumberOverlay's.
  listenerCount(e, ctx) {
    const list = this._list(e);
    return ctx === undefined ? list.length : list.filter(h => h.ctx === ctx).length;
  }
  eventNames() { return [...this._h.keys()].filter(e => this._h.get(e).length > 0); }
}

// Any Phaser game object: every method chains, so `add.graphics().setDepth(…)` works.
function gameObject() {
  const proxy = new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'then') return undefined;
      target[prop] = () => proxy;
      return target[prop];
    },
  });
  return proxy;
}

// Mirrors ScenePlugin.restart: stop (the shutdown event), then init + create,
// then the 'create' event Phaser emits once the scene is RUNNING.
export function startLevel(scene, data) {
  scene.init(data);
  scene.create();
  scene.events.emit('create');
}

export function liveScene({ registry = { ambientMotion: false } } = {}) {
  const scene = new GameScene();
  Object.assign(scene, {
    events: new SceneEmitter(),
    input: new SceneEmitter(),
    game: {
      registry: { get: (k) => registry[k] ?? null },
      events: new SceneEmitter(),
      config: { backgroundColor: { color: 0 } },
    },
    time: { delayedCall: vi.fn(), paused: false },
    cameras: { main: { setViewport: vi.fn(), setBackgroundColor: vi.fn(), shake: vi.fn() } },
    textures: { exists: () => false },
    add: new Proxy({}, { get: () => () => gameObject() }),
  });
  scene.scene = {
    isActive: () => true, launch: vi.fn(), start: vi.fn(), pause: vi.fn(), resume: vi.fn(), isPaused: () => false,
    restart: vi.fn((data) => {
      scene.events.emit('shutdown');
      startLevel(scene, data);
    }),
  };
  // Canvas-only painting; nothing here touches the state under test.
  scene._renderStaticLayers = vi.fn();
  scene._setupRoad = vi.fn();
  scene._teardownRoad = vi.fn();
  return scene;
}
