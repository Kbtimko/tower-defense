import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// MAPS is read at UIScene module load — keep import order consistent with sibling tests.
import UIScene from './UIScene.js';

function setupMinimalDOM() {
  document.body.textContent = '';
  const ids = [
    'wave-btn','speed-btn','msg-btn','ability-q','ability-w','ability-e',
  ];
  for (const id of ids) {
    const b = document.createElement('button');
    b.id = id;
    document.body.appendChild(b);
  }
}

// UIScene is launched once and never stopped, so its key handler outlives the
// level; GameScene's status is what scopes it to gameplay.
// Every scene made here, so afterEach can unbind its document listener: a leaked
// running-scene handler would preventDefault a later test's Space.
let made = [];
afterEach(() => {
  for (const s of made) if (s._onKeyDown) document.removeEventListener('keydown', s._onKeyDown);
  made = [];
});

function makeUIScene(gameScene = 'running') {
  const scene = Object.create(UIScene.prototype);
  made.push(scene);
  const emit = vi.fn();
  scene.game = { events: { emit, on(){}, off(){} } };
  scene.scene = {
    isActive: (key) => key === 'GameScene' && gameScene === 'running',
    isPaused: (key) => key === 'GameScene' && gameScene === 'paused',
  };
  return { scene, emit };
}

const press = (key) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  document.dispatchEvent(e);
  return e;
};

describe('UIScene Space key', () => {
  beforeEach(setupMinimalDOM);

  it('Space keydown emits ui:pause-toggle', () => {
    const { scene, emit } = makeUIScene();
    scene._bindDOMEvents();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    expect(emit).toHaveBeenCalledWith('ui:pause-toggle');
  });

  it('Space keydown does NOT emit when typing in an INPUT', () => {
    const { scene, emit } = makeUIScene();
    scene._bindDOMEvents();
    const input = document.createElement('input');
    document.body.appendChild(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

    expect(emit).not.toHaveBeenCalledWith('ui:pause-toggle');
  });

  it('Q/W/E still emit ui:ability (no regression)', () => {
    const { scene, emit } = makeUIScene();
    scene._bindDOMEvents();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));

    expect(emit).toHaveBeenCalledWith('ui:ability', { slot: 'q' });
    expect(emit).toHaveBeenCalledWith('ui:ability', { slot: 'w' });
    expect(emit).toHaveBeenCalledWith('ui:ability', { slot: 'e' });
  });
});

describe('UIScene Escape key', () => {
  beforeEach(setupMinimalDOM);

  it('Escape keydown emits ui:cancel', () => {
    const { scene, emit } = makeUIScene();
    scene._bindDOMEvents();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(emit).toHaveBeenCalledWith('ui:cancel');
    document.removeEventListener('keydown', scene._onKeyDown);
  });

  it('Escape in an INPUT does not emit ui:cancel', () => {
    const { scene, emit } = makeUIScene();
    scene._bindDOMEvents();
    const input = document.createElement('input');
    document.body.appendChild(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(emit).not.toHaveBeenCalledWith('ui:cancel');
    document.removeEventListener('keydown', scene._onKeyDown);
  });
});

describe('UIScene keys outside gameplay (world map after a level)', () => {
  beforeEach(setupMinimalDOM);

  it('GameScene shut down: Space is not prevented and nothing emits', () => {
    const { scene, emit } = makeUIScene('shutdown');
    scene._bindDOMEvents();

    const e = press(' ');

    expect(e.defaultPrevented).toBe(false);
    expect(emit).not.toHaveBeenCalled();
    document.removeEventListener('keydown', scene._onKeyDown);
  });

  it('GameScene shut down: Escape and Q/W/E emit nothing', () => {
    const { scene, emit } = makeUIScene('shutdown');
    scene._bindDOMEvents();

    for (const k of ['Escape', 'q', 'w', 'e']) press(k);

    expect(emit).not.toHaveBeenCalled();
    document.removeEventListener('keydown', scene._onKeyDown);
  });

  it('GameScene running: Space is prevented and toggles pause', () => {
    const { scene, emit } = makeUIScene('running');
    scene._bindDOMEvents();

    const e = press(' ');

    expect(e.defaultPrevented).toBe(true);
    expect(emit).toHaveBeenCalledWith('ui:pause-toggle');
    document.removeEventListener('keydown', scene._onKeyDown);
  });

  // The user pause is a Phaser scene.pause(), which makes isActive false: Space
  // must still reach GameScene or a paused game could not be resumed by key.
  it('GameScene paused: Space still toggles pause', () => {
    const { scene, emit } = makeUIScene('paused');
    scene._bindDOMEvents();

    const e = press(' ');

    expect(e.defaultPrevented).toBe(true);
    expect(emit).toHaveBeenCalledWith('ui:pause-toggle');
    document.removeEventListener('keydown', scene._onKeyDown);
  });
});
