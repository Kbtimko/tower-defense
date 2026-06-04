import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: {
      Container: class {
        constructor(scene, x, y) { this.scene = scene; this.x = x; this.y = y; }
        add() {}
        setDepth() { return this; }
        setVisible() { return this; }
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
function makeScene() {
  const scene = Object.create(GameScene.prototype);
  scene.inspector = null;
  scene.game = {
    events: { off() {} },
    registry: { get() { return null; } },
  };
  scene._onAbility = () => {};
  scene._sentries = [];
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
