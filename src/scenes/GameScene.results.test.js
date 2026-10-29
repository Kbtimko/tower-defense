// Roadmap 3.6: the results screen wired into GameScene, RETRY, and the
// same-frame defeat/victory tie (spec §5.3, §5.4, §12.1-14).
vi.mock('phaser', () => ({
  default: {
    Scene: class { constructor(key) { this._key = key; } },
    GameObjects: { Container: class {} },
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import GameScene from './GameScene.js';
import { loadShippedDOM, SceneEmitter, liveScene, startLevel } from './gameSceneHarness.js';
import { EconomyManager } from '../systems/EconomyManager.js';
import { WaveManager } from '../systems/WaveManager.js';
import { SaveManager } from '../systems/SaveManager.js';
import { hasMode } from '../systems/tapResolve.js';
import { starsFor } from '../systems/starRating.js';
import { MAP_WAVES } from '../data/waves.js';
import { MAPS } from '../data/maps.js';
import { TOWER_DEFS } from '../data/towers.js';
import { STORY_SEQUENCES, victorySequenceId } from '../data/story.js';

const NO_BEST = { newBest: { livesLost: false, time: false } };
const $ = (id) => document.getElementById(id);

// A scene mid-level with the real economy and wave manager, and every update
// step stubbed except the two the same-frame tie runs through.
function frameScene({ mapId = 0, lives = 1, startLives = 20, onFinalWave = true } = {}) {
  const scene = Object.create(GameScene.prototype);
  const events = new SceneEmitter();
  const waveMgr = new WaveManager(MAP_WAVES[mapId], events);
  if (onFinalWave) {
    waveMgr.currentWave = waveMgr.waves.length;
    waveMgr.active = true;
  }
  Object.assign(scene, {
    events, mapId, heroId: 'rael', kills: 4, speed: 1, over: false, won: false,
    enemies: [], _enemiesOnPath: 0, rewardMult: 1,
    _hitStopTimer: 0, _sinceHitStop: 0, _fxTime: 0, _runMs: 0, _startLives: startLives,
    economy: new EconomyManager(0, lives, events),
    waveMgr,
    pathMgr: { path: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    hero: null,
    inspector: null,
    gfx: { clear() {} },
    time: { paused: false },
    _areaEffects: { update() {} },
    game: { registry: { get: () => null }, events: { emit: vi.fn() } },
    saveMgr: {
      getStars: () => 0,
      setStars: vi.fn(),
      recordRun: vi.fn(() => NO_BEST),
      hasSeenBeat: () => true,
      markBeatSeen: vi.fn(),
    },
    _commitStats: vi.fn(),
    _showResults: vi.fn(),
  });
  for (const m of ['_updateTowers', '_updateProjectiles', '_updateSoldiers', '_updateHero', '_updateSentries',
    '_updateParticles', '_drawPath', '_drawZones', '_drawSelectionRing', '_drawReticle', '_drawParticles',
    '_fadeOutDeadEnemy', '_updateWaveButton', '_updateHUD', '_updateCountdown']) scene[m] = vi.fn();
  scene._checkSoldierBlock = () => null;
  events.on('game:defeat', scene._onDefeat, scene);
  return scene;
}

// The last enemy of the last wave, one step from the base.
function enemyAtBase() {
  return {
    x: 0, y: 0, waypointIndex: 0, currentSpeed: 10000, dead: false,
    statusEffects: { stun: { active: false } }, update() {},
  };
}

describe('same-frame leak on the final wave (spec §5.4)', () => {
  beforeEach(loadShippedDOM);

  it('a leak at 1 life on the final wave ends in defeat only', () => {
    const scene = frameScene({ lives: 1 });
    scene.enemies = [enemyAtBase()];
    scene._enemiesOnPath = 1;

    scene.update(0, 16);

    expect(scene.over).toBe(true);
    expect(scene.won).toBe(false);
    expect(scene.saveMgr.setStars).not.toHaveBeenCalled();
    expect(scene.saveMgr.recordRun).not.toHaveBeenCalled();
    expect(scene._commitStats).toHaveBeenCalledTimes(1);
    expect(scene._commitStats).toHaveBeenCalledWith(false);
    expect(scene._showResults).toHaveBeenCalledTimes(1);
    expect(scene._showResults).toHaveBeenCalledWith('defeat');
  });
});

describe('GameScene victory records the run', () => {
  beforeEach(loadShippedDOM);

  // A map whose epilogue plays, so the dialog ordering is observable.
  const DIALOG_MAP = MAPS.findIndex((m, i) => STORY_SEQUENCES[victorySequenceId(m.storyKey, i === MAPS.length - 1)]);

  it('records livesLost and _runMs before the story dialog, and opens the results after it', () => {
    const scene = frameScene({ mapId: DIALOG_MAP, lives: 17, startLives: 22 });
    scene._runMs = 581000;
    scene.saveMgr.hasSeenBeat = () => false;
    const best = { newBest: { livesLost: true, time: false } };
    scene.saveMgr.recordRun = vi.fn(() => best);
    scene._storyDialog = { play: vi.fn() };

    scene._onVictory();

    expect(scene.saveMgr.recordRun).toHaveBeenCalledWith(DIALOG_MAP, { livesLost: 5, timeMs: 581000 });
    expect(scene._newBest).toBe(best.newBest);
    expect(scene._storyDialog.play).toHaveBeenCalledTimes(1);
    expect(scene.saveMgr.recordRun.mock.invocationCallOrder[0])
      .toBeLessThan(scene._storyDialog.play.mock.invocationCallOrder[0]);
    expect(scene._showResults).not.toHaveBeenCalled();

    scene._storyDialog.play.mock.calls[0][1]();

    expect(scene._showResults).toHaveBeenCalledWith('victory');
  });

  it('cancels an armed mode at once, before the epilogue dialog plays', () => {
    const scene = frameScene({ mapId: DIALOG_MAP, lives: 17, startLives: 22 });
    scene.saveMgr.hasSeenBeat = () => false;
    scene._onUiCancel = vi.fn();
    scene._storyDialog = { play: vi.fn() };

    scene._onVictory();

    expect(scene._onUiCancel).toHaveBeenCalledTimes(1);
    expect(scene._onUiCancel.mock.invocationCallOrder[0])
      .toBeLessThan(scene._storyDialog.play.mock.invocationCallOrder[0]);
    scene._storyDialog.play.mock.calls[0][1]();
    expect(scene._onUiCancel).toHaveBeenCalledTimes(1);
  });

  it('defeat cancels an armed mode too', () => {
    const scene = frameScene();
    scene._onUiCancel = vi.fn();
    scene._onDefeat();
    expect(scene._onUiCancel).toHaveBeenCalledTimes(1);
  });

  it('opens the results at once when no dialog plays', () => {
    const scene = frameScene({ lives: 20 });
    scene._onVictory();
    expect(scene._showResults).toHaveBeenCalledWith('victory');
  });

  it('stars use the shared star rule against the map start lives', () => {
    const scene = frameScene({ mapId: 0, lives: Math.ceil(MAPS[0].startLives * 0.5) });
    scene._onVictory();
    expect(scene._runStars).toBe(starsFor(scene.economy.lives, MAPS[0].startLives));
    expect(scene.saveMgr.setStars).toHaveBeenCalledWith(0, scene._runStars);
  });

  it('a Garrison run (start 22, 22 left) records livesLost 0', () => {
    const scene = frameScene({ lives: 22, startLives: 22 });
    scene._runMs = 1000;
    scene._onVictory();
    expect(scene.saveMgr.recordRun).toHaveBeenCalledWith(0, { livesLost: 0, timeMs: 1000 });
  });

  it('defeat writes no record', () => {
    const scene = frameScene({ lives: 3 });
    scene._onDefeat();
    expect(scene.saveMgr.recordRun).not.toHaveBeenCalled();
    expect(scene.saveMgr.setStars).not.toHaveBeenCalled();
    expect(scene._showResults).toHaveBeenCalledWith('defeat');
  });
});

describe('GameScene run clock', () => {
  beforeEach(loadShippedDOM);

  const midWave = () => {
    const scene = frameScene({ lives: 10, onFinalWave: false });
    scene.waveMgr.currentWave = 1;
    return scene;
  };

  it('does not run before wave 1', () => {
    const scene = frameScene({ lives: 10, onFinalWave: false });
    scene.update(0, 16);
    expect(scene._runMs).toBe(0);
  });

  it('accumulates delta × speed once a wave is sent', () => {
    const scene = midWave();
    scene.speed = 2;
    scene.update(0, 16);
    expect(scene._runMs).toBe(32);
  });

  it('a hit-stop frame adds nothing', () => {
    const scene = midWave();
    scene._hitStopTimer = 1;
    scene.update(0, 16);
    expect(scene._runMs).toBe(0);
  });

  it('an over or won frame adds nothing', () => {
    for (const flag of ['over', 'won']) {
      const scene = midWave();
      scene[flag] = true;
      scene.update(0, 16);
      expect(scene._runMs).toBe(0);
    }
  });
});

describe('GameScene results actions', () => {
  beforeEach(loadShippedDOM);

  it('routes next, map and retry', () => {
    const scene = Object.create(GameScene.prototype);
    scene._returnToMap = vi.fn();
    scene._retry = vi.fn();
    scene._onResultsAction('next');
    expect(scene._returnToMap).toHaveBeenLastCalledWith({ next: true });
    scene._onResultsAction('map');
    expect(scene._returnToMap).toHaveBeenLastCalledWith();
    scene._onResultsAction('retry');
    expect(scene._retry).toHaveBeenCalledTimes(1);
  });

  it('_retry restarts with mapId, heroId and entryStars only (no debug)', () => {
    const scene = Object.create(GameScene.prototype);
    Object.assign(scene, {
      mapId: 3, heroId: 'kael', _entryStars: 2, _leftToMap: false,
      _debug: { build: [], wave: 0, errors: [] },
      scene: { restart: vi.fn(), start: vi.fn() },
    });
    scene._retry();
    expect(scene.scene.restart).toHaveBeenCalledTimes(1);
    expect(scene.scene.restart.mock.calls[0][0]).toStrictEqual({ mapId: 3, heroId: 'kael', entryStars: 2 });
  });

  it('a second _retry or a _returnToMap after it is ignored', () => {
    const scene = Object.create(GameScene.prototype);
    Object.assign(scene, {
      mapId: 0, heroId: 'rael', _entryStars: 0, _leftToMap: false,
      scene: { restart: vi.fn(), start: vi.fn() },
    });
    scene._retry();
    scene._retry();
    scene._returnToMap();
    expect(scene.scene.restart).toHaveBeenCalledTimes(1);
    expect(scene.scene.start).not.toHaveBeenCalled();
  });
});

describe('GameScene live level (real create)', () => {
  beforeEach(() => {
    localStorage.clear();
    loadShippedDOM();
  });

  it('init -> create honours a carried entryStars, else reads the save', () => {
    new SaveManager().setStars(0, 2);
    const scene = liveScene();
    startLevel(scene, { mapId: 0, heroId: 'rael', entryStars: 0 });
    expect(scene._entryStars).toBe(0);
    scene.events.emit('shutdown');
    startLevel(scene, { mapId: 0, heroId: 'rael' });
    expect(scene._entryStars).toBe(2);
    scene.events.emit('shutdown');
    startLevel(scene, { mapId: 0, heroId: 'rael', entryStars: '1' });
    expect(scene._entryStars).toBe(2);
  });

  it('create sets the run fields and closes a stale results screen', () => {
    $('results').hidden = false;
    const scene = liveScene();
    startLevel(scene, { mapId: 1, heroId: 'rael' });
    expect(scene._runMs).toBe(0);
    expect(scene._startLives).toBe(scene.economy.lives);
    expect(scene._startLives).toBe(MAPS[1].startLives);
    expect($('results').hidden).toBe(true);
  });

  it('victory opens #results, disables Exit/Pause and leaves #game-msg hidden', () => {
    const scene = liveScene();
    startLevel(scene, { mapId: 0, heroId: 'rael' });
    scene.saveMgr.hasSeenBeat = () => true;
    scene._onVictory();
    expect($('results').hidden).toBe(false);
    expect($('results').dataset.result).toBe('victory');
    expect($('results').dataset.stars).toBe(String(scene._runStars));
    expect($('exit-btn').classList.contains('disabled')).toBe(true);
    expect($('pause-btn').classList.contains('disabled')).toBe(true);
    expect($('game-msg').style.display).toBe('none');
  });

  it('a victory that sets a new best time stamps the time chip', () => {
    const scene = liveScene();
    startLevel(scene, { mapId: 0, heroId: 'rael' });
    scene.saveMgr.hasSeenBeat = () => true;
    scene.saveMgr.recordRun = () => ({ newBest: { livesLost: false, time: true } });
    scene._onVictory();
    const stamp = (chip) => document.querySelector(`#results-chips [data-chip="${chip}"] .rs-new-best`);
    expect(stamp('time').hidden).toBe(false);
    expect(stamp('lives').hidden).toBe(true);
  });

  it('the capture hook end(result, overrides) forces the chips and the line', () => {
    const scene = liveScene();
    scene._repaintStaticLayers = vi.fn();
    startLevel(scene, { mapId: 0, heroId: 'rael', debug: { build: [], wave: 0, errors: [] } });
    scene.saveMgr.hasSeenBeat = () => true;
    window.__capture.end('victory', { lives: 1, kills: 12345, goldEarned: 67890, timeMs: 3600000, line: 'FORCED LINE' });
    const chip = (id) => document.querySelector(`#results-chips [data-chip="${id}"] .rs-chip-val`).textContent;
    expect(chip('lives')).toBe(`1/${MAPS[0].startLives}`);
    expect(chip('kills')).toBe('12,345');
    expect(chip('gold')).toBe('67,890');
    expect(chip('time')).toBe('1:00:00');
    expect($('results-line').textContent).toBe('FORCED LINE');
    scene.events.emit('shutdown');
    window.__capture = undefined;
  });

  it('defeat opens #results with no stars and leaves #game-msg hidden', () => {
    const scene = liveScene();
    startLevel(scene, { mapId: 0, heroId: 'rael' });
    scene._onDefeat();
    expect($('results').hidden).toBe(false);
    expect($('results').dataset.result).toBe('defeat');
    expect($('results').dataset.stars).toBe('0');
    expect($('results-retry').classList.contains('rs-btn--primary')).toBe(true);
    expect($('exit-btn').classList.contains('disabled')).toBe(true);
    expect($('pause-btn').classList.contains('disabled')).toBe(true);
    expect($('game-msg').style.display).toBe('none');
  });

  it('shutdown closes the results', () => {
    const scene = liveScene();
    startLevel(scene, { mapId: 0, heroId: 'rael' });
    scene._onDefeat();
    expect($('results').hidden).toBe(false);
    scene.events.emit('shutdown');
    expect($('results').hidden).toBe(true);
  });

  it('RETRY after 2x reopens at 1x with the speed button reading 2x (Review Focus 1)', () => {
    const scene = liveScene();
    startLevel(scene, { mapId: 0, heroId: 'rael' });
    scene._toggleSpeed();
    expect($('speed-btn').textContent).toBe('⏸ 1x');
    scene._onDefeat();
    scene._retry();
    expect(scene.scene.restart).toHaveBeenCalledTimes(1);
    expect(scene.speed).toBe(1);
    expect($('speed-btn').textContent).toBe('⏩ 2x');
  });

  it('closes the ring and any aim mode at game end (Review Focus 5)', () => {
    for (const end of ['_onVictory', '_onDefeat']) {
      loadShippedDOM();
      const scene = liveScene();
      startLevel(scene, { mapId: 0, heroId: 'rael' });
      scene.saveMgr.hasSeenBeat = () => true;
      const def = TOWER_DEFS.archer;
      const tower = {
        type: 'archer', x: 300, y: 300, def, level: 1, branch: null,
        damage: def.damage, range: def.range, fireRate: def.fireRate, pierce: def.pierce,
        showRange: vi.fn(), hideRange: vi.fn(),
      };
      scene.placementManager.getTowers = () => [tower];
      scene._openRing(tower);
      scene.aimMode = true;
      scene._aimSlot = 'w';
      expect($('radial').hidden).toBe(false);
      expect(hasMode(scene._modeState())).toBe(true);
      const dismiss = vi.spyOn(scene.inspector, 'dismiss');
      const hidePeek = vi.spyOn(scene.inspector, 'hidePeek');
      const hidePreview = vi.spyOn(scene._wavePreview, 'hide');
      $('tower-tooltip').style.display = 'block';

      scene[end]();

      expect($('radial').hidden).toBe(true);
      expect(scene.selectedTower).toBeNull();
      expect(hasMode(scene._modeState())).toBe(false);
      expect($('cancel-btn').hidden).toBe(true);
      expect($('tower-tooltip').style.display).toBe('none');
      expect(dismiss).toHaveBeenCalled();
      expect(hidePeek).toHaveBeenCalled();
      expect(hidePreview).toHaveBeenCalled();
      scene.events.emit('shutdown');
    }
  });
});
