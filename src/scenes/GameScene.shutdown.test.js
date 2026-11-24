import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../entities/Hero.js', async () => {
  const { HEROES } = await import('../data/heroes.js');
  return {
    Hero: class {
      constructor(scene, { x, y, heroId }) {
        Object.assign(this, { x, y, heroId, def: HEROES[heroId], level: 1, dead: false });
      }
      update() {}
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

import GameScene from './GameScene.js';
import { loadShippedDOM, liveScene, startLevel } from './gameSceneHarness.js';

function el(tag, attrs, parent) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'display') node.style.display = v;
    else node[k] = v;
  }
  (parent || document.body).appendChild(node);
  return node;
}

function setupDOM() {
  document.body.textContent = '';
  el('div', { id: 'hud-layer', display: 'block' });
  const gameMsg = el('div', { id: 'game-msg', display: 'block' });
  el('button', { id: 'msg-btn' }, gameMsg);
  el('button', { id: 'msg-cancel-btn' }, gameMsg);
  el('div', { id: 'paused-overlay', className: 'shown' });
  const bar = el('div', { id: 'rail-right' });
  el('button', { className: 'tower-btn' }, bar);
  el('button', { id: 'exit-btn' }, bar);
  el('button', { id: 'wave-btn' }, bar);
  el('button', { id: 'speed-btn' });
  el('button', { id: 'pause-btn' });
  el('button', { id: 'story-dismiss' });
}

// shutdown() touches: this.inspector, this.game, this._onAbility, DOM,
// this.damageNumbers, this.shakeCtl, this._sentries, this._areaEffects.
// Build a minimal context via the prototype with only what's needed.
// Minimal stand-in for the scene's event emitter. Phaser uses eventemitter3,
// which is only a transitive dependency here, so this mirrors the three
// behaviours the leak depends on: `on` APPENDS (duplicates are allowed and each
// one fires), `off` removes every handler matching fn+context, and `once`
// removes itself after firing.
class SceneEmitter {
  constructor() { this._handlers = new Map(); }
  _list(evt) {
    if (!this._handlers.has(evt)) this._handlers.set(evt, []);
    return this._handlers.get(evt);
  }
  on(evt, fn, ctx)   { this._list(evt).push({ fn, ctx, once: false }); return this; }
  once(evt, fn, ctx) { this._list(evt).push({ fn, ctx, once: true  }); return this; }
  off(evt, fn, ctx) {
    this._handlers.set(evt, this._list(evt).filter(h => !(h.fn === fn && h.ctx === ctx)));
    return this;
  }
  emit(evt, ...args) {
    for (const h of this._list(evt).slice()) {
      if (h.once) this.off(evt, h.fn, h.ctx);
      h.fn.apply(h.ctx, args);
    }
    return this;
  }
  listenerCount(evt) { return this._list(evt).length; }
}

function makeScene() {
  const scene = Object.create(GameScene.prototype);
  scene.inspector = null;
  scene.events = new SceneEmitter();
  scene.game = {
    events: { off() {}, emit() {} },
    registry: { get() { return null; } },
  };
  scene._onAbility = () => {};
  scene._sentries = [];
  // Handlers _wireSceneEvents/_unwireSceneEvents reference by identity.
  scene._spawnEnemy = vi.fn();
  scene._updateHUD  = vi.fn();
  scene._onDefeat   = vi.fn();
  return scene;
}

describe('GameScene.shutdown', () => {
  beforeEach(setupDOM);

  it('hides the hud layer/game-msg and clears the paused-overlay shown class', () => {
    makeScene().shutdown();
    expect(document.getElementById('hud-layer').style.display).toBe('none');
    expect(document.getElementById('game-msg').style.display).toBe('none');
    expect(document.getElementById('paused-overlay').classList.contains('shown')).toBe(false);
  });

  it('removes the exit-btn listener by replacing the node', () => {
    const oldExit = document.getElementById('exit-btn');
    const spy = vi.fn();
    oldExit.addEventListener('click', spy);

    makeScene().shutdown();

    const newExit = document.getElementById('exit-btn');
    expect(newExit).not.toBe(oldExit);
    newExit.click();
    expect(spy).not.toHaveBeenCalled();
  });

  it('removes the msg-cancel-btn listener by replacing the node', () => {
    const oldCancel = document.getElementById('msg-cancel-btn');
    const spy = vi.fn();
    oldCancel.addEventListener('click', spy);

    makeScene().shutdown();

    const newCancel = document.getElementById('msg-cancel-btn');
    expect(newCancel).not.toBe(oldCancel);
    newCancel.click();
    expect(spy).not.toHaveBeenCalled();
  });

  it('removes the pause-btn listener by replacing the node', () => {
    const oldPause = document.getElementById('pause-btn');
    const spy = vi.fn();
    oldPause.addEventListener('click', spy);

    makeScene().shutdown();

    const newPause = document.getElementById('pause-btn');
    expect(newPause).not.toBe(oldPause);
    newPause.click();
    expect(spy).not.toHaveBeenCalled();
  });
});


