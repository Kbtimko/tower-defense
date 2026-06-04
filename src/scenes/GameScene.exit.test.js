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

function setupDOM() {
  document.body.textContent = '';
  const gameMsg = document.createElement('div');
  gameMsg.id = 'game-msg';
  gameMsg.style.display = 'none';
  const title = document.createElement('h2'); title.id = 'msg-title'; gameMsg.appendChild(title);
  const body  = document.createElement('p');  body.id  = 'msg-body';  gameMsg.appendChild(body);
  const btn   = document.createElement('button'); btn.id  = 'msg-btn';
  btn.textContent = '↩ Map Select'; gameMsg.appendChild(btn);
  const cancel = document.createElement('button'); cancel.id = 'msg-cancel-btn';
  cancel.style.display = 'none'; gameMsg.appendChild(cancel);
  document.body.appendChild(gameMsg);
}

function makeScene({ over = false, won = false } = {}) {
  const scene = Object.create(GameScene.prototype);
  scene.over = over;
  scene.won  = won;
  scene._userPaused = false;
  scene.scene = { pause: vi.fn(), resume: vi.fn(), start: vi.fn() };
  return scene;
}

describe('GameScene._showConfirmExit', () => {
  beforeEach(setupDOM);

  it('pauses the scene and shows the abandon-confirm modal', () => {
    const scene = makeScene();

    scene._showConfirmExit();

    expect(scene.scene.pause).toHaveBeenCalledOnce();
    expect(document.getElementById('msg-title').textContent).toBe('Abandon level?');
    expect(document.getElementById('msg-body').textContent).toBe('Progress on this level will be lost.');
    expect(document.getElementById('msg-btn').textContent).toBe('Abandon Level');
    expect(document.getElementById('msg-cancel-btn').style.display).toBe('inline-block');
    expect(document.getElementById('game-msg').style.display).toBe('block');
  });

  it('is a no-op when the game is already over (defeat)', () => {
    const scene = makeScene({ over: true });

    scene._showConfirmExit();

    expect(scene.scene.pause).not.toHaveBeenCalled();
    expect(document.getElementById('game-msg').style.display).toBe('none');
  });

  it('is a no-op when the game has already been won', () => {
    const scene = makeScene({ won: true });

    scene._showConfirmExit();

    expect(scene.scene.pause).not.toHaveBeenCalled();
    expect(document.getElementById('game-msg').style.display).toBe('none');
  });
});

describe('GameScene._showVictoryOverlay modal reset', () => {
  beforeEach(setupDOM);

  it('shows the Map Select button and hides the cancel button', () => {
    // Simulate the modal having been previously repurposed for an Exit confirm
    document.getElementById('msg-btn').textContent          = 'Abandon Level';
    document.getElementById('msg-cancel-btn').style.display = 'inline-block';

    const scene = Object.create(GameScene.prototype);
    scene.kills = 7;

    scene._showVictoryOverlay(3);

    expect(document.getElementById('msg-btn').textContent).toBe('↩ Map Select');
    expect(document.getElementById('msg-cancel-btn').style.display).toBe('none');
    expect(document.getElementById('game-msg').style.display).toBe('block');
  });
});

describe('GameScene._onDefeat modal reset', () => {
  beforeEach(setupDOM);

  it('shows the Map Select button and hides the cancel button', () => {
    document.getElementById('msg-btn').textContent          = 'Abandon Level';
    document.getElementById('msg-cancel-btn').style.display = 'inline-block';

    const scene = Object.create(GameScene.prototype);
    scene.over = false;
    scene.won  = false;
    scene.waveMgr = { currentWave: 3 };
    scene.kills = 0;
    scene.game = { registry: { get() { return null; } } };
    scene._commitStats = () => {};

    scene._onDefeat();

    expect(document.getElementById('msg-btn').textContent).toBe('↩ Map Select');
    expect(document.getElementById('msg-cancel-btn').style.display).toBe('none');
    expect(document.getElementById('game-msg').style.display).toBe('block');
  });
});
