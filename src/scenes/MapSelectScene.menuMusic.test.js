import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){}, once(){} } } },
}));

import MapSelectScene from './MapSelectScene.js';
import { mountMapSelectDom } from './mapSelectDom.testutil.js';
import { AudioManager } from '../systems/AudioManager.js';
import { SaveManager } from '../systems/SaveManager.js';

// The real index.html markup; jsdom has no canvas, so the world-map renderer
// no-ops. Fake timers let a test step past the entry input guard.
function setupDom() {
  mountMapSelectDom();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.useFakeTimers();
}

// A Phaser-like sound stub: tracks play/stop so a restart is visible.
function makeAudioGame() {
  const created = [];
  return {
    created,
    cache: { audio: { has: () => true } },
    sound: {
      add: (key) => {
        const snd = { key, isPlaying: false, plays: 0, stops: 0,
          play() { this.isPlaying = true; this.plays++; }, stop() { this.isPlaying = false; this.stops++; },
          setVolume() {} };
        created.push(snd);
        return snd;
      },
    },
    registry: new Map(),
  };
}

describe('MapSelectScene menu music', () => {
  const scenes = [];

  beforeEach(() => {
    setupDom();
    localStorage.clear();
  });

  afterEach(() => {
    for (const s of scenes.splice(0)) s.shutdown();
    vi.useRealTimers();
  });

  function enter(registry) {
    const scene = new MapSelectScene();
    scene.game = { registry };
    scenes.push(scene);
    scene.create({});
    return scene;
  }

  it("create() calls audio.playMusic('menu') exactly once", () => {
    const playMusicSpy = vi.fn();
    enter(new Map([['audio', { playMusic: playMusicSpy }]]));
    expect(playMusicSpy).toHaveBeenCalledTimes(1);
    expect(playMusicSpy).toHaveBeenCalledWith('menu');
  });

  it('create() does not throw when no audio manager is registered', () => {
    expect(() => enter(new Map())).not.toThrow();
  });

  it('re-entering the map does not restart a menu track that is already playing (spec 2.1)', () => {
    const game = makeAudioGame();
    const am = new AudioManager(game, new SaveManager());
    const registry = new Map([['audio', am]]);
    enter(registry);
    scenes.pop().shutdown();
    enter(registry);
    const menus = game.created.filter(s => s.key === 'menu');
    expect(menus).toHaveLength(1);
    expect(menus[0].plays).toBe(1);
    expect(menus[0].stops).toBe(0);
    expect(menus[0].isPlaying).toBe(true);
  });

  it('starts the menu track again if it was stopped underneath', () => {
    const game = makeAudioGame();
    const am = new AudioManager(game, new SaveManager());
    am.playMusic('menu');
    game.created[0].stop();
    am.playMusic('menu');
    expect(game.created.filter(s => s.key === 'menu' && s.isPlaying)).toHaveLength(1);
  });

  it('still switches to the menu track when coming back from a level', () => {
    const game = makeAudioGame();
    const am = new AudioManager(game, new SaveManager());
    am.playMusic(0);
    const level = game.created.filter(s => s.key !== 'menu');
    enter(new Map([['audio', am]]));
    expect(level.every(s => !s.isPlaying)).toBe(true);
    expect(game.created.find(s => s.key === 'menu')?.isPlaying).toBe(true);
  });
});
