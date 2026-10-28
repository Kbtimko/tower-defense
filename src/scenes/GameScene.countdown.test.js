// Backlog #51: the inter-wave countdown wired into GameScene.update — start on
// the last spawn, tick on game time, hold under the between-wave banner,
// auto-send at zero, pay the time bonus on an early press, and render the
// Send Wave ring state (spec "Frame order", "Edge cases", "GameScene").
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
import { StoryManager } from '../systems/StoryManager.js';
import { WaveCountdown, countdownMsFor } from '../systems/waveCountdown.js';
import { summarizeWave } from '../systems/wavePreview.js';
import { WAVE_COUNTDOWN } from '../data/waveCountdown.js';
import { MAP_WAVES } from '../data/waves.js';
import { MAPS } from '../data/maps.js';
import { STORY_PANELS } from '../data/story.js';

const $ = (id) => document.getElementById(id);
const MAP = 0;
const TOTAL_MS = countdownMsFor(MAPS[MAP]);
const RM = MAPS[MAP].rewardMult ?? 1;
const bonusFor = (ms) => Math.floor((ms / 1000) * WAVE_COUNTDOWN.goldPerSecond * RM);
const CLEAR_BONUS = Math.round(38 * RM);
// The first map-0 wave after wave 1 that has a between-wave banner, and one that has none.
const BANNER_WAVE = Number(Object.keys(STORY_PANELS[MAPS[MAP].storyKey].waves)[0]);
const NO_BANNER_WAVE = 1;

