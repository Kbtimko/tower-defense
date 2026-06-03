import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioManager, getOrCreateAudioManager } from './AudioManager.js';
import { SaveManager } from './SaveManager.js';

function makeGame() {
  return {
    sound: { sounds: [], add: () => ({ play() {}, stop() {}, setVolume() {} }) },
    registry: new Map(),
  };
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });

describe('AudioManager volume & mute', () => {
  it('defaults match SaveManager defaults on first load', () => {
    const sm = new SaveManager();
    const am = new AudioManager(makeGame(), sm);
    expect(am.getSettings()).toEqual({
      masterVol: 0.8, sfxVol: 1.0, musicVol: 0.6, muted: false,
    });
  });

  it('setMasterVolume clamps to [0,1]', () => {
    const am = new AudioManager(makeGame(), new SaveManager());
    am.setMasterVolume(1.5);
    expect(am.getSettings().masterVol).toBe(1);
    am.setMasterVolume(-0.5);
    expect(am.getSettings().masterVol).toBe(0);
  });

  it('effective volume = master x channel x (muted ? 0 : 1)', () => {
    const am = new AudioManager(makeGame(), new SaveManager());
    am.setMasterVolume(0.5); am.setSfxVolume(0.4);
    expect(am.getEffectiveVolume('sfx')).toBeCloseTo(0.2);
    am.setMuted(true);
    expect(am.getEffectiveVolume('sfx')).toBe(0);
    am.setMuted(false);
    expect(am.getEffectiveVolume('sfx')).toBeCloseTo(0.2);
  });

  it('setMasterVolume persists via SaveManager after 300ms debounce', () => {
    const sm = new SaveManager();
    const am = new AudioManager(makeGame(), sm);
    am.setMasterVolume(0.3);
    expect(sm.getSettings().masterVol).toBe(0.8); // not yet flushed
    vi.advanceTimersByTime(300);
    expect(sm.getSettings().masterVol).toBe(0.3);
  });

  it('rapid slider drags only persist once after the debounce window', () => {
    const sm = new SaveManager();
    const spy = vi.spyOn(sm, 'setSettings');
    const am = new AudioManager(makeGame(), sm);
    am.setMasterVolume(0.1);
    am.setMasterVolume(0.2);
    am.setMasterVolume(0.3);
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith({ masterVol: 0.3 });
  });
});

describe('AudioManager SFX', () => {
  function makeGameWithSpy() {
    const playSpy = vi.fn();
    const setVolSpy = vi.fn();
    const fakeSound = { play: playSpy, setVolume: setVolSpy, stop: vi.fn(), isPlaying: true };
    const addSpy = vi.fn(() => fakeSound);
    return {
      game: { sound: { sounds: [fakeSound], add: addSpy }, registry: new Map() },
      playSpy, setVolSpy, addSpy, fakeSound,
    };
  }

  it('playSfx calls scene.sound.add(key) once per key and plays with effective volume', () => {
    const { game, addSpy, playSpy } = makeGameWithSpy();
    const am = new AudioManager(game, new SaveManager());
    am.playSfx('tower-fire-cannon');
    expect(addSpy).toHaveBeenCalledWith('tower-fire-cannon');
    expect(playSpy).toHaveBeenCalledWith(expect.objectContaining({ volume: 0.8 }));
  });

  it('playSfx with muted: true plays at volume 0', () => {
    const { game, playSpy } = makeGameWithSpy();
    const am = new AudioManager(game, new SaveManager());
    am.setMuted(true);
    am.playSfx('tower-fire-cannon');
    expect(playSpy).toHaveBeenCalledWith(expect.objectContaining({ volume: 0 }));
  });

  it('playSfx forwards detune and rate options', () => {
    const { game, playSpy } = makeGameWithSpy();
    const am = new AudioManager(game, new SaveManager());
    am.playSfx('enemy-hit', { detune: 25, rate: 1.1 });
    expect(playSpy).toHaveBeenCalledWith(expect.objectContaining({ detune: 25, rate: 1.1 }));
  });

  it('toggling mute updates volume on already-playing sounds', () => {
    const { game, fakeSound, setVolSpy } = makeGameWithSpy();
    const am = new AudioManager(game, new SaveManager());
    fakeSound.isPlaying = true;
    am.setMuted(true);
    expect(setVolSpy).toHaveBeenCalledWith(0);
    am.setMuted(false);
    expect(setVolSpy).toHaveBeenLastCalledWith(expect.any(Number));
  });
});

