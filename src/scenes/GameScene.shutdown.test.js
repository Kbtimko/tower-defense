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

import GameScene from './GameScene.js';

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
  el('div', { id: 'hud', display: 'flex' });
  el('div', { id: 'tower-panel', display: 'block' });
  const gameMsg = el('div', { id: 'game-msg', display: 'block' });
  el('button', { id: 'msg-btn' }, gameMsg);
  el('button', { id: 'msg-cancel-btn' }, gameMsg);
  el('div', { id: 'paused-overlay', className: 'shown' });
  const bar = el('div', { id: 'bottom-bar', display: 'flex' });
  el('button', { className: 'tower-btn' }, bar);
  el('button', { id: 'exit-btn' }, bar);
  el('button', { id: 'wave-btn' }, bar);
  el('button', { id: 'speed-btn' });
  el('button', { id: 'pause-btn' });
  el('button', { id: 'panel-upgrade-btn' });
  el('button', { id: 'panel-sell-btn' });
  el('button', { id: 'panel-reposition-btn' });
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

  it('hides hud/bottom-bar/tower-panel/game-msg and clears the paused-overlay shown class', () => {
    makeScene().shutdown();
    expect(document.getElementById('hud').style.display).toBe('none');
    expect(document.getElementById('bottom-bar').style.display).toBe('none');
    expect(document.getElementById('tower-panel').style.display).toBe('none');
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