// A scene mid-level with the real economy, wave manager, countdown and button
// render; every canvas step is stubbed (same pattern as GameScene.results.test.js).
function frameScene({ registry = {}, realStory = false } = {}) {
  const scene = Object.create(GameScene.prototype);
  const events = new SceneEmitter();
  const audio = { playSfx: vi.fn(), setCombatActive() {}, playMusic() {} };
  // Kept by reference so a test can flip a setting mid-level.
  const reg = Object.assign(registry, { audio });
  Object.assign(scene, {
    events, mapId: MAP, heroId: 'rael', kills: 0, speed: 1, over: false, won: false,
    enemies: [], _enemiesOnPath: 0, rewardMult: RM,
    _hitStopTimer: 0, _sinceHitStop: 0, _fxTime: 0, _runMs: 0, _startLives: 20,
    economy: new EconomyManager(0, 20, events),
    waveMgr: new WaveManager(MAP_WAVES[MAP], events),
    pathMgr: { path: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
    hero: null,
    inspector: null,
    gfx: { clear() {} },
    time: { paused: false },
    _areaEffects: { update() {} },
    game: { registry: { get: (k) => reg[k] }, events: { emit: vi.fn() } },
    storyMgr: realStory
      ? new StoryManager(STORY_PANELS)
      : { getPanelForWave: () => null, showBanner: vi.fn(), hideBanner: vi.fn() },
    _wavePreview: { setWave: vi.fn(), hide: vi.fn() },
    _countdown: new WaveCountdown(),
    _autoSendOverride: null,
    _waveBtnCache: null,
    _toast: vi.fn(),
    saveMgr: { getStars: () => 0, setStars: vi.fn(), recordRun: vi.fn(), hasSeenBeat: () => true },
    _commitStats: vi.fn(),
    _showResults: vi.fn(),
  });
  for (const m of ['_updateTowers', '_updateProjectiles', '_updateSoldiers', '_updateHero', '_updateSentries',
    '_updateParticles', '_drawPath', '_drawZones', '_drawSelectionRing', '_drawReticle', '_drawParticles',
    '_fadeOutDeadEnemy', '_updateHUD']) scene[m] = vi.fn();
  scene._checkSoldierBlock = () => null;
  events.on('game:defeat', scene._onDefeat, scene);
  scene.audio = audio;
  return scene;
}

// Holds the board open so a wave does not clear on its own.
function stillEnemy(extra = {}) {
  return {
    x: 0, y: 0, waypointIndex: 0, currentSpeed: 0, dead: false, def: { reward: 50 },
    statusEffects: { stun: { active: false } }, update() {}, ...extra,
  };
}

function enemyAtBase() {
  return stillEnemy({ currentSpeed: 10000 });
}

// Sends wave `wave` by hand and plays frames until its spawn queue empties.
// Returns the scene on the spawns-done frame (countdown just started).
function sendAndSpawnAll(scene, wave = 1, { keepBoard = true } = {}) {
  scene.waveMgr.currentWave = wave - 1;
  scene._startWave();
  if (keepBoard) scene.enemies = [stillEnemy()];
  while (scene.waveMgr.hasQueuedEnemies) scene.update(0, 100);
  return scene;
}

const sfxCount = (scene, key) => scene.audio.playSfx.mock.calls.filter(([k]) => k === key).length;

describe('countdown start and auto-send', () => {
  beforeEach(loadShippedDOM);

  it('starts on the spawns-done frame without ticking it, then sends at zero with one SFX and no toast', () => {
    const scene = frameScene();
    scene.waveMgr.currentWave = 0;
    scene._startWave();
    scene.enemies = [stillEnemy()];
    while (scene.waveMgr.hasQueuedEnemies) {
      expect(scene._countdown.running).toBe(false);
      scene.update(0, 100);
    }
    expect(scene._countdown.running).toBe(true);
    expect(scene._countdown.remainingMs).toBe(TOTAL_MS);
    expect(scene._countdown.startedFor).toBe(1);

    const sfxBefore = sfxCount(scene, 'wave-start');
    const goldBefore = scene.economy.gold;
    let frames = 0;
    while (scene.waveMgr.currentWave === 1 && frames < 10000) { scene.update(0, 100); frames++; }
    expect(scene.waveMgr.currentWave).toBe(2);
    expect(frames).toBe(Math.ceil(TOTAL_MS / 100));
    expect(sfxCount(scene, 'wave-start') - sfxBefore).toBe(1);
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.economy.gold).toBe(goldBefore);
    expect(scene._countdown.running).toBe(false);
  });

  it('ticks by exactly the game time _runMs counts, through 2x and hit-stop frames (E1, E12)', () => {
    const scene = sendAndSpawnAll(frameScene());
    const run0 = scene._runMs;
    const rem0 = scene._countdown.remainingMs;
    scene.update(0, 16);
    scene.speed = 2;
    scene.update(0, 16);
    scene.update(0, 33);
    scene._hitStopTimer = 0.01;
    scene.update(0, 16); // consumed by hit-stop: neither advances
    scene.speed = 1;
    scene.update(0, 20);
    const runDelta = scene._runMs - run0;
    expect(runDelta).toBe(16 + 32 + 66 + 20);
    expect(rem0 - scene._countdown.remainingMs).toBe(runDelta);
  });

  it('never sends after a defeat earlier in the same frame (E6)', () => {
    const scene = sendAndSpawnAll(frameScene());
    scene.economy.lives = 1;
    scene._countdown.remainingMs = 10;
    scene.enemies = [enemyAtBase(), stillEnemy()];
    const startWave = vi.spyOn(scene.waveMgr, 'startWave');
    scene.update(0, 16);
    expect(scene.over).toBe(true);
    expect(startWave).not.toHaveBeenCalled();
    expect(scene.waveMgr.currentWave).toBe(1);
  });

  it('a huge frame delta sends exactly one wave (E13)', () => {
    const scene = sendAndSpawnAll(frameScene());
    const startWave = vi.spyOn(scene.waveMgr, 'startWave');
    scene.update(0, 60000);
    expect(startWave).toHaveBeenCalledTimes(1);
    expect(scene.waveMgr.currentWave).toBe(2);
  });

  it('starts no countdown after the final wave spawns, and reads All Waves Done (E5)', () => {
    const scene = sendAndSpawnAll(frameScene(), MAP_WAVES[MAP].length);
    scene.update(0, 100);
    expect(scene._countdown.running).toBe(false);
    expect($('wave-btn').textContent).toBe('All Waves Done');
    expect($('wave-btn').disabled).toBe(true);
    expect($('wave-btn').classList.contains('cd-on')).toBe(false);
  });
});

