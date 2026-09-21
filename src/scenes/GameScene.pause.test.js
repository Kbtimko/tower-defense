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
  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'pause-btn';
  pauseBtn.textContent = '⏸ Pause';
  document.body.appendChild(pauseBtn);

  const overlay = document.createElement('div');
  overlay.id = 'paused-overlay';
  overlay.style.display = 'none';
  document.body.appendChild(overlay);

  const gameMsg = document.createElement('div');
  gameMsg.id = 'game-msg';
  gameMsg.style.display = 'none';
  document.body.appendChild(gameMsg);
}

function makeScene({ over = false, won = false } = {}) {
  const scene = Object.create(GameScene.prototype);
  scene.over = over;
  scene.won  = won;
  scene._userPaused = false;
  scene.scene = { pause: vi.fn(), resume: vi.fn() };
  return scene;
}

describe('GameScene._onPauseToggle', () => {
  beforeEach(setupDOM);

  it('pauses the scene and shows the overlay on first toggle', () => {
    const scene = makeScene();

    scene._onPauseToggle();

    expect(scene._userPaused).toBe(true);
    expect(scene.scene.pause).toHaveBeenCalledOnce();
    expect(scene.scene.resume).not.toHaveBeenCalled();
    expect(document.getElementById('pause-btn').textContent).toBe('▶ Resume');
    expect(document.getElementById('paused-overlay').classList.contains('shown')).toBe(true);
  });

  it('resumes the scene and hides the overlay on second toggle', () => {
    const scene = makeScene();
    scene._onPauseToggle(); // pause
    scene.scene.pause.mockClear();
    scene.scene.resume.mockClear();

    scene._onPauseToggle(); // resume

    expect(scene._userPaused).toBe(false);
    expect(scene.scene.resume).toHaveBeenCalledOnce();
    expect(scene.scene.pause).not.toHaveBeenCalled();
    expect(document.getElementById('pause-btn').textContent).toBe('⏸ Pause');
    expect(document.getElementById('paused-overlay').classList.contains('shown')).toBe(false);
  });

  it('is a no-op when the game has been lost', () => {
    const scene = makeScene({ over: true });

    scene._onPauseToggle();

    expect(scene._userPaused).toBe(false);
    expect(scene.scene.pause).not.toHaveBeenCalled();
    expect(document.getElementById('pause-btn').textContent).toBe('⏸ Pause');
  });

  it('is a no-op when the game has been won', () => {
    const scene = makeScene({ won: true });

    scene._onPauseToggle();

    expect(scene._userPaused).toBe(false);
    expect(scene.scene.pause).not.toHaveBeenCalled();
  });
});

describe('Exit-confirm Cancel × user-pause interaction', () => {
  beforeEach(() => {
    document.body.textContent = '';
    const gameMsg = document.createElement('div');
    gameMsg.id = 'game-msg';
    gameMsg.style.display = 'block';
    document.body.appendChild(gameMsg);
    const cancel = document.createElement('button');
    cancel.id = 'msg-cancel-btn';
    document.body.appendChild(cancel);
  });

  it('Cancel resumes the scene when the user had NOT paused', () => {
    const scene = makeScene();
    scene._userPaused = false;

    // Reproduce the Cancel handler body inline (the Edit will mirror this).
    document.getElementById('game-msg').style.display = 'none';
    if (!scene._userPaused) scene.scene.resume();

    expect(scene.scene.resume).toHaveBeenCalledOnce();
  });

  it('Cancel does NOT resume the scene when the user HAD paused', () => {
    const scene = makeScene();
    scene._userPaused = true;

    document.getElementById('game-msg').style.display = 'none';
    if (!scene._userPaused) scene.scene.resume();

    expect(scene.scene.resume).not.toHaveBeenCalled();
  });
});


// The pause button shared its styling byte-for-byte with the speed toggle and
// sat immediately after the stat cluster, so the one control you reach for in a
// hurry looked like the one next to it. Making it findable is CSS, but the
// paused state needs a hook the stylesheet can target -- and that hook has to
// survive the same cloneNode trap that already bit the .disabled class.
describe('GameScene pause button state hook', () => {
  beforeEach(setupDOM);

  it('marks the button paused so the stylesheet can highlight it', () => {
    const scene = makeScene();
    scene._onPauseToggle();
    expect(document.getElementById('pause-btn').classList.contains('paused')).toBe(true);
  });

  it('clears the paused mark on resume', () => {
    const scene = makeScene();
    scene._onPauseToggle();
    scene._onPauseToggle();
    expect(document.getElementById('pause-btn').classList.contains('paused')).toBe(false);
  });

  // shutdown() removes DOM listeners by cloning the node, and cloneNode keeps
  // classes. A player who paused, exited, and started a new level would
  // otherwise open it with the button stuck in its paused styling -- exactly
  // the bug the existing .disabled reset in create() exists to prevent.
  it('does not carry the paused mark into the next level', () => {
    const btn = document.getElementById('pause-btn');
    btn.classList.add('paused', 'disabled');

    GameScene.prototype._resetPauseButton.call({});

    expect(btn.classList.contains('paused')).toBe(false);
    expect(btn.classList.contains('disabled')).toBe(false);
    expect(btn.textContent).toBe('⏸ Pause');
  });
});
