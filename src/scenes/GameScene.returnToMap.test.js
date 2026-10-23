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
import { MAPS } from '../data/maps.js';

function setupDOM() {
  document.body.textContent = '';
  const gameMsg = document.createElement('div');
  gameMsg.id = 'game-msg';
  for (const [tag, id] of [['h2', 'msg-title'], ['p', 'msg-body'], ['button', 'msg-btn'],
    ['button', 'msg-cancel-btn'], ['button', 'exit-btn'], ['button', 'pause-btn']]) {
    const el = document.createElement(tag); el.id = id; gameMsg.appendChild(el);
  }
  document.body.appendChild(gameMsg);
}

// Minimal save manager: stars persist as the max, like the real SaveManager.
function makeScene({ mapId = 0, saved = 0, lives = null } = {}) {
  const stars = { [mapId]: saved };
  const scene = Object.create(GameScene.prototype);
  scene.mapId = mapId;
  scene.over = false;
  scene.won = false;
  scene.kills = 0;
  scene._userPaused = false;
  scene.scene = { pause: vi.fn(), resume: vi.fn(), start: vi.fn() };
  scene.saveMgr = {
    getStars: (id) => stars[id] ?? 0,
    setStars: (id, s) => { stars[id] = Math.max(stars[id] ?? 0, s); },
    hasSeenBeat: () => true,
    markBeatSeen: () => {},
  };
  scene.economy = { lives: lives ?? MAPS[mapId].startLives };
  scene.waveMgr = { currentWave: 3 };
  scene.game = { registry: { get: () => null } };
  scene._commitStats = () => {};
  scene._closeRadial = () => {};
  scene._syncCancelButton = () => {};
  return scene;
}

describe('GameScene return-to-map data', () => {
  beforeEach(setupDOM);

  it('victory on a fresh map passes prevStars 0 and the earned stars', () => {
    const scene = makeScene({ mapId: 0 });
    scene._onVictory();
    scene._returnToMap();
    expect(scene.scene.start).toHaveBeenCalledWith('MapSelectScene',
      { from: { mapId: 0, result: 'victory', prevStars: 0, stars: 3 } });
  });

  it('reads prevStars before setStars overwrites it', () => {
    const scene = makeScene({ mapId: 0, saved: 1, lives: MAPS[0].startLives });
    scene._onVictory();
    scene._returnToMap();
    expect(scene.scene.start.mock.calls[0][1].from).toMatchObject({ prevStars: 1, stars: 3 });
  });

  it('a worse replay keeps saved stars as prevStars but reports this run', () => {
    const scene = makeScene({ mapId: 0, saved: 3, lives: 1 });
    scene._onVictory();
    scene._returnToMap();
    const from = scene.scene.start.mock.calls[0][1].from;
    expect(from.prevStars).toBe(3);
    expect(from.stars).toBeLessThan(3);
  });

  it('defeat reports saved stars unchanged', () => {
    const scene = makeScene({ mapId: 2, saved: 2 });
    scene._onDefeat();
    scene._returnToMap();
    expect(scene.scene.start).toHaveBeenCalledWith('MapSelectScene',
      { from: { mapId: 2, result: 'defeat', prevStars: 2, stars: 2 } });
  });

  it('abandon from the exit confirm reports saved stars unchanged', () => {
    const scene = makeScene({ mapId: 1, saved: 1 });
    scene._showConfirmExit();
    scene._returnToMap();
    expect(scene.scene.start).toHaveBeenCalledWith('MapSelectScene',
      { from: { mapId: 1, result: 'abandon', prevStars: 1, stars: 1 } });
  });

  it('a double click starts the scene once', () => {
    const scene = makeScene();
    scene._onDefeat();
    scene._returnToMap();
    scene._returnToMap();
    expect(scene.scene.start).toHaveBeenCalledOnce();
  });

  it('label reads World Map on victory and defeat', () => {
    const btn = () => document.getElementById('msg-btn').textContent;
    makeScene()._showVictoryOverlay(2);
    expect(btn()).toBe('↩ World Map');
    document.getElementById('msg-btn').textContent = 'x';
    makeScene()._onDefeat();
    expect(btn()).toBe('↩ World Map');
  });
});