describe('countdown vs the wave clear and the banner', () => {
  beforeEach(loadShippedDOM);

  it('clear and zero on the same frame: the clear bonus is paid, then the wave sends (E4)', () => {
    const scene = sendAndSpawnAll(frameScene(), NO_BANNER_WAVE);
    scene._countdown.remainingMs = 10;
    scene.enemies[0].dead = true;
    const earn = vi.spyOn(scene.economy, 'earn');
    const startWave = vi.spyOn(scene.waveMgr, 'startWave');
    scene.update(0, 16);
    expect(earn).toHaveBeenCalledWith(CLEAR_BONUS);
    expect(startWave).toHaveBeenCalledTimes(1);
    expect(earn.mock.invocationCallOrder[0]).toBeLessThan(startWave.mock.invocationCallOrder[0]);
    expect(scene.waveMgr.currentWave).toBe(NO_BANNER_WAVE + 1);
  });

  it('clear and zero on the same frame with a banner: holds and does not send (E4)', () => {
    const scene = sendAndSpawnAll(frameScene({ realStory: true }), BANNER_WAVE);
    scene._countdown.remainingMs = 10;
    scene.enemies[0].dead = true;
    scene.update(0, 16);
    expect($('story-banner').classList.contains('visible')).toBe(true);
    expect(scene._countdown.held).toBe(true);
    expect(scene._countdown.remainingMs).toBe(10);
    expect(scene.waveMgr.currentWave).toBe(BANNER_WAVE);
  });

  it('holds while the banner shows and resumes on dismiss (E3)', () => {
    const scene = sendAndSpawnAll(frameScene({ realStory: true }), BANNER_WAVE);
    scene.update(0, 1000);
    scene.enemies[0].dead = true;
    scene.update(0, 16); // clear → banner → hold, before this frame's tick
    const frozen = scene._countdown.remainingMs;
    expect(frozen).toBe(TOTAL_MS - 1000);
    for (let i = 0; i < 10; i++) scene.update(0, 100);
    expect(scene._countdown.remainingMs).toBe(frozen);

    $('story-dismiss').click();
    scene.update(0, 100);
    expect(scene._countdown.held).toBe(false);
    expect(scene._countdown.remainingMs).toBe(frozen - 100);
  });

  it('a banner shown on the spawns-done frame holds the countdown that starts that frame', () => {
    // No enemies on the board: the wave clears on the frame its queue empties.
    const scene = sendAndSpawnAll(frameScene({ realStory: true }), BANNER_WAVE, { keepBoard: false });
    expect($('story-banner').classList.contains('visible')).toBe(true);
    expect(scene._countdown.running).toBe(true);
    expect(scene._countdown.held).toBe(true);
    scene.update(0, 1000);
    expect(scene._countdown.remainingMs).toBe(TOTAL_MS);
  });

  it('a press while held pays the frozen bonus and hides the banner (E11, S1)', () => {
    const scene = sendAndSpawnAll(frameScene({ realStory: true }), BANNER_WAVE);
    scene.update(0, 1000);
    scene.enemies[0].dead = true;
    scene.update(0, 16);
    for (let i = 0; i < 5; i++) scene.update(0, 100);
    const frozen = scene._countdown.remainingMs;
    const gold = scene.economy.gold;
    scene._startWave();
    expect(scene.economy.gold - gold).toBe(bonusFor(frozen));
    expect(bonusFor(frozen)).toBeGreaterThan(0);
    expect($('story-banner').classList.contains('visible')).toBe(false);
    expect(scene.waveMgr.currentWave).toBe(BANNER_WAVE + 1);
    // The banner is gone, so nothing may keep holding the next countdown.
    expect(scene._countdown.held).toBe(false);
  });
});

describe('manual press', () => {
  beforeEach(loadShippedDOM);

  it('pays the time bonus and toasts +Ng', () => {
    const scene = sendAndSpawnAll(frameScene());
    scene.update(0, 1000);
    const expected = bonusFor(TOTAL_MS - 1000);
    expect(expected).toBeGreaterThan(0);
    const gold = scene.economy.gold;
    scene._startWave();
    expect(scene.economy.gold - gold).toBe(expected);
    expect(scene._toast).toHaveBeenCalledWith(`+${expected}g`);
  });

  it('a bonus that floors to 0 pays nothing and shows no toast (E10)', () => {
    const scene = sendAndSpawnAll(frameScene());
    scene._countdown.remainingMs = 100;
    expect(bonusFor(100)).toBe(0);
    const gold = scene.economy.gold;
    scene._startWave();
    expect(scene.economy.gold).toBe(gold);
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.currentWave).toBe(2);
  });

  it('live enemies alone pay nothing (the alive-enemy bonus is gone, spec C1)', () => {
    const scene = frameScene();
    scene.waveMgr.active = true;
    scene.waveMgr.currentWave = 1;
    scene.enemies = [stillEnemy({ def: { reward: 200 } }), stillEnemy({ def: { reward: 200 } })];
    const gold = scene.economy.gold;
    scene._startWave();
    expect(scene.economy.gold).toBe(gold);
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.currentWave).toBe(2);
  });

  it('pays exactly the bonus the label shows', () => {
    const scene = sendAndSpawnAll(frameScene());
    for (let i = 0; i < 37; i++) scene.update(0, 16);
    const m = /\(\+(\d+)g\)$/.exec($('wave-btn').textContent);
    expect(m).not.toBeNull();
    const shown = Number(m[1]);
    const gold = scene.economy.gold;
    scene._startWave();
    expect(scene.economy.gold - gold).toBe(shown);
  });

  it('a press right after an auto-send is a no-op while the new wave spawns', () => {
    const scene = sendAndSpawnAll(frameScene());
    scene.update(0, TOTAL_MS);
    expect(scene.waveMgr.currentWave).toBe(2);
    const gold = scene.economy.gold;
    const sfx = sfxCount(scene, 'wave-start');
    scene._startWave();
    expect(scene.waveMgr.currentWave).toBe(2);
    expect(scene.economy.gold).toBe(gold);
    expect(sfxCount(scene, 'wave-start')).toBe(sfx);
    expect(scene._toast).not.toHaveBeenCalled();
  });
});

