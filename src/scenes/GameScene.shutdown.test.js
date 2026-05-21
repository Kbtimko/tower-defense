import { describe, it, expect, vi, beforeEach } from 'vitest';

// GameScene and its transitive entity imports extend Phaser classes at
// module-load time, so the mock must supply Scene and GameObjects.Container.
vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    GameObjects: {
      Container: class {
        setDepth() { return this; }
        setVisible() { return this; }
        add() {}
      },
    },
  },
}));

const { default: GameScene } = await import('./GameScene.js');

// Build the DOM fixture programmatically (no innerHTML).
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
  const bar = el('div', { id: 'bottom-bar', display: 'flex' });
  el('button', { className: 'tower-btn' }, bar);
  el('button', { id: 'exit-btn' }, bar);
  el('button', { id: 'wave-btn' }, bar);
  el('button', { id: 'speed-btn' });
  el('button', { id: 'panel-upgrade-btn' });
  el('button', { id: 'panel-sell-btn' });
  el('button', { id: 'panel-reposition-btn' });
  el('button', { id: 'story-dismiss' });
}

// shutdown() reads this.game.events.off and this._onAbility; everything else
// it touches is DOM. Build a minimal instance via the prototype.
function makeScene() {
  const scene = Object.create(GameScene.prototype);
  scene.game = { events: { off() {} } };
  scene._onAbility = () => {};
  return scene;
}

describe('GameScene.shutdown', () => {
  beforeEach(setupDOM);

  it('hides hud, bottom-bar, tower-panel and game-msg', () => {
    makeScene().shutdown();
    expect(document.getElementById('hud').style.display).toBe('none');
    expect(document.getElementById('bottom-bar').style.display).toBe('none');
    expect(document.getElementById('tower-panel').style.display).toBe('none');
    expect(document.getElementById('game-msg').style.display).toBe('none');
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
});