// Phaser's Systems.shutdown() removes only its own TRANSITION_* listeners, so
// anything create() puts on `this.events` OUTLIVES the scene and is still there
// when create() runs again. Every listener therefore accumulated one copy per
// level entry -- and because WaveManager emits `enemy:spawn` once per queued
// enemy, the Nth playthrough spawned N enemies per emit. Map 0 wave 1 is six
// drones; a second playthrough fielded twelve.
describe('GameScene scene-event wiring survives a replay', () => {
  beforeEach(setupDOM);

  it('registers exactly one enemy:spawn listener after wire -> shutdown -> wire', () => {
    const scene = makeScene();

    scene._wireSceneEvents();   // first entry into a level
    scene.shutdown();           // back to the map select
    scene._wireSceneEvents();   // second entry

    expect(scene.events.listenerCount('enemy:spawn')).toBe(1);
  });

  it('spawns ONE enemy per spawn event on a replay, not two', () => {
    const scene = makeScene();

    scene._wireSceneEvents();
    scene.shutdown();
    scene._wireSceneEvents();

    scene.events.emit('enemy:spawn', { def: {}, scaleFactor: 1 });

    expect(scene._spawnEnemy).toHaveBeenCalledTimes(1);
  });

  it('leaves no scene-level listener behind after shutdown', () => {
    const scene = makeScene();
    scene._wireSceneEvents();

    scene.shutdown();

    for (const evt of ['enemy:spawn', 'economy:update', 'game:defeat', 'hero:level-up']) {
      expect(scene.events.listenerCount(evt)).toBe(0);
    }
  });

  it('relays hero:level-up to the game bus exactly once per replay', () => {
    const scene = makeScene();
    const relayed = [];
    scene.game.events.emit = (evt, payload) => relayed.push([evt, payload]);

    scene._wireSceneEvents();
    scene.shutdown();
    scene._wireSceneEvents();

    scene.events.emit('hero:level-up', { level: 3 });

    expect(relayed).toEqual([['hero:level-up', { level: 3 }]]);
  });
});

// RETRY restarts the same scene instance (ScenePlugin.restart: shutdown, then
// init + create), so it is the replay path at its tightest loop.
describe('GameScene scene-event wiring survives RETRY', () => {
  beforeEach(() => {
    localStorage.clear();
    loadShippedDOM();
  });

  const SCENE_EVENTS = ['shutdown', 'enemy:spawn', 'economy:update', 'game:defeat', 'hero:level-up',
    'damage-dealt', 'wave:start'];
  const counts = (events) => Object.fromEntries(events.eventNames().map(e => [e, events.listenerCount(e)]));

  it('three retries leave one listener per scene event and one enemy per spawn', () => {
    const scene = liveScene();
    startLevel(scene, { mapId: 0, heroId: 'rael' });
    const firstEntry = counts(scene.events);

    for (let i = 0; i < 3; i++) {
      scene._onDefeat();
      scene._retry();
    }

    expect(scene.scene.restart).toHaveBeenCalledTimes(3);
    for (const evt of SCENE_EVENTS) expect(scene.events.listenerCount(evt, scene)).toBe(1);
    expect(counts(scene.events)).toEqual(firstEntry);
    scene.events.emit('enemy:spawn', { def: { type: 'drone' }, scaleFactor: 1 });
    expect(scene.enemies).toHaveLength(1);
  });
});

describe('GameScene.shutdown shell listeners', () => {
  beforeEach(setupDOM);

  it('removes the visibilitychange and portrait-query listeners it added', () => {
    const scene = makeScene();
    scene._onShellChange = () => {};
    const mql = { removeEventListener: vi.fn() };
    scene._portraitMql = mql;
    const remove = vi.spyOn(document, 'removeEventListener');

    scene.shutdown();

    expect(remove).toHaveBeenCalledWith('visibilitychange', scene._onShellChange);
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', scene._onShellChange);
    remove.mockRestore();
  });
});


describe('GameScene.shutdown input model', () => {
  beforeEach(() => {
    setupDOM();
    el('button', { id: 'cancel-btn', hidden: false });
  });

  it('strips the cancel-btn listener by replacing the node, and hides it', () => {
    const old = document.getElementById('cancel-btn');
    const spy = vi.fn();
    old.addEventListener('click', spy);

    makeScene().shutdown();

    const fresh = document.getElementById('cancel-btn');
    expect(fresh).not.toBe(old);
    fresh.click();
    expect(spy).not.toHaveBeenCalled();
    expect(fresh.hidden).toBe(true);
  });

  it('stops listening for ui:cancel', () => {
    const scene = makeScene();
    scene.game.events.off = vi.fn();
    scene.shutdown();
    expect(scene.game.events.off).toHaveBeenCalledWith('ui:cancel', scene._onUiCancel, scene);
  });

  it('destroys the canvas input controller', () => {
    const scene = makeScene();
    const destroy = vi.fn();
    scene._inputCtl = { destroy };
    scene.shutdown();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(scene._inputCtl).toBeNull();
  });
});