describe('auto-send setting', () => {
  beforeEach(loadShippedDOM);

  it('OFF: waits at zero with the ring removed, and a press pays 0 (C2, S2, E18)', () => {
    const scene = sendAndSpawnAll(frameScene({ registry: { autoSend: false } }));
    scene.update(0, 1000);
    expect($('wave-btn').classList.contains('cd-on')).toBe(true);
    for (let i = 0; i < 5; i++) scene.update(0, TOTAL_MS);
    expect(scene.waveMgr.currentWave).toBe(1);
    expect(scene._countdown.running).toBe(true);
    expect(scene._countdown.remainingMs).toBe(0);
    const btn = $('wave-btn');
    expect(btn.textContent).toBe('▶ Send Wave 2');
    expect(btn.disabled).toBe(false);
    expect(btn.classList.contains('cd-on')).toBe(false);
    expect(btn.hasAttribute('data-secs')).toBe(false);
    expect(btn.style.getPropertyValue('--cd')).toBe('');

    const gold = scene.economy.gold;
    scene._startWave();
    expect(scene.economy.gold).toBe(gold);
    expect(scene._toast).not.toHaveBeenCalled();
    expect(scene.waveMgr.currentWave).toBe(2);
  });

  it('switching ON while waiting at zero sends on the next frame (E9)', () => {
    const registry = { autoSend: false };
    const scene = sendAndSpawnAll(frameScene({ registry }));
    scene.update(0, TOTAL_MS);
    scene.update(0, 16);
    expect(scene.waveMgr.currentWave).toBe(1);
    registry.autoSend = true;
    scene.update(0, 16);
    expect(scene.waveMgr.currentWave).toBe(2);
  });
});

describe('button render', () => {
  beforeEach(loadShippedDOM);

  it('writes the label only when it changes, and --cd only per ring quantum', () => {
    const scene = sendAndSpawnAll(frameScene());
    const btn = $('wave-btn');
    scene.update(0, 16); // settle the first render after the start frame
    const textObs = new MutationObserver(() => {});
    textObs.observe(btn, { childList: true, characterData: true, subtree: true });
    const styleObs = new MutationObserver(() => {});
    styleObs.observe(btn, { attributes: true, attributeFilter: ['style'] });

    let labelChanges = 0;
    let last = btn.textContent;
    const frames = 30;
    for (let i = 0; i < frames; i++) {
      const before = scene._countdown.displaySeconds;
      scene.update(0, 16);
      expect(scene._countdown.displaySeconds).toBe(before); // inside one displayed second
      // What the label should read this frame, derived independently of the render.
      const want = `▶ Send Wave 2 (+${bonusFor(scene._countdown.remainingMs)}g)`;
      if (want !== last) { labelChanges++; last = want; }
    }
    const textWrites = textObs.takeRecords().filter(r => r.type === 'childList').length;
    expect(btn.textContent).toBe(last);
    expect(textWrites).toBe(labelChanges);
    expect(labelChanges).toBeLessThan(frames / 4);

    const elapsedFrac = (frames * 16) / TOTAL_MS;
    const cdWrites = styleObs.takeRecords().length;
    expect(cdWrites).toBeLessThanOrEqual(Math.ceil(elapsedFrac / WAVE_COUNTDOWN.ringQuantum) + 1);
    expect(cdWrites).toBeLessThanOrEqual(frames);
    textObs.disconnect();
    styleObs.disconnect();
  });

  it('turns the ring red in the warn window and ticks once per whole second', () => {
    const scene = sendAndSpawnAll(frameScene({ registry: { ambientMotion: true } }));
    const btn = $('wave-btn');
    scene.update(0, TOTAL_MS - WAVE_COUNTDOWN.warnSec * 1000 - 500);
    expect(btn.classList.contains('cd-on')).toBe(true);
    expect(btn.classList.contains('cd-warn')).toBe(false);
    expect(btn.dataset.secs).toBe(String(WAVE_COUNTDOWN.warnSec + 1));
    scene.update(0, 500);
    expect(btn.classList.contains('cd-warn')).toBe(true);
    expect(btn.dataset.secs).toBe(String(WAVE_COUNTDOWN.warnSec));
    expect(btn.classList.contains('cd-tick')).toBe(true);
    btn.classList.remove('cd-tick');
    scene.update(0, 100); // same second: no new tick
    expect(btn.classList.contains('cd-tick')).toBe(false);
    scene.update(0, 900);
    expect(btn.classList.contains('cd-tick')).toBe(true);
  });

  it('never ticks under reduced motion, but still turns red', () => {
    const scene = sendAndSpawnAll(frameScene({ registry: { ambientMotion: false } }));
    const btn = $('wave-btn');
    scene.update(0, TOTAL_MS - 3000);
    scene.update(0, 1000);
    expect(btn.classList.contains('cd-warn')).toBe(true);
    expect(btn.classList.contains('cd-tick')).toBe(false);
  });

  it('the per-frame path never rebuilds the popover; an auto-send hides it and describes the next wave (E19)', () => {
    const scene = sendAndSpawnAll(frameScene());
    scene._wavePreview.setWave.mockClear();
    scene._wavePreview.hide.mockClear();
    for (let i = 0; i < 20; i++) scene.update(0, 100);
    expect(scene._wavePreview.setWave).not.toHaveBeenCalled();

    scene.update(0, TOTAL_MS);
    expect(scene.waveMgr.currentWave).toBe(2);
    expect(scene._wavePreview.hide).toHaveBeenCalledTimes(1);
    expect(scene._wavePreview.setWave).toHaveBeenCalledTimes(1);
    expect(scene._wavePreview.setWave).toHaveBeenLastCalledWith(summarizeWave(MAP, scene.waveMgr.currentWave));
  });
});

