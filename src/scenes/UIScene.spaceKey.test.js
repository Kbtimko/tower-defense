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

// MAPS is read at UIScene module load — keep import order consistent with sibling tests.
import UIScene from './UIScene.js';

function setupMinimalDOM() {
  document.body.textContent = '';
  const ids = [
    'wave-btn','speed-btn','panel-upgrade-btn','panel-sell-btn','msg-btn',
    'panel-reposition-btn','ability-q','ability-w','ability-e',
  ];
  for (const id of ids) {
    const b = document.createElement('button');
    b.id = id;
    document.body.appendChild(b);
  }
}

function makeUIScene() {
  const scene = Object.create(UIScene.prototype);
  scene._selectedType = null;
  scene._speedFast = false;
  const emit = vi.fn();
  scene.game = { events: { emit, on(){}, off(){} } };
  return { scene, emit };
}

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
