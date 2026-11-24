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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import GameScene from './GameScene.js';
import { ResultsScreen } from '../ui/ResultsScreen.js';
import { MAPS } from '../data/maps.js';

const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
const SHIPPED_RESULTS = new DOMParser().parseFromString(html, 'text/html').getElementById('results');

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
  const exitBtn  = document.createElement('button'); exitBtn.id  = 'exit-btn';  document.body.appendChild(exitBtn);
  const pauseBtn = document.createElement('button'); pauseBtn.id = 'pause-btn'; document.body.appendChild(pauseBtn);
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

// The level-end screen is #results now; #game-msg is the Exit confirm only and
// must stay hidden at game end, even after it was repurposed for an abandon prompt.
function endScene({ over = false, won = false } = {}) {
  const scene = makeScene({ over, won });
  Object.assign(scene, {
    mapId: 0, kills: 7, _startLives: MAPS[0].startLives, _runStars: 2, _runMs: 60000, _newBest: null,
    economy: { lives: MAPS[0].startLives, earned: 120 },
    waveMgr: { currentWave: 3, waves: [[], [], []] },
    game: { registry: { get() { return null; } } },
    _commitStats: () => {},
    _results: new ResultsScreen({ motion: () => false }),
  });
  return scene;
}

for (const [end, result] of [['_onVictory', 'victory'], ['_onDefeat', 'defeat']]) {
  describe(`GameScene.${end} modal reset`, () => {
    beforeEach(() => {
      setupDOM();
      document.body.appendChild(document.importNode(SHIPPED_RESULTS, true));
    });

    it('opens #results and leaves the Exit-confirm modal hidden', () => {
      // Simulate the modal having been previously repurposed for an Exit confirm
      document.getElementById('msg-btn').textContent          = 'Abandon Level';
      document.getElementById('msg-cancel-btn').style.display = 'inline-block';
      const scene = endScene();
      scene.saveMgr = {
        getStars: () => 0, setStars() {}, hasSeenBeat: () => true, markBeatSeen() {},
        recordRun: () => ({ newBest: { livesLost: false, time: false } }),
      };

      scene[end]();

      const results = document.getElementById('results');
      expect(results.hidden).toBe(false);
      expect(results.dataset.result).toBe(result);
      expect(document.getElementById('game-msg').style.display).toBe('none');
    });

    it('adds the disabled class to #exit-btn and #pause-btn', () => {
      const exit  = document.getElementById('exit-btn');
      const pause = document.getElementById('pause-btn');
      const scene = endScene();
      scene.saveMgr = {
        getStars: () => 0, setStars() {}, hasSeenBeat: () => true, markBeatSeen() {},
        recordRun: () => ({ newBest: { livesLost: false, time: false } }),
      };

      scene[end]();

      expect(exit.classList.contains('disabled')).toBe(true);
      expect(pause.classList.contains('disabled')).toBe(true);
    });
  });
}