describe('live level (real create)', () => {
  beforeEach(() => {
    localStorage.clear();
    loadShippedDOM();
  });

  it('RETRY mid-countdown clears the cloned ring residue (E8)', () => {
    const scene = liveScene({ registry: { ambientMotion: false, autoSend: true } });
    startLevel(scene, { mapId: MAP, heroId: 'rael' });
    scene._startWave();
    scene.waveMgr._spawnQ = [];
    scene._updateCountdown(16); // starts
    scene._updateCountdown(TOTAL_MS - 2000); // into the warn window
    const before = $('wave-btn');
    expect(before.classList.contains('cd-on')).toBe(true);
    expect(before.classList.contains('cd-warn')).toBe(true);
    expect(before.hasAttribute('data-secs')).toBe(true);
    expect(before.style.getPropertyValue('--cd')).not.toBe('');
    before.classList.add('cd-tick');

    scene._retry();

    const btn = $('wave-btn');
    expect(btn).not.toBe(before); // the shutdown clone
    expect(scene._countdown.running).toBe(false);
    for (const cls of ['cd-on', 'cd-warn', 'cd-tick']) expect(btn.classList.contains(cls)).toBe(false);
    expect(btn.hasAttribute('data-secs')).toBe(false);
    expect(btn.style.getPropertyValue('--cd')).toBe('');
    expect(btn.textContent).toBe('▶ Send Wave 1');
    expect(btn.disabled).toBe(false);
  });

  it('a normal level reads the setting; debug levels take ?autosend (default OFF) (S3, E16)', () => {
    const run = (debug) => {
      const scene = liveScene({ registry: { ambientMotion: false, autoSend: true } });
      scene._repaintStaticLayers = vi.fn();
      startLevel(scene, { mapId: MAP, heroId: 'rael', debug });
      return scene;
    };
    expect(run(undefined)._autoSendOverride).toBe(null);
    expect(run({ build: [], wave: 0, errors: [] })._autoSendOverride).toBe(false);
    expect(run({ build: [], wave: 0, errors: [], autoSend: false })._autoSendOverride).toBe(false);
    expect(run({ build: [], wave: 0, errors: [], autoSend: true })._autoSendOverride).toBe(true);

    // ?wave=W: the countdown is idle at start, and that send paid nothing.
    const scene = run({ build: [], wave: 1, errors: [] });
    expect(scene.waveMgr.currentWave).toBe(1);
    expect(scene.economy.earned).toBe(0);
    expect(document.querySelector('.game-toast')).toBeNull();
    expect(window.__capture.countdownMs).toBe(null);
    scene.waveMgr._spawnQ = [];
    scene._updateCountdown(16);
    scene._updateCountdown(TOTAL_MS * 2);
    expect(scene._countdown.remainingMs).toBe(0);
    expect(scene.waveMgr.currentWave).toBe(1); // override OFF beats the registry's ON
  });
});