describe('AudioManager music', () => {
  function makeMusicGame() {
    const created = [];
    const sound = {
      sounds: [],
      add: vi.fn((key) => {
        const s = {
          key, isPlaying: false, __channel: 'music', volume: 0,
          play(opts = {}) { this.isPlaying = true; this.volume = opts.volume ?? 0; },
          stop() { this.isPlaying = false; },
          setVolume(v) { this.volume = v; },
        };
        created.push(s);
        sound.sounds.push(s);
        return s;
      }),
    };
    return {
      game: {
        sound,
        registry: new Map(),
        cache: { audio: { has: () => true } },
      },
      created,
    };
  }

  it('playMusic(mapId) starts ambient at musicVol and combat at 0', () => {
    const { game, created } = makeMusicGame();
    const am = new AudioManager(game, new SaveManager());
    am.playMusic(0);
    const ambient = created.find(s => s.key === 'map-0-ambient');
    const combat  = created.find(s => s.key === 'map-0-combat');
    expect(ambient.isPlaying).toBe(true);
    expect(ambient.volume).toBeCloseTo(0.8 * 0.6); // master * music
    expect(combat.isPlaying).toBe(true);
    expect(combat.volume).toBe(0);
  });

  it('setCombatActive(true) fades combat to musicVol over 1500ms', () => {
    const { game, created } = makeMusicGame();
    const am = new AudioManager(game, new SaveManager());
    am.playMusic(0);
    const combat = created.find(s => s.key === 'map-0-combat');
    am.setCombatActive(true);
    vi.advanceTimersByTime(1500);
    expect(combat.volume).toBeCloseTo(0.8 * 0.6, 2);
  });

  it('rapid setCombatActive toggles do not stack — last call wins', () => {
    const { game, created } = makeMusicGame();
    const am = new AudioManager(game, new SaveManager());
    am.playMusic(0);
    const combat = created.find(s => s.key === 'map-0-combat');
    am.setCombatActive(true);
    vi.advanceTimersByTime(500);
    am.setCombatActive(false);
    vi.advanceTimersByTime(1500);
    expect(combat.volume).toBeCloseTo(0, 2);
  });

  it('boss theme stops ambient and combat; setCombatActive becomes no-op', () => {
    const { game, created } = makeMusicGame();
    const am = new AudioManager(game, new SaveManager());
    am.playMusic(0);
    am.playMusic('boss-mid');
    const ambient = created.find(s => s.key === 'map-0-ambient');
    const combat  = created.find(s => s.key === 'map-0-combat');
    const boss    = created.find(s => s.key === 'boss-mid');
    expect(ambient.isPlaying).toBe(false);
    expect(combat.isPlaying).toBe(false);
    expect(boss.isPlaying).toBe(true);
    am.setCombatActive(true);
    expect(combat.isPlaying).toBe(false);
  });

  it('stopMusic fades both layers out over fadeMs', () => {
    const { game, created } = makeMusicGame();
    const am = new AudioManager(game, new SaveManager());
    am.playMusic(0);
    am.stopMusic(500);
    vi.advanceTimersByTime(500);
    const ambient = created.find(s => s.key === 'map-0-ambient');
    expect(ambient.isPlaying).toBe(false);
  });
});

describe('getOrCreateAudioManager — singleton', () => {
  it('returns the same instance across calls and stores it on game.registry', () => {
    const game = makeGame();
    const sm   = new SaveManager();
    const a    = getOrCreateAudioManager(game, sm);
    const b    = getOrCreateAudioManager(game, sm);
    expect(a).toBe(b);
    expect(game.registry.get('audio')).toBe(a);
  });
});

describe('AudioManager music — missing keys', () => {
  function makeGameWithMissingKeys(missingKeys) {
    const missing = new Set(missingKeys);
    const created = [];
    const sound = {
      sounds: [],
      add: vi.fn((key) => {
        const s = {
          key, isPlaying: false, __channel: 'music', volume: 0,
          play(opts = {}) { this.isPlaying = true; this.volume = opts.volume ?? 0; },
          stop() { this.isPlaying = false; },
          setVolume(v) { this.volume = v; },
        };
        created.push(s);
        sound.sounds.push(s);
        return s;
      }),
    };
    return {
      game: {
        sound,
        registry: new Map(),
        cache: { audio: { has: (key) => !missing.has(key) } },
      },
      created,
    };
  }

  it('_addMusic returns null and warns once per missing key', () => {
    const { game } = makeGameWithMissingKeys(['map-0-ambient']);
    const am = new AudioManager(game, new SaveManager());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const first  = am._addMusic('map-0-ambient');
    const second = am._addMusic('map-0-ambient');

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('map-0-ambient');

    warnSpy.mockRestore();
  });

  it('playMusic(id) does not throw when ambient and combat keys are missing', () => {
    const { game } = makeGameWithMissingKeys(['map-0-ambient', 'map-0-combat']);
    const am = new AudioManager(game, new SaveManager());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => am.playMusic(0)).not.toThrow();
    expect(am._music.ambient).toBeNull();
    expect(am._music.combat).toBeNull();

    warnSpy.mockRestore();
  });

  it('playMusic("boss-mid") does not throw when boss key is missing', () => {
    const { game } = makeGameWithMissingKeys(['boss-mid']);
    const am = new AudioManager(game, new SaveManager());
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => am.playMusic('boss-mid')).not.toThrow();
    expect(am._music.boss).toBeNull();

    warnSpy.mockRestore();
  });
});

describe('AudioManager.loadAssets', () => {
  it('loads music keys as [ogg, mp3] fallback list', () => {
    const loadAudioSpy = vi.fn();
    const scene = { load: { audio: loadAudioSpy } };
    const am = new AudioManager(makeGame(), new SaveManager());
    am.loadAssets(scene);
    expect(loadAudioSpy).toHaveBeenCalledWith(
      'map-0-ambient',
      ['audio/music/map-0-ambient.ogg', 'audio/music/map-0-ambient.mp3'],
    );
    expect(loadAudioSpy).toHaveBeenCalledWith(
      'boss-final',
      ['audio/music/boss-final.ogg', 'audio/music/boss-final.mp3'],
    );
  });

  it('loads sfx keys as [ogg, mp3] fallback list', () => {
    const loadAudioSpy = vi.fn();
    const scene = { load: { audio: loadAudioSpy } };
    const am = new AudioManager(makeGame(), new SaveManager());
    am.loadAssets(scene);
    expect(loadAudioSpy).toHaveBeenCalledWith(
      'tower-fire-cannon',
      ['audio/sfx/tower-fire-cannon.ogg', 'audio/sfx/tower-fire-cannon.mp3'],
    );
    expect(loadAudioSpy).toHaveBeenCalledWith(
      'ui-click',
      ['audio/sfx/ui-click.ogg', 'audio/sfx/ui-click.mp3'],
    );
  });
});
