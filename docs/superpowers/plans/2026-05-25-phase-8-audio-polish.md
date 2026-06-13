# Phase 8 — Audio & Polish: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-25-phase-8-audio-polish-design.md](../specs/2026-05-25-phase-8-audio-polish-design.md)

**Goal:** Add audio (SFX + two-layer adaptive music), visual polish (floating damage numbers, screen shake, new particles), and a settings overlay to Last Light without regressing any existing functionality.

**Architecture:** Five new modules wired through Phaser's built-in WebAudio system and a versioned save-format bump (v1 → v2 with settings). All audio routed through a single `AudioManager` on the game registry; visual polish modules subscribe to scene events.

**Tech Stack:** Phaser 3.88 (`scene.sound`, `scene.cameras.main.shake`, `Phaser.GameObjects.Particles`), Vitest, jsdom, vanilla DOM for the settings overlay.

**Branch:** `feature/phase-8-audio-polish` (off `feature/phase-3-tower-system`)

---

## Tasks At A Glance

| # | Task | Type | Depends on |
|---|---|---|---|
| 1 | SaveManager v1→v2 migration + settings | TDD | — |
| 2 | AudioManager volume & mute APIs | TDD | 1 |
| 3 | AudioManager SFX playback | TDD | 2 |
| 4 | AudioManager music state machine (ambient + combat) | TDD | 3 |
| 5 | AudioManager.loadAssets + BootScene + registry wiring | Integration | 4 |
| 6 | Settings overlay HTML in `index.html` | Markup | — |
| 7 | `SettingsOverlay` class + MapSelectScene gear button | Integration | 2, 6 |
| 8 | `DamageNumberOverlay` | TDD | — |
| 9 | `ShakeController` | TDD | — |
| 10 | `ParticleSpawner` | TDD | — |
| 11 | Wire SFX, particles, and events into the real call sites (Enemy/Hero/Projectile/GameScene) | Integration | 5, 8, 9, 10 |
| 12 | GameScene wiring — mount systems, enemy-on-path tracker, wave/victory/defeat/life-lost SFX, boss-music trigger, stop music on shutdown | Integration | 11 |
| 13 | Curate and commit CC0 audio assets; switch AudioManager to real files | Assets | 5 |
| 14 | Remove unused `howler` dependency; update notes; final manual verification | Cleanup | 1–13 |

---

## Task 1: SaveManager v1 → v2 migration + settings

**Files:**
- Modify: `src/systems/SaveManager.js`
- Modify (tests): `src/systems/SaveManager.test.js`

**Context:** The current envelope in code today is v1 with flat top-level keys (`version`, `maps`, `upgrades`, `stats`). Phase 8 bumps to v2 by adding a sibling `settings` block. Defaults: `masterVol: 0.8, sfxVol: 1.0, musicVol: 0.6, muted: false`.

- [ ] **Step 1: Write failing tests**

Append to `src/systems/SaveManager.test.js`:

```js
describe('SaveManager — v2 settings', () => {
  it('fresh load: settings have audio defaults', () => {
    const sm = new SaveManager();
    expect(sm.getSettings()).toEqual({
      masterVol: 0.8,
      sfxVol:    1.0,
      musicVol:  0.6,
      muted:     false,
    });
  });

  it('setSettings merges partial and persists', () => {
    const sm = new SaveManager();
    sm.setSettings({ masterVol: 0.5, muted: true });
    expect(sm.getSettings()).toEqual({
      masterVol: 0.5,
      sfxVol:    1.0,
      musicVol:  0.6,
      muted:     true,
    });
    const env = JSON.parse(localStorage.getItem('lastlight_save'));
    expect(env.version).toBe(2);
    expect(env.settings.masterVol).toBe(0.5);
    expect(env.settings.muted).toBe(true);
  });

  it('migrates a v1 envelope by adding settings and bumping version', () => {
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 1,
      maps: [3, 2, 0, 0, 0, 0, 0, 0, 0, 0],
      upgrades: ['command-1'],
      stats: { kills: 100, gamesPlayed: 1, victories: 1, defeats: 0, bestWave: 5 },
    }));
    const sm = new SaveManager();
    expect(sm.getStars(0)).toBe(3);
    expect(sm.getPurchasedUpgrades()).toEqual(['command-1']);
    expect(sm.getSettings().musicVol).toBe(0.6);
    const env = JSON.parse(localStorage.getItem('lastlight_save'));
    expect(env.version).toBe(2);
    expect(env.settings).toBeDefined();
  });

  it('getSettings returns defaults when settings block is missing or malformed', () => {
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 2,
      maps: new Array(10).fill(0),
      upgrades: [],
      stats: { kills: 0, gamesPlayed: 0, victories: 0, defeats: 0, bestWave: 0 },
      settings: 'corrupt',
    }));
    const sm = new SaveManager();
    expect(sm.getSettings()).toEqual({
      masterVol: 0.8,
      sfxVol:    1.0,
      musicVol:  0.6,
      muted:     false,
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- SaveManager`
Expected: 4 new tests fail (`getSettings`/`setSettings` undefined, v2 envelope not written).

- [ ] **Step 3: Update SaveManager.js**

Replace the top of `src/systems/SaveManager.js` (lines 1-13) with:

```js
const STORAGE_KEY = 'lastlight_save';
const LEGACY_KEY  = 'lastlight_progress';
const MAP_COUNT   = 10;
const VERSION     = 2;

function defaultSettings() {
  return { masterVol: 0.8, sfxVol: 1.0, musicVol: 0.6, muted: false };
}

function freshEnvelope() {
  return {
    version:  VERSION,
    maps:     new Array(MAP_COUNT).fill(0),
    upgrades: [],
    stats:    { kills: 0, gamesPlayed: 0, victories: 0, defeats: 0, bestWave: 0 },
    settings: defaultSettings(),
  };
}
```

Update `_load()` to accept v1 and v2 (replace lines 20-31). Replace the existing version-check block with:

```js
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.version === 1 || parsed.version === VERSION)
            && Array.isArray(parsed.maps) && parsed.maps.length === MAP_COUNT) {
          const normalized = this._normalize(parsed);
          if (parsed.version === 1) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          }
          return normalized;
        }
      }
    } catch (_) { /* fall through to migration / fresh */ }
```

Update `_normalize()` (currently lines 52-60) to include settings:

```js
  _normalize(parsed) {
    const env = freshEnvelope();
    env.maps     = parsed.maps.slice();
    env.upgrades = Array.isArray(parsed.upgrades) ? parsed.upgrades.slice() : [];
    if (parsed.stats && typeof parsed.stats === 'object') {
      env.stats = { ...env.stats, ...parsed.stats };
    }
    if (parsed.settings && typeof parsed.settings === 'object' && !Array.isArray(parsed.settings)) {
      env.settings = { ...env.settings, ...parsed.settings };
    }
    return env;
  }
```

Add new methods at the end of the class (before the closing brace):

```js
  // Settings
  getSettings() {
    return { ...this._data.settings };
  }

  setSettings(partial) {
    this._data.settings = { ...this._data.settings, ...partial };
    this._save();
  }
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test -- SaveManager`
Expected: all SaveManager tests pass (previously-existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/systems/SaveManager.js src/systems/SaveManager.test.js
git commit -m "feat: SaveManager v2 — add settings block + v1 migration"
```

- [ ] **Step 6: Add future-version save protection**

Spec §6 says a save with `version > VERSION` must be loaded as-is with a `console.warn`, **never** reset. The current `_load()` (after Step 3) only matches v1 and v2; anything higher falls through to legacy migration / fresh and silently loses the data. Add an explicit branch.

In `src/systems/SaveManager.js`, replace the version-check block from Step 3 with:

```js
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.version === 1 || parsed.version === VERSION)
            && Array.isArray(parsed.maps) && parsed.maps.length === MAP_COUNT) {
          const normalized = this._normalize(parsed);
          if (parsed.version === 1) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          }
          return normalized;
        }
        if (parsed && typeof parsed.version === 'number' && parsed.version > VERSION
            && Array.isArray(parsed.maps) && parsed.maps.length === MAP_COUNT) {
          console.warn(
            `SaveManager: encountered future save version ${parsed.version}; loading as-is, fields may be ignored.`,
          );
          return this._normalize(parsed);
        }
      }
    } catch (_) { /* fall through to migration / fresh */ }
```

Append this test at the end of `src/systems/SaveManager.test.js` (add `import { vi } from 'vitest';` at the top of the file if it isn't already imported):

```js
describe('SaveManager — future-version save', () => {
  it('logs a warning and loads a v3+ envelope as-is without resetting', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('lastlight_save', JSON.stringify({
      version: 999,
      maps: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      upgrades: ['command-1'],
      stats: { kills: 5, gamesPlayed: 1, victories: 1, defeats: 0, bestWave: 2 },
      settings: { masterVol: 0.5, sfxVol: 1.0, musicVol: 0.6, muted: false },
      futureField: 'kept',
    }));
    const sm = new SaveManager();
    expect(sm.getStars(0)).toBe(3);
    expect(sm.getPurchasedUpgrades()).toEqual(['command-1']);
    expect(warn).toHaveBeenCalled();
    const env = JSON.parse(localStorage.getItem('lastlight_save'));
    expect(env.version).toBe(999); // not overwritten
    warn.mockRestore();
  });
});
```

Run: `npm test -- SaveManager`
Expected: new test passes; all previously-existing SaveManager tests still pass.

Commit:

```bash
git add src/systems/SaveManager.js src/systems/SaveManager.test.js
git commit -m "feat: SaveManager — load future-version saves as-is with warn"
```

---

## Task 2: AudioManager volume & mute APIs

**Files:**
- Create: `src/systems/AudioManager.js`
- Create: `src/systems/AudioManager.test.js`

**Context:** Core class. No real Phaser sound binding yet — that comes in Task 3. This task gets the volume model and persistence right against a fake sound system.

- [ ] **Step 1: Write failing tests**

Create `src/systems/AudioManager.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioManager } from './AudioManager.js';
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
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- AudioManager`
Expected: import error (`AudioManager.js` does not exist).

- [ ] **Step 3: Create AudioManager.js**

Create `src/systems/AudioManager.js`:

```js
const DEBOUNCE_MS = 300;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export class AudioManager {
  constructor(game, saveManager) {
    this._game        = game;
    this._save        = saveManager;
    this._settings    = saveManager.getSettings();
    this._pendingSave = null;
    this._saveTimer   = null;
  }

  // Public getters
  getSettings() {
    return { ...this._settings };
  }

  getEffectiveVolume(channel) {
    if (this._settings.muted) return 0;
    const ch = channel === 'music' ? this._settings.musicVol : this._settings.sfxVol;
    return this._settings.masterVol * ch;
  }

  // Setters
  setMasterVolume(v) { this._setField('masterVol', clamp(v, 0, 1)); }
  setSfxVolume(v)    { this._setField('sfxVol',    clamp(v, 0, 1)); }
  setMusicVolume(v)  { this._setField('musicVol',  clamp(v, 0, 1)); }
  setMuted(v)        { this._setField('muted',     Boolean(v)); }

  applySettings(settings) {
    this._settings = { ...this._settings, ...settings };
  }

  // Internal
  _setField(name, value) {
    this._settings[name] = value;
    this._pendingSave = { ...(this._pendingSave || {}), [name]: value };
    this._scheduleSave();
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      if (this._pendingSave) {
        this._save.setSettings(this._pendingSave);
        this._pendingSave = null;
      }
      this._saveTimer = null;
    }, DEBOUNCE_MS);
  }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test -- AudioManager`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/AudioManager.js src/systems/AudioManager.test.js
git commit -m "feat: AudioManager — volume/mute APIs with debounced persistence"
```

---

## Task 3: AudioManager SFX playback

**Files:**
- Modify: `src/systems/AudioManager.js`
- Modify: `src/systems/AudioManager.test.js`

**Context:** Bind to Phaser's `scene.sound.add(key)` and `sound.play(opts)`. Apply the effective volume per call. Respect mute (a mute toggle applied while a sound is playing must zero it).

- [ ] **Step 1: Write failing tests**

Append to `src/systems/AudioManager.test.js`:

```js
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
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- AudioManager`
Expected: `playSfx is not a function`, mute-mid-playback test fails.

- [ ] **Step 3: Extend AudioManager.js**

Add a `_sfxCache` field in constructor (after `this._save        = saveManager;`):

```js
    this._sfxCache    = new Map(); // key -> Phaser.Sound.BaseSound
```

Add `playSfx` method:

```js
  playSfx(key, opts = {}) {
    let sound = this._sfxCache.get(key);
    if (!sound) {
      sound = this._game.sound.add(key);
      this._sfxCache.set(key, sound);
    }
    const volume = this.getEffectiveVolume('sfx') * (opts.volume ?? 1);
    sound.play({ ...opts, volume });
  }
```

Override `_setField` to also re-apply volume to active sounds when master/mute changes:

```js
  _setField(name, value) {
    this._settings[name] = value;
    this._reapplyActiveVolumes();
    this._pendingSave = { ...(this._pendingSave || {}), [name]: value };
    this._scheduleSave();
  }

  _reapplyActiveVolumes() {
    const sfxVol   = this.getEffectiveVolume('sfx');
    const musicVol = this.getEffectiveVolume('music');
    for (const s of this._game.sound.sounds) {
      if (!s.isPlaying) continue;
      const v = s.__channel === 'music' ? musicVol : sfxVol;
      s.setVolume(v);
    }
  }
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test -- AudioManager`
Expected: all SFX tests + earlier volume tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/AudioManager.js src/systems/AudioManager.test.js
git commit -m "feat: AudioManager.playSfx + live volume reapply on mute toggle"
```

---

## Task 4: AudioManager music state machine

**Files:**
- Modify: `src/systems/AudioManager.js`
- Modify: `src/systems/AudioManager.test.js`

**Context:** Per map: an ambient layer always playing at musicVol, a combat layer playing at 0 until `setCombatActive(true)` cross-fades it up over 1500 ms. Boss themes (`boss-mid`, `boss-final`) replace both layers with a single non-layered track.

- [ ] **Step 1: Write failing tests**

Append to `src/systems/AudioManager.test.js`:

```js
describe('AudioManager music', () => {
  function makeMusicGame() {
    const created = [];
    const sound = {
      sounds: [],
      add: vi.fn((key) => {
        const s = {
          key, isPlaying: false, __channel: 'music', __volume: 0,
          play(opts = {}) { this.isPlaying = true; this.__volume = opts.volume ?? 0; },
          stop() { this.isPlaying = false; },
          setVolume(v) { this.__volume = v; },
        };
        created.push(s);
        sound.sounds.push(s);
        return s;
      }),
    };
    return { game: { sound, registry: new Map() }, created };
  }

  it('playMusic(mapId) starts ambient at musicVol and combat at 0', () => {
    const { game, created } = makeMusicGame();
    const am = new AudioManager(game, new SaveManager());
    am.playMusic(0);
    const ambient = created.find(s => s.key === 'map-0-ambient');
    const combat  = created.find(s => s.key === 'map-0-combat');
    expect(ambient.isPlaying).toBe(true);
    expect(ambient.__volume).toBeCloseTo(0.8 * 0.6); // master * music
    expect(combat.isPlaying).toBe(true);
    expect(combat.__volume).toBe(0);
  });

  it('setCombatActive(true) fades combat to musicVol over 1500ms', () => {
    const { game, created } = makeMusicGame();
    const am = new AudioManager(game, new SaveManager());
    am.playMusic(0);
    const combat = created.find(s => s.key === 'map-0-combat');
    am.setCombatActive(true);
    vi.advanceTimersByTime(1500);
    expect(combat.__volume).toBeCloseTo(0.8 * 0.6, 2);
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
    expect(combat.__volume).toBeCloseTo(0, 2);
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
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- AudioManager`
Expected: 5 music tests fail (`playMusic is not a function`).

- [ ] **Step 3: Extend AudioManager.js**

Add music state to the constructor (after `this._sfxCache    = new Map();`):

```js
    this._music = { ambient: null, combat: null, boss: null, combatActive: false };
    this._fadeTimers = new Set();
```

Add music methods at the bottom of the class:

```js
  // Music
  playMusic(id) {
    if (id === 'boss-mid' || id === 'boss-final') {
      this._stopLayers();
      this._music.boss = this._addMusic(id);
      this._music.boss.play({ volume: this.getEffectiveVolume('music'), loop: true });
      return;
    }
    this._stopLayers();
    this._music.combatActive = false;
    this._music.ambient = this._addMusic(`map-${id}-ambient`);
    this._music.ambient.play({ volume: this.getEffectiveVolume('music'), loop: true });
    this._music.combat = this._addMusic(`map-${id}-combat`);
    this._music.combat.play({ volume: 0, loop: true });
  }

  setCombatActive(active) {
    if (this._music.boss || !this._music.combat) return;
    this._music.combatActive = Boolean(active);
    const target = active ? this.getEffectiveVolume('music') : 0;
    this._fadeTo(this._music.combat, target, 1500);
  }

  stopMusic(fadeMs = 500) {
    for (const k of ['ambient', 'combat', 'boss']) {
      const s = this._music[k];
      if (!s) continue;
      this._fadeTo(s, 0, fadeMs, () => { s.stop(); });
    }
    this._music = { ambient: null, combat: null, boss: null, combatActive: false };
  }

  _stopLayers() {
    for (const k of ['ambient', 'combat', 'boss']) {
      const s = this._music[k];
      if (s) s.stop();
      this._music[k] = null;
    }
  }

  _addMusic(key) {
    const sound = this._game.sound.add(key);
    sound.__channel = 'music';
    return sound;
  }

  _fadeTo(sound, targetVol, durationMs, onDone) {
    if (sound.__fadeTimer) {
      clearInterval(sound.__fadeTimer);
      sound.__fadeTimer = null;
    }
    const steps   = Math.max(1, Math.round(durationMs / 50));
    const start   = sound.__volume ?? 0;
    const delta   = (targetVol - start) / steps;
    let   i       = 0;
    const timer = setInterval(() => {
      i++;
      const v = i >= steps ? targetVol : start + delta * i;
      sound.setVolume(v);
      if (i >= steps) {
        clearInterval(timer);
        sound.__fadeTimer = null;
        this._fadeTimers.delete(timer);
        if (onDone) onDone();
      }
    }, 50);
    sound.__fadeTimer = timer;
    this._fadeTimers.add(timer);
  }
```

Replace `_reapplyActiveVolumes()` so the combat layer at 0 stays at 0 when not active:

```js
  _reapplyActiveVolumes() {
    const sfxVol   = this.getEffectiveVolume('sfx');
    const musicVol = this.getEffectiveVolume('music');
    for (const s of this._game.sound.sounds) {
      if (!s.isPlaying) continue;
      if (s.__channel === 'music') {
        if (s === this._music.combat && !this._music.combatActive) {
          s.setVolume(0);
        } else {
          s.setVolume(musicVol);
        }
      } else {
        s.setVolume(sfxVol);
      }
    }
  }
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test -- AudioManager`
Expected: all AudioManager tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/AudioManager.js src/systems/AudioManager.test.js
git commit -m "feat: AudioManager music — ambient/combat layers + boss themes + cross-fade"
```

---

## Task 5: AudioManager.loadAssets + BootScene + registry wiring

**Files:**
- Modify: `src/systems/AudioManager.js`
- Modify: `src/scenes/BootScene.js`

**Context:** Tasks 2-4 left `loadAssets` undefined. This task wires it up to Phaser's loader and ensures one `AudioManager` instance lives on `game.registry` for all scenes to share. Real audio files arrive in Task 13 — this task uses key registration only.

- [ ] **Step 1: Add SFX/music key lists + loadAssets to AudioManager**

Add at the top of `src/systems/AudioManager.js`, below `DEBOUNCE_MS`:

```js
export const SFX_KEYS = [
  'tower-fire-machinegun', 'tower-fire-cannon', 'tower-fire-sniper',
  'tower-fire-laser', 'tower-fire-rocket', 'tower-fire-barracks',
  'tower-place', 'tower-upgrade', 'tower-sell',
  'enemy-hit', 'enemy-death-small', 'enemy-death-large',
  'hero-attack', 'hero-death', 'hero-respawn',
  'hero-overcharge', 'hero-airstrike', 'hero-emp',
  'wave-start', 'life-lost', 'victory', 'defeat', 'ui-click',
];

export const MUSIC_KEYS = [
  ...Array.from({ length: 10 }, (_, i) => `map-${i}-ambient`),
  ...Array.from({ length: 10 }, (_, i) => `map-${i}-combat`),
  'boss-mid', 'boss-final',
];
```

Add to the class:

```js
  loadAssets(scene) {
    for (const key of SFX_KEYS) {
      scene.load.audio(key, `audio/sfx/${key}.mp3`);
    }
    for (const key of MUSIC_KEYS) {
      scene.load.audio(key, `audio/music/${key}.mp3`);
    }
  }
```

Add factory helper for registry use:

```js
export function getOrCreateAudioManager(game, saveManager) {
  let am = game.registry.get('audio');
  if (!am) {
    am = new AudioManager(game, saveManager);
    game.registry.set('audio', am);
  }
  return am;
}
```

- [ ] **Step 2: Wire BootScene**

Replace `src/scenes/BootScene.js` entirely:

```js
import Phaser from 'phaser';
import { SaveManager } from '../systems/SaveManager.js';
import { getOrCreateAudioManager } from '../systems/AudioManager.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    const sm = new SaveManager();
    this.game.registry.set('save', sm);
    const am = getOrCreateAudioManager(this.game, sm);
    am.loadAssets(this);
    this.load.image('spark', 'particles/spark.png');
  }

  create() {
    this.scene.start('MenuScene');
  }
}
```

- [ ] **Step 3: Create placeholder particle texture**

Run:

```bash
mkdir -p public/particles
```

Create `public/particles/spark.png` — a 4x4 white PNG. Use any image editor or generate with imagemagick:

```bash
convert -size 4x4 xc:white public/particles/spark.png
```

If imagemagick isn't installed, commit a 4x4 white pixel from any source. The texture is tinted at runtime so color doesn't matter.

- [ ] **Step 4: Smoke test the build**

Run: `npm run build`
Expected: build succeeds. Audio file 404s in console are expected — assets land in Task 13.

- [ ] **Step 5: Commit**

```bash
git add src/systems/AudioManager.js src/scenes/BootScene.js public/particles/spark.png
git commit -m "feat: BootScene wires AudioManager + SaveManager on game.registry"
```

---

## Task 6: Settings overlay HTML in index.html

**Files:**
- Modify: `index.html`

**Context:** Mirror the existing UpgradeTreeOverlay markup. Add an inline `<style>` block and a hidden settings overlay element after the upgrade overlay.

- [ ] **Step 1: Append styles**

Open `index.html`. Locate the `#upgrade-overlay` CSS block (around lines 134-146). Below it, add:

```html
    #settings-overlay { display:none; position:absolute; inset:0; z-index:16;
      background:rgba(0,0,0,0.7); align-items:center; justify-content:center; padding:24px; }
    #settings-overlay-inner { width:100%; max-width:420px; background:#0a1018;
      border:2px solid #4a8aff; border-radius:8px; padding:18px 22px; font-family:'Courier New',monospace; color:#cfd8e8; }
    #settings-overlay-header { display:flex; align-items:center; gap:14px; margin-bottom:14px; }
    #settings-overlay-title { font-size:18px; color:#6bf; font-weight:bold; flex:1; }
    #settings-close { background:#3a1a1a; border:1px solid #8a3a3a; color:#f07a7a;
      padding:4px 10px; cursor:pointer; font-family:inherit; border-radius:4px; }
    .settings-row { display:flex; align-items:center; gap:10px; margin:8px 0; font-size:12px; }
    .settings-row label { width:90px; color:#8ab; }
    .settings-row input[type=range] { flex:1; }
    .settings-row .settings-val { width:34px; text-align:right; color:#8ab; }
    .settings-mute { margin-top:12px; font-size:12px; color:#cfd8e8; }
```

- [ ] **Step 2: Append the overlay element**

Below the existing upgrade-overlay closing tag (around line 230 onward), add:

```html
    <div id="settings-overlay">
      <div id="settings-overlay-inner">
        <div id="settings-overlay-header">
          <span id="settings-overlay-title">Audio Settings</span>
          <button id="settings-close">CLOSE</button>
        </div>
        <div class="settings-row">
          <label for="vol-master">Master</label>
          <input id="vol-master" type="range" min="0" max="100" step="1" />
          <span class="settings-val" id="vol-master-val">80</span>
        </div>
        <div class="settings-row">
          <label for="vol-sfx">Sound Effects</label>
          <input id="vol-sfx" type="range" min="0" max="100" step="1" />
          <span class="settings-val" id="vol-sfx-val">100</span>
        </div>
        <div class="settings-row">
          <label for="vol-music">Music</label>
          <input id="vol-music" type="range" min="0" max="100" step="1" />
          <span class="settings-val" id="vol-music-val">60</span>
        </div>
        <div class="settings-mute">
          <label><input id="mute-all" type="checkbox" /> Mute all audio</label>
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Smoke test**

Run: `npm run dev`
Open the page, open devtools, confirm `document.getElementById('settings-overlay')` returns the element (no JS wiring yet, so it stays hidden).

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: settings overlay markup in index.html"
```

---

## Task 7: SettingsOverlay class + MapSelectScene gear button

**Files:**
- Create: `src/ui/SettingsOverlay.js`
- Create: `src/ui/SettingsOverlay.test.js`
- Modify: `src/scenes/MapSelectScene.js`

**Context:** Class mirrors `UpgradeTreeOverlay` exactly (getElementById-based, attaches listeners on `open()`, removes on `close()`). MapSelectScene gets a gear button that opens it.

- [ ] **Step 1: Write failing tests**

Create `src/ui/SettingsOverlay.test.js`. The test setup builds DOM nodes with `createElement` to keep the file free of `innerHTML` strings:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsOverlay } from './SettingsOverlay.js';

function setupDom() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const overlay = document.createElement('div');
  overlay.id = 'settings-overlay';
  overlay.style.display = 'none';

  const closeBtn = document.createElement('button');
  closeBtn.id = 'settings-close';
  closeBtn.textContent = 'CLOSE';
  overlay.appendChild(closeBtn);

  for (const ch of ['master', 'sfx', 'music']) {
    const input = document.createElement('input');
    input.id = `vol-${ch}`;
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    overlay.appendChild(input);

    const val = document.createElement('span');
    val.id = `vol-${ch}-val`;
    overlay.appendChild(val);
  }

  const mute = document.createElement('input');
  mute.id = 'mute-all';
  mute.type = 'checkbox';
  overlay.appendChild(mute);

  document.body.appendChild(overlay);
}

function makeAm() {
  return {
    settings: { masterVol: 0.8, sfxVol: 1.0, musicVol: 0.6, muted: false },
    getSettings() { return { ...this.settings }; },
    setMasterVolume: vi.fn(function (v) { this.settings.masterVol = v; }),
    setSfxVolume:    vi.fn(function (v) { this.settings.sfxVol    = v; }),
    setMusicVolume:  vi.fn(function (v) { this.settings.musicVol  = v; }),
    setMuted:        vi.fn(function (v) { this.settings.muted     = v; }),
  };
}

beforeEach(() => setupDom());

describe('SettingsOverlay', () => {
  it('open() shows overlay and initializes sliders from AudioManager', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    expect(document.getElementById('settings-overlay').style.display).toBe('flex');
    expect(document.getElementById('vol-master').value).toBe('80');
    expect(document.getElementById('vol-sfx').value).toBe('100');
    expect(document.getElementById('vol-music').value).toBe('60');
    expect(document.getElementById('mute-all').checked).toBe(false);
  });

  it('slider input updates AudioManager + displayed value', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    const input = document.getElementById('vol-master');
    input.value = '42';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(am.setMasterVolume).toHaveBeenCalledWith(0.42);
    expect(document.getElementById('vol-master-val').textContent).toBe('42');
  });

  it('mute checkbox toggles AudioManager.setMuted', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    const cb = document.getElementById('mute-all');
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    expect(am.setMuted).toHaveBeenCalledWith(true);
  });

  it('close() hides overlay and removes listeners', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    ov.close();
    expect(document.getElementById('settings-overlay').style.display).toBe('none');
    am.setMasterVolume.mockClear();
    document.getElementById('vol-master').value = '50';
    document.getElementById('vol-master').dispatchEvent(new Event('input', { bubbles: true }));
    expect(am.setMasterVolume).not.toHaveBeenCalled();
  });

  it('close-button click closes the overlay', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    document.getElementById('settings-close').click();
    expect(document.getElementById('settings-overlay').style.display).toBe('none');
  });

  it('Esc key closes the overlay', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('settings-overlay').style.display).toBe('none');
  });

  it('clicking the backdrop (overlay element itself) closes the overlay', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    const overlay = document.getElementById('settings-overlay');
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay.style.display).toBe('none');
  });

  it('clicking a slider inside the overlay does NOT close it', () => {
    const am = makeAm();
    const ov = new SettingsOverlay(am);
    ov.open();
    document.getElementById('vol-master').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('settings-overlay').style.display).toBe('flex');
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- SettingsOverlay`
Expected: import error.

- [ ] **Step 3: Create SettingsOverlay.js**

Create `src/ui/SettingsOverlay.js`:

```js
const CHANNELS = [
  { id: 'master', input: 'vol-master', val: 'vol-master-val', setter: 'setMasterVolume', key: 'masterVol' },
  { id: 'sfx',    input: 'vol-sfx',    val: 'vol-sfx-val',    setter: 'setSfxVolume',    key: 'sfxVol'    },
  { id: 'music',  input: 'vol-music',  val: 'vol-music-val',  setter: 'setMusicVolume',  key: 'musicVol'  },
];

export class SettingsOverlay {
  constructor(audioManager) {
    this._am        = audioManager;
    this._overlay   = document.getElementById('settings-overlay');
    this._closeBtn  = document.getElementById('settings-close');
    this._mute      = document.getElementById('mute-all');
    this._listeners = [];
    this._onClose   = () => this.close();
    this._onBackdrop = (e) => { if (e.target === this._overlay) this.close(); };
    this._onEsc     = (e) => { if (e.key === 'Escape') this.close(); };
  }

  open() {
    const s = this._am.getSettings();
    for (const ch of CHANNELS) {
      const input = document.getElementById(ch.input);
      const valEl = document.getElementById(ch.val);
      const pct = Math.round(s[ch.key] * 100);
      input.value         = String(pct);
      valEl.textContent   = String(pct);
      const handler = (e) => {
        const v = Number(e.target.value);
        valEl.textContent = String(v);
        this._am[ch.setter](v / 100);
      };
      input.addEventListener('input', handler);
      this._listeners.push({ el: input, evt: 'input', fn: handler });
    }
    this._mute.checked = s.muted;
    const muteHandler = (e) => this._am.setMuted(e.target.checked);
    this._mute.addEventListener('change', muteHandler);
    this._listeners.push({ el: this._mute, evt: 'change', fn: muteHandler });
    this._closeBtn.addEventListener('click', this._onClose);
    this._overlay.addEventListener('click', this._onBackdrop);
    document.addEventListener('keydown', this._onEsc);
    this._overlay.style.display = 'flex';
  }

  close() {
    for (const l of this._listeners) l.el.removeEventListener(l.evt, l.fn);
    this._listeners = [];
    this._closeBtn.removeEventListener('click', this._onClose);
    this._overlay.removeEventListener('click', this._onBackdrop);
    document.removeEventListener('keydown', this._onEsc);
    this._overlay.style.display = 'none';
  }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test -- SettingsOverlay`
Expected: 5 tests pass.

- [ ] **Step 5: Wire gear button into MapSelectScene**

Read `src/scenes/MapSelectScene.js` to find the header creation block. Locate the area that renders the stars-bar and Upgrades button (search for `upgrade-btn` or `stars-bar`). At the top of the file, add the import:

```js
import { SettingsOverlay } from '../ui/SettingsOverlay.js';
```

Find where the Upgrades button is appended to its container, and add directly after:

```js
const gearBtn = document.createElement('button');
gearBtn.id          = 'settings-gear-btn';
gearBtn.className   = 'header-btn';
gearBtn.textContent = 'GEAR';
gearBtn.title       = 'Audio settings';
gearBtn.addEventListener('click', () => {
  const am = this.game.registry.get('audio');
  if (!am) return;
  if (!this._settingsOverlay) this._settingsOverlay = new SettingsOverlay(am);
  this._settingsOverlay.open();
});
// Append gearBtn to the same container as upgrade-btn.
```

(Use a gear character `⚙` in textContent if the existing buttons use icon glyphs — match local style.)

- [ ] **Step 6: Smoke test in browser**

Run: `npm run dev`
Open Map Select → click the gear button → overlay shows → drag a slider → close. Confirm no console errors. Verify `localStorage.getItem('lastlight_save')` shows updated `settings.masterVol` after the 300 ms debounce.

- [ ] **Step 7: Commit**

```bash
git add src/ui/SettingsOverlay.js src/ui/SettingsOverlay.test.js src/scenes/MapSelectScene.js
git commit -m "feat: SettingsOverlay + MapSelectScene gear button"
```

---

## Task 8: DamageNumberOverlay

**Files:**
- Create: `src/systems/DamageNumberOverlay.js`
- Create: `src/systems/DamageNumberOverlay.test.js`

**Context:** Subscribes to `scene.events.on('damage-dealt', ...)`. Filters by threshold (crit, AoE, or >= 30 damage). Spawns from a 24-item pool of `Phaser.GameObjects.Text` objects. Drops new requests when pool exhausted.

- [ ] **Step 1: Write failing tests**

Create `src/systems/DamageNumberOverlay.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { DamageNumberOverlay } from './DamageNumberOverlay.js';

function makeText() {
  return {
    setText: vi.fn(function (s) { this.text = s; return this; }),
    setStyle: vi.fn(function () { return this; }),
    setColor: vi.fn(function () { return this; }),
    setFontSize: vi.fn(function () { return this; }),
    setOrigin: vi.fn(function () { return this; }),
    setPosition: vi.fn(function (x, y) { this.x = x; this.y = y; return this; }),
    setAlpha: vi.fn(function (a) { this.alpha = a; return this; }),
    setVisible: vi.fn(function (v) { this.visible = v; return this; }),
    setActive: vi.fn(function (a) { this.active = a; return this; }),
    setStroke: vi.fn(function () { return this; }),
    setShadow: vi.fn(function () { return this; }),
    setDepth:  vi.fn(function () { return this; }),
  };
}

function makeScene() {
  const events = { handlers: {}, on(e, fn) { this.handlers[e] = fn; }, off() {}, emit(e, p) { if (this.handlers[e]) this.handlers[e](p); } };
  const tweens = { add: vi.fn(({ onComplete }) => { if (onComplete) onComplete(); return {}; }) };
  const add = { text: vi.fn(() => makeText()) };
  return { events, tweens, add };
}

describe('DamageNumberOverlay', () => {
  it('spawns a number for a crit regardless of amount', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 100, y: 100 }, amount: 5, isCrit: true });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('spawns a number for an AoE hit regardless of amount', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 4, isAoe: true, abilityLabel: 'AIRSTRIKE' });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('spawns a number for damage >= 30', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 30 });
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('suppresses small non-crit non-AoE hits', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 8 });
    scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 29 });
    expect(scene.add.text).not.toHaveBeenCalled();
  });

  it('returns text objects to the pool after expiry (tween onComplete)', () => {
    const scene = makeScene();
    new DamageNumberOverlay(scene);
    for (let i = 0; i < 5; i++) {
      scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 50 });
    }
    expect(scene.add.text).toHaveBeenCalledTimes(1);
  });

  it('drops new spawns silently when all 24 pool slots are in flight', () => {
    const scene = makeScene();
    scene.tweens.add = vi.fn(() => ({}));
    new DamageNumberOverlay(scene);
    for (let i = 0; i < 30; i++) {
      scene.events.emit('damage-dealt', { target: { x: 0, y: 0 }, amount: 50 });
    }
    expect(scene.add.text).toHaveBeenCalledTimes(24);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- DamageNumberOverlay`
Expected: import error.

- [ ] **Step 3: Implement DamageNumberOverlay**

Create `src/systems/DamageNumberOverlay.js`:

```js
const POOL_SIZE = 24;
const THRESHOLD = 30;

const STYLES = {
  big:  { fontSize: '16px', color: '#ffffff', stroke: '#000000', strokeThickness: 2 },
  crit: { fontSize: '22px', color: '#ffcc44', stroke: '#000000', strokeThickness: 3 },
  aoe:  { fontSize: '16px', color: '#ff9966', stroke: '#000000', strokeThickness: 2 },
};

export class DamageNumberOverlay {
  constructor(scene) {
    this._scene  = scene;
    this._pool   = [];
    this._inUse  = new Set();
    this._onHit  = (p) => this._handle(p);
    scene.events.on('damage-dealt', this._onHit);
  }

  destroy() {
    this._scene.events.off('damage-dealt', this._onHit);
  }

  _handle({ target, amount, isCrit = false, isAoe = false, abilityLabel = null }) {
    if (!(isCrit || isAoe || amount >= THRESHOLD)) return;
    if (this._inUse.size >= POOL_SIZE && this._pool.length === 0) return;

    let txt;
    if (this._pool.length) {
      txt = this._pool.pop();
    } else if (this._inUse.size < POOL_SIZE) {
      txt = this._scene.add.text(0, 0, '', STYLES.big);
      txt.setOrigin(0.5, 0.5);
      txt.setDepth(100);
    } else {
      return;
    }
    this._inUse.add(txt);

    const style = isCrit ? STYLES.crit : (isAoe ? STYLES.aoe : STYLES.big);
    const label = isCrit ? `CRIT ${amount}!`
                : (abilityLabel ? `${abilityLabel} ${amount}` : String(amount));
    txt.setText(label);
    txt.setStyle(style);
    txt.setStroke(style.stroke, style.strokeThickness);
    txt.setShadow(0, 0, '#000000', 4, false, true);
    const jitterX = (Math.random() - 0.5) * 16;
    txt.setPosition(target.x + jitterX, target.y - 12);
    txt.setAlpha(0);
    txt.setVisible(true);

    this._scene.tweens.add({
      targets: txt,
      y: txt.y - 50,
      alpha: { from: 0, to: 1, duration: 100 },
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        txt.setVisible(false);
        this._inUse.delete(txt);
        this._pool.push(txt);
      },
    });

    this._scene.tweens.add({
      targets: txt,
      alpha: 0,
      duration: 400,
      delay: 800,
    });
  }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test -- DamageNumberOverlay`
Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/DamageNumberOverlay.js src/systems/DamageNumberOverlay.test.js
git commit -m "feat: DamageNumberOverlay — pooled, threshold-gated floating numbers"
```

---

## Task 9: ShakeController

**Files:**
- Create: `src/systems/ShakeController.js`
- Create: `src/systems/ShakeController.test.js`

**Context:** Pure event-to-camera-shake adapter. Subscribes to three events with hard-coded duration/intensity tuples.

- [ ] **Step 1: Write failing tests**

Create `src/systems/ShakeController.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { ShakeController } from './ShakeController.js';

function makeScene() {
  const camShake = vi.fn();
  const events = { handlers: {}, on(e, fn) { this.handlers[e] = fn; }, off() {}, emit(e, p) { if (this.handlers[e]) this.handlers[e](p); } };
  return { events, cameras: { main: { shake: camShake } }, _shake: camShake };
}

describe('ShakeController', () => {
  it('boss-died triggers 600ms heavy shake', () => {
    const scene = makeScene();
    new ShakeController(scene);
    scene.events.emit('boss-died', { bossType: 'titan' });
    expect(scene._shake).toHaveBeenCalledWith(600, 0.020);
  });

  it('airstrike-impact triggers 250ms medium shake', () => {
    const scene = makeScene();
    new ShakeController(scene);
    scene.events.emit('airstrike-impact', { x: 100, y: 100 });
    expect(scene._shake).toHaveBeenCalledWith(250, 0.012);
  });

  it('emp-pulse triggers 200ms low-frequency rumble', () => {
    const scene = makeScene();
    new ShakeController(scene);
    scene.events.emit('emp-pulse', { x: 0, y: 0, radius: 80 });
    expect(scene._shake).toHaveBeenCalledWith(200, 0.008);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- ShakeController`
Expected: import error.

- [ ] **Step 3: Implement ShakeController**

Create `src/systems/ShakeController.js`:

```js
const SHAKES = {
  'boss-died':        { duration: 600, intensity: 0.020 },
  'airstrike-impact': { duration: 250, intensity: 0.012 },
  'emp-pulse':        { duration: 200, intensity: 0.008 },
};

export class ShakeController {
  constructor(scene) {
    this._scene = scene;
    this._handlers = {};
    for (const [evt, cfg] of Object.entries(SHAKES)) {
      const fn = () => scene.cameras.main.shake(cfg.duration, cfg.intensity);
      scene.events.on(evt, fn);
      this._handlers[evt] = fn;
    }
  }

  destroy() {
    for (const [evt, fn] of Object.entries(this._handlers)) {
      this._scene.events.off(evt, fn);
    }
  }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test -- ShakeController`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/ShakeController.js src/systems/ShakeController.test.js
git commit -m "feat: ShakeController — boss-died/airstrike/EMP camera shakes"
```

---

## Task 10: ParticleSpawner

**Files:**
- Create: `src/systems/ParticleSpawner.js`
- Create: `src/systems/ParticleSpawner.test.js`

**Context:** Helpers for muzzle flash, projectile trail, and hero ability VFX. Tested at the API level — verify the correct Phaser emitter calls happen with the right tints.

- [ ] **Step 1: Write failing tests**

Create `src/systems/ParticleSpawner.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Geom: { Circle: class { constructor(x, y, r) { this.x = x; this.y = y; this.r = r; } } } } }));

import { ParticleSpawner, MUZZLE_TINTS } from './ParticleSpawner.js';

function makeScene() {
  const created = [];
  const emitter = {
    config: null,
    explode: vi.fn(),
    stop: vi.fn(),
    startFollow: vi.fn(),
    destroy: vi.fn(),
  };
  const graphic = {
    lineStyle:    vi.fn(function () { return this; }),
    strokeCircle: vi.fn(function () { return this; }),
    setPosition:  vi.fn(function () { return this; }),
    setDepth:     vi.fn(function () { return this; }),
    destroy:      vi.fn(),
  };
  return {
    _emitter: emitter,
    _created: created,
    _graphic: graphic,
    add: {
      particles: vi.fn((x, y, key, config) => {
        emitter.config = config;
        created.push({ x, y, key, config });
        return emitter;
      }),
      graphics: vi.fn(() => graphic),
    },
    tweens: { add: vi.fn() },
    time:   { delayedCall: vi.fn((ms, cb) => cb()) },
  };
}

describe('ParticleSpawner', () => {
  it('spawnMuzzleFlash creates an emitter at tower position with type-correct tint', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    sp.spawnMuzzleFlash(120, 80, 'cannon');
    expect(scene.add.particles).toHaveBeenCalled();
    const call = scene._created[0];
    expect(call.x).toBe(120); expect(call.y).toBe(80);
    expect(call.config.tint).toBe(MUZZLE_TINTS.cannon);
  });

  it('spawnMuzzleFlash falls back to white for unknown tower types', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    sp.spawnMuzzleFlash(0, 0, 'unknown-type');
    expect(scene._created[0].config.tint).toBe(MUZZLE_TINTS.default);
  });

  it('spawnProjectileTrail starts an emitter following the projectile', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    const projectile = { x: 0, y: 0 };
    const trail = sp.spawnProjectileTrail(projectile, 'rocket');
    expect(scene._emitter.startFollow).toHaveBeenCalledWith(projectile);
    expect(trail).toBe(scene._emitter);
  });

  it('spawnHeroAbilityVFX dispatches by ability name', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    sp.spawnHeroAbilityVFX('airstrike', 50, 50, 60);
    sp.spawnHeroAbilityVFX('emp',       50, 50, 80);
    sp.spawnHeroAbilityVFX('overcharge', 50, 50, 0);
    expect(scene.add.particles).toHaveBeenCalledTimes(3);
  });

  it('airstrike VFX also spawns an expanding 60px orange ring', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    sp.spawnHeroAbilityVFX('airstrike', 50, 50, 60);
    expect(scene.add.graphics).toHaveBeenCalledTimes(1);
    expect(scene._graphic.lineStyle).toHaveBeenCalledWith(3, 0xff6633, 1);
    const tween = scene.tweens.add.mock.calls[0][0];
    expect(tween.scale).toEqual({ from: 0, to: 60 });
    expect(tween.duration).toBe(400);
  });

  it('emp VFX also spawns an expanding blue ring sized to the passed radius', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    sp.spawnHeroAbilityVFX('emp', 30, 30, 100);
    expect(scene.add.graphics).toHaveBeenCalledTimes(1);
    expect(scene._graphic.lineStyle).toHaveBeenCalledWith(3, 0x66ccff, 1);
    const tween = scene.tweens.add.mock.calls[0][0];
    expect(tween.scale).toEqual({ from: 0, to: 100 });
    expect(tween.duration).toBe(600);
  });

  it('overcharge VFX does NOT spawn a ring graphic', () => {
    const scene = makeScene();
    const sp = new ParticleSpawner(scene);
    sp.spawnHeroAbilityVFX('overcharge', 50, 50, 0);
    expect(scene.add.graphics).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- ParticleSpawner`
Expected: import error.

- [ ] **Step 3: Implement ParticleSpawner**

Create `src/systems/ParticleSpawner.js`:

```js
import Phaser from 'phaser';

export const MUZZLE_TINTS = {
  default:    0xffffff,
  machinegun: 0xffffff,
  sniper:     0xffffff,
  cannon:     0xffdd66,
  laser:      0x66ccff,
  rocket:     0xff8844,
  barracks:   0xffffff,
};

const TRAIL_CONFIG = {
  default: { lifespan: 250, scale: { start: 0.4, end: 0 }, alpha: { start: 1,   end: 0 }, frequency: 16, tint: 0xffffff },
  rocket:  { lifespan: 250, scale: { start: 0.6, end: 0 }, alpha: { start: 0.8, end: 0 }, frequency: 24, tint: 0xaaaaaa },
  laser:   { lifespan: 250, scale: { start: 0.5, end: 0 }, alpha: { start: 1,   end: 0 }, frequency: 12, tint: 0x66ccff },
};

export class ParticleSpawner {
  constructor(scene) {
    this._scene = scene;
  }

  spawnMuzzleFlash(x, y, towerType) {
    const tint = MUZZLE_TINTS[towerType] ?? MUZZLE_TINTS.default;
    const config = {
      tint,
      lifespan: 80,
      speed: { min: 40, max: 80 },
      scale: { start: 0.6, end: 0 },
      quantity: 3,
      angle: { min: 0, max: 360 },
      blendMode: 'ADD',
    };
    const emitter = this._scene.add.particles(x, y, 'spark', config);
    if (emitter.explode) emitter.explode(3, x, y);
    this._scene.time.delayedCall(150, () => emitter.destroy && emitter.destroy());
    return emitter;
  }

  spawnProjectileTrail(projectile, towerType) {
    const config = TRAIL_CONFIG[towerType] ?? TRAIL_CONFIG.default;
    const emitter = this._scene.add.particles(projectile.x, projectile.y, 'spark', config);
    if (emitter.startFollow) emitter.startFollow(projectile);
    return emitter;
  }

  spawnHeroAbilityVFX(ability, x, y, radius) {
    if (ability === 'airstrike') {
      const e = this._scene.add.particles(x, y, 'spark', {
        tint: 0xff6633, lifespan: 400, speed: { min: 60, max: 180 },
        scale: { start: 1.0, end: 0 }, quantity: 30, blendMode: 'ADD',
        angle: { min: 0, max: 360 },
      });
      if (e.explode) e.explode(30, x, y);
      this._scene.time.delayedCall(500, () => e.destroy && e.destroy());
      this.spawnAirstrikeRing(x, y);
      return e;
    }
    if (ability === 'emp') {
      const e = this._scene.add.particles(x, y, 'spark', {
        tint: 0x66ccff, lifespan: 600, speed: { min: 80, max: 200 },
        scale: { start: 0.5, end: 0 }, quantity: 20, blendMode: 'ADD',
        angle: { min: 0, max: 360 },
      });
      if (e.explode) e.explode(20, x, y);
      this._scene.time.delayedCall(700, () => e.destroy && e.destroy());
      this.spawnEMPRing(x, y, radius);
      return e;
    }
    if (ability === 'overcharge') {
      const e = this._scene.add.particles(x, y, 'spark', {
        tint: 0xffcc44, lifespan: 6000, speed: { min: 20, max: 40 },
        scale: { start: 0.4, end: 0 }, frequency: 125, blendMode: 'ADD',
        emitZone: { type: 'edge', source: new Phaser.Geom.Circle(0, 0, 24), quantity: 8 },
      });
      this._scene.time.delayedCall(6000, () => e.destroy && e.destroy());
      return e;
    }
  }

  // Expanding 60-px orange ring graphic — pairs with airstrike particle burst.
  spawnAirstrikeRing(x, y) {
    const ring = this._scene.add.graphics();
    ring.lineStyle(3, 0xff6633, 1);
    ring.strokeCircle(0, 0, 1);
    ring.setPosition(x, y);
    ring.setDepth(15);
    this._scene.tweens.add({
      targets: ring,
      scale: { from: 0, to: 60 },
      alpha: { from: 1, to: 0 },
      duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy && ring.destroy(),
    });
    return ring;
  }

  // Expanding blue ring graphic sized to the EMP radius — pairs with EMP particle ring.
  spawnEMPRing(x, y, radius) {
    const ring = this._scene.add.graphics();
    ring.lineStyle(3, 0x66ccff, 1);
    ring.strokeCircle(0, 0, 1);
    ring.setPosition(x, y);
    ring.setDepth(15);
    this._scene.tweens.add({
      targets: ring,
      scale: { from: 0, to: radius },
      alpha: { from: 1, to: 0 },
      duration: 600,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy && ring.destroy(),
    });
    return ring;
  }
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npm test -- ParticleSpawner`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/ParticleSpawner.js src/systems/ParticleSpawner.test.js
git commit -m "feat: ParticleSpawner — muzzle flash, trails, hero ability VFX"
```

---

## Task 11: Wire SFX, particles, and events into the real call sites

**Files:**
- Modify: `src/entities/Enemy.js`
- Modify: `src/entities/Hero.js`
- Modify: `src/entities/Projectile.js`
- Modify: `src/scenes/GameScene.js`

**Context — important deviation from the spec:** the original spec assumed methods that **do not exist** in this codebase — `Tower.fire()`, `Enemy.die()`, `Hero.die()`, and `Hero.useAbility()`. The actual code surface is:

- Tower firing lives in `GameScene._updateTowers` ([src/scenes/GameScene.js:343–365](src/scenes/GameScene.js#L343-L365)) — projectile is created there, not in any `Tower.fire()`.
- Enemy death is inline in `Enemy.takeDamage` ([src/entities/Enemy.js:51–56](src/entities/Enemy.js#L51-L56)) — `if (this.hp <= 0) { this.hp = 0; this.dead = true; }`. No `die()` method.
- Hero death is inline in `Hero.takeDamage` ([src/entities/Hero.js:70–80](src/entities/Hero.js#L70-L80)).
- Hero abilities are dispatched from `GameScene._onAbility` ([line 288](src/scenes/GameScene.js#L288)), `GameScene._triggerAirstrike` ([line 305](src/scenes/GameScene.js#L305)), and the overcharge-flip detector in `GameScene._updateHero` ([lines 266–269](src/scenes/GameScene.js#L266-L269)) / `GameScene._applyOvercharge` ([line 328](src/scenes/GameScene.js#L328)). The Hero class itself exposes `overcharge()`, `airstrike(x,y)`, and `empPulse()` — none of them are the actual call point for VFX/SFX.

So all SFX/VFX wiring is centred on `GameScene`, with minimal small additions to entities for things that genuinely live there (Enemy hit/death, Hero death/respawn/auto-attack, Projectile trail).

Lookups: `scene.game.registry.get('audio')` (Task 5 registered) and `scene.particles` (Task 12 assigns a `ParticleSpawner` instance to the scene). All access is guarded with `if (am)` / `if (scene.particles)` so unit tests that don't stub them stay green.

### Enemy.takeDamage — accept opts, emit `damage-dealt`, play hit SFX, fire death events

- [ ] **Step 1: Replace `Enemy.takeDamage`**

In `src/entities/Enemy.js`, replace the current `takeDamage` (lines 51–56):

```js
  takeDamage(amount, pierce = false) {
    const armor = pierce ? 0 : this.armor;
    this.hp -= Math.max(1, amount - armor);
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    this._redrawHpBar();
  }
```

with a version that accepts an `opts` bag (back-compat: `pierce` as second arg still works because it is `Boolean()`-coerced):

```js
  takeDamage(amount, opts = false) {
    // Back-compat: callers used to pass `pierce` as a bare boolean.
    const optsObj = (opts && typeof opts === 'object') ? opts : { pierce: Boolean(opts) };
    const armor = optsObj.pierce ? 0 : this.armor;
    const dmg   = Math.max(1, amount - armor);
    this.hp -= dmg;
    const justDied = this.hp <= 0 && !this.dead;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    this._redrawHpBar();

    const am = this.scene.game?.registry?.get('audio');
    if (am) am.playSfx('enemy-hit', { detune: (Math.random() - 0.5) * 100 });
    this.scene.events.emit('damage-dealt', {
      target: this,
      amount: dmg,
      isCrit: optsObj.isCrit ?? false,
      isAoe:  optsObj.isAoe  ?? false,
      abilityLabel: optsObj.abilityLabel ?? null,
    });

    if (justDied) {
      const t = this.def?.type;
      const isLarge = t === 'brute' || t === 'titan';
      if (am) am.playSfx(isLarge ? 'enemy-death-large' : 'enemy-death-small');
      if (t === 'titan') this.scene.events.emit('boss-died', { bossType: t });
    }
  }
```

(Verified `titan` is the boss enemy type in `src/data/enemies.js`. `def.boss` is not used in the codebase.)

### Hero — death SFX, respawn SFX, auto-attack SFX

- [ ] **Step 2: `Hero.takeDamage` plays `hero-death` when hp hits 0**

In `src/entities/Hero.js`, in `takeDamage` (lines 70–80), replace:

```js
    if (this.hp <= 0) {
      this.dead         = true;
      this.respawnTimer = this._respawnTime;
      this._body.setVisible(false);
      this._hpBar.clear();
    }
```

with:

```js
    if (this.hp <= 0) {
      this.dead         = true;
      this.respawnTimer = this._respawnTime;
      this._body.setVisible(false);
      this._hpBar.clear();
      const am = this.scene.game?.registry?.get('audio');
      if (am) am.playSfx('hero-death');
    }
```

(Assumes `_respawnTime` was added in plan Task 5's Hero modifier work from Phase 7. Verify the field name in current Hero.js; replace with `RESPAWN_TIME` if `_respawnTime` is not present.)

- [ ] **Step 3: `Hero.respawn` plays `hero-respawn`**

In `src/entities/Hero.js`, in `respawn()` (line 82), add at the end of the method (after `this._redrawHpBar();`):

```js
    const am = this.scene.game?.registry?.get('audio');
    if (am) am.playSfx('hero-respawn');
```

- [ ] **Step 4: Hero auto-attack plays `hero-attack` on each swing**

In `src/entities/Hero.js`, in `update()` (around line 160), the auto-attack block reads:

```js
      if (nearest) {
        nearest.takeDamage(ATTACK_DAMAGE, false);
        if (nearest.dead) this._registerKill();
        this._attackTimer = 1 / ATTACK_RATE;
      }
```

Replace it with:

```js
      if (nearest) {
        nearest.takeDamage(ATTACK_DAMAGE);
        if (nearest.dead) this._registerKill();
        const am = this.scene.game?.registry?.get('audio');
        if (am) am.playSfx('hero-attack');
        this._attackTimer = 1 / ATTACK_RATE;
      }
```

(The `, false` second arg is removed — the new Enemy.takeDamage signature handles it via back-compat, but the cleaner call is no second arg.)

### Projectile — accept `towerType`, spawn trail in constructor, expose `destroyEntity`

`Projectile` extends `Phaser.GameObjects.Container`, which already has a `destroy()` method we should not shadow naively (Container destroy is invoked by Phaser internals). We add a custom cleanup method.

- [ ] **Step 5: Projectile constructor accepts `towerType` and starts a trail**

In `src/entities/Projectile.js`, replace the constructor signature:

```js
  constructor(scene, { x, y, target, damage, splashRadius = 0, pierce = false, slowFactor = 0, color = 0xffffff }) {
```

with:

```js
  constructor(scene, { x, y, target, damage, splashRadius = 0, pierce = false, slowFactor = 0, color = 0xffffff, towerType = 'default' }) {
```

At the **end** of the constructor, after `this.setDepth(4);`, add:

```js
    this.towerType = towerType;
    this._trail = null;
    if (scene.particles) {
      this._trail = scene.particles.spawnProjectileTrail(this, towerType);
    }
```

- [ ] **Step 6: Projectile.destroyTrail cleans up the emitter**

In `src/entities/Projectile.js`, add a new method to the class:

```js
  destroyTrail() {
    if (this._trail && this._trail.destroy) {
      this._trail.destroy();
      this._trail = null;
    }
  }
```

### GameScene — opts on `_dealDamage`, muzzle flash + SFX on tower fire, ability VFX/SFX, projectile trail cleanup

- [ ] **Step 7: `_dealDamage` accepts and forwards opts**

In `src/scenes/GameScene.js`, `_dealDamage` (line 404) currently is:

```js
  _dealDamage(enemy, damage, pierce) {
    enemy.takeDamage(damage, pierce);
```

Change to:

```js
  _dealDamage(enemy, damage, pierce, opts = {}) {
    enemy.takeDamage(damage, { pierce, ...opts });
```

(The rest of the method — reward + particles on death — stays unchanged.)

- [ ] **Step 8: `_updateTowers` plays tower-fire SFX + muzzle flash, passes `towerType` to Projectile**

In `src/scenes/GameScene.js`, `_updateTowers` (line 343) currently constructs the Projectile like this:

```js
      if (best) {
        this.projectiles.push(new Projectile(this, {
          x: tower.x, y: tower.y, target: best,
          damage: tower.damage, splashRadius: tower.splashRadius,
          pierce: tower.pierce, slowFactor: tower.slow,
          color: PROJ_COLORS[tower.type] ?? 0xffffff,
        }));
        tower.cooldown = 1 / tower.fireRate;
      }
```

Replace with:

```js
      if (best) {
        const am = this.game.registry.get('audio');
        if (am) am.playSfx(`tower-fire-${tower.type}`);
        if (this.particles) this.particles.spawnMuzzleFlash(tower.x, tower.y, tower.type);
        this.projectiles.push(new Projectile(this, {
          x: tower.x, y: tower.y, target: best,
          damage: tower.damage, splashRadius: tower.splashRadius,
          pierce: tower.pierce, slowFactor: tower.slow,
          color: PROJ_COLORS[tower.type] ?? 0xffffff,
          towerType: tower.type,
        }));
        tower.cooldown = 1 / tower.fireRate;
      }
```

- [ ] **Step 9: `_updateProjectiles` destroys trails on dead projectiles**

In `src/scenes/GameScene.js`, `_updateProjectiles` (line 369) ends with:

```js
    this.projectiles = this.projectiles.filter(p => !p.dead);
```

Replace that single line with:

```js
    for (const p of this.projectiles) {
      if (p.dead && p.destroyTrail) p.destroyTrail();
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);
```

- [ ] **Step 10: `_applyOvercharge(true)` plays SFX + spawns per-tower VFX**

In `src/scenes/GameScene.js`, `_applyOvercharge` (line 328) currently is:

```js
  _applyOvercharge(active) {
    for (const tower of this.placementManager.getTowers()) {
      if (!tower.fireRate) continue;
      if (active) {
        tower._baseFireRate = tower.fireRate;
        tower.fireRate = tower.fireRate * 1.5;
      } else if (tower._baseFireRate !== undefined) {
        tower.fireRate = tower._baseFireRate;
        delete tower._baseFireRate;
      }
    }
  }
```

Replace with:

```js
  _applyOvercharge(active) {
    if (active) {
      const am = this.game.registry.get('audio');
      if (am) am.playSfx('hero-overcharge');
    }
    for (const tower of this.placementManager.getTowers()) {
      if (!tower.fireRate) continue;
      if (active) {
        tower._baseFireRate = tower.fireRate;
        tower.fireRate = tower.fireRate * 1.5;
        if (this.particles) this.particles.spawnHeroAbilityVFX('overcharge', tower.x, tower.y, 0);
      } else if (tower._baseFireRate !== undefined) {
        tower.fireRate = tower._baseFireRate;
        delete tower._baseFireRate;
      }
    }
  }
```

- [ ] **Step 11: `_triggerAirstrike` plays SFX, spawns VFX, emits shake event, threads `{isAoe, abilityLabel}`**

In `src/scenes/GameScene.js`, `_triggerAirstrike` (line 305) currently is:

```js
  _triggerAirstrike(x, y) {
    const result = this.hero.airstrike(x, y);
    if (!result) { this.aimMode = false; this.game.events.emit('hero:aim-cancel'); return; }
    for (const e of this.enemies) {
      if (Math.hypot(e.x - x, e.y - y) <= result.radius) {
        this._dealDamage(e, result.damage, true);
      }
    }
    // Particle burst at impact point
    this._addParticle(x, y, 0xff6400, 18);
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      this._addParticle(
        x + Math.cos(angle) * 28,
        y + Math.sin(angle) * 28,
        0xff8800,
        8
      );
    }
    this.aimMode = false;
    this.game.events.emit('hero:aim-cancel');
  }
```

Replace with:

```js
  _triggerAirstrike(x, y) {
    const result = this.hero.airstrike(x, y);
    if (!result) { this.aimMode = false; this.game.events.emit('hero:aim-cancel'); return; }

    const am = this.game.registry.get('audio');
    if (am) am.playSfx('hero-airstrike');
    if (this.particles) this.particles.spawnHeroAbilityVFX('airstrike', x, y, result.radius);
    this.events.emit('airstrike-impact', { x, y });

    for (const e of this.enemies) {
      if (Math.hypot(e.x - x, e.y - y) <= result.radius) {
        this._dealDamage(e, result.damage, true, { isAoe: true, abilityLabel: 'AIRSTRIKE' });
      }
    }
    // Particle burst at impact point (existing placeholder — kept as in-game additional flair)
    this._addParticle(x, y, 0xff6400, 18);
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      this._addParticle(
        x + Math.cos(angle) * 28,
        y + Math.sin(angle) * 28,
        0xff8800,
        8
      );
    }
    this.aimMode = false;
    this.game.events.emit('hero:aim-cancel');
  }
```

- [ ] **Step 12: `_onAbility` case 'e' plays EMP SFX, spawns VFX, emits shake event**

In `src/scenes/GameScene.js`, `_onAbility` (line 288), case `'e'` currently is:

```js
      case 'e':
        if (this.hero.level < 3 || !this.hero.empPulse()) break;
        for (const e of this.enemies) e.applyStatus({ type: 'stun', duration: 3 });
        break;
```

Replace with:

```js
      case 'e': {
        if (this.hero.level < 3 || !this.hero.empPulse()) break;
        for (const e of this.enemies) e.applyStatus({ type: 'stun', duration: 3 });
        const EMP_RADIUS = 120;
        const am = this.game.registry.get('audio');
        if (am) am.playSfx('hero-emp');
        if (this.particles) this.particles.spawnHeroAbilityVFX('emp', this.hero.x, this.hero.y, EMP_RADIUS);
        this.events.emit('emp-pulse', { x: this.hero.x, y: this.hero.y, radius: EMP_RADIUS });
        break;
      }
```

(EMP is currently a global stun in this game — there is no spatial radius. `EMP_RADIUS = 120` is chosen solely for the visual ring + shake event payload.)

- [ ] **Step 13: Run the full test suite**

Run: `npm test`
Expected: all existing tests still pass. Most existing test scenes don't stub `game.registry` or `scene.particles`; the `if (am)` / `if (scene.particles)` guards and the optional-chained registry lookup (`scene.game?.registry?.get('audio')`) keep them no-op. The `damage-dealt` event is emitted on every `Enemy.takeDamage` — existing tests that don't subscribe will ignore it.

If any existing test fails because it does not provide `scene.events`, add a minimal stub:

```js
events: { emit: () => {}, on: () => {}, off: () => {} },
game:   { registry: { get: () => null } },
```

- [ ] **Step 14: Commit**

```bash
git add src/entities/Enemy.js src/entities/Hero.js src/entities/Projectile.js src/scenes/GameScene.js
git commit -m "feat: wire SFX/VFX/events into the real Enemy/Hero/Projectile/GameScene call sites"
```

---

## Task 12: GameScene wiring

**Files:**
- Modify: `src/scenes/GameScene.js`

**Context:** GameScene must instantiate the polish systems, track enemy count on the path for combat-music transitions, and start/stop music on scene create/shutdown. Re-uses existing AudioManager from registry (built in Task 5).

- [ ] **Step 1: Mount polish systems in create()**

Open `src/scenes/GameScene.js`. Add imports at the top:

```js
import { DamageNumberOverlay } from '../systems/DamageNumberOverlay.js';
import { ShakeController }    from '../systems/ShakeController.js';
import { ParticleSpawner }    from '../systems/ParticleSpawner.js';
```

In `create()`, after the scene is set up but before enemies spawn:

```js
    const am = this.game.registry.get('audio');
    if (am) am.playMusic(this.mapId ?? 0);

    this.damageNumbers  = new DamageNumberOverlay(this);
    this.shakeCtl       = new ShakeController(this);
    this.particles      = new ParticleSpawner(this);
    this._enemiesOnPath = 0;
```

- [ ] **Step 2: Track enemy-on-path 0<->1 boundary**

Find where enemies are spawned (search for `new Enemy(` in GameScene). On every spawn, add:

```js
    this._enemiesOnPath++;
    if (this._enemiesOnPath === 1) {
      const am = this.game.registry.get('audio');
      if (am) am.setCombatActive(true);
    }
```

Find where enemies are removed (death or leak — search for `enemy.die`, `_removeEnemy`, or the loop that filters dead enemies). On every removal, add:

```js
    this._enemiesOnPath = Math.max(0, this._enemiesOnPath - 1);
    if (this._enemiesOnPath === 0) {
      const am = this.game.registry.get('audio');
      if (am) am.setCombatActive(false);
    }
```

(If the codebase has a single `removeEnemy()` method, put both calls there. Otherwise wrap both death and leak paths.)

- [ ] **Step 3: Wire wave/victory/defeat/life-lost SFX**

Add each line at the exact site below:

- In `_startWave` ([src/scenes/GameScene.js:167](src/scenes/GameScene.js#L167)) — at the start of the method, before the `if (this.waveMgr.active) return;` guard, add:

```js
    const am = this.game.registry.get('audio');
    if (am) am.playSfx('wave-start');
```

- In `_onVictory` ([line 706](src/scenes/GameScene.js#L706)) — as the first statement of the method body, before `this.won = true;`, add:

```js
    const am = this.game.registry.get('audio');
    if (am) am.playSfx('victory');
```

- In `_onDefeat` ([line 728](src/scenes/GameScene.js#L728)) — as the first statement, before `this.over = true;`, add:

```js
    const am = this.game.registry.get('audio');
    if (am) am.playSfx('defeat');
```

- Life-lost: `EconomyManager.loseLife()` is what decrements lives ([src/systems/EconomyManager.js:20](src/systems/EconomyManager.js#L20)). In `GameScene._updateEnemies` at line 229 (`this.economy.loseLife();` when an enemy reaches the end of the path), wrap it:

```js
        const am = this.game.registry.get('audio');
        if (am) am.playSfx('life-lost');
        this.economy.loseLife();
```

- [ ] **Step 4: Boss-music trigger on Map 5 / Map 10**

Spec §3 calls for boss music on Maps 5 and 10. The spec wanted a `CutsceneScene` to do this, but no such scene exists. Trigger it inline on first boss enemy spawn instead.

In `create()`, after `this._enemiesOnPath = 0;` (added in Step 1), add:

```js
    this._bossMusicTriggered = false;
```

In `_spawnEnemy` ([src/scenes/GameScene.js:173](src/scenes/GameScene.js#L173)), the current method is:

```js
  _spawnEnemy({ def, scaleFactor }) {
    const start = this.pathMgr.path[0];
    this.enemies.push(new Enemy(this, { def, scaleFactor, startX: start.x, startY: start.y }));
  }
```

Replace with:

```js
  _spawnEnemy({ def, scaleFactor }) {
    const start = this.pathMgr.path[0];
    this.enemies.push(new Enemy(this, { def, scaleFactor, startX: start.x, startY: start.y }));

    if (!this._bossMusicTriggered && def.type === 'titan'
        && (this.mapId === 4 || this.mapId === 9)) {
      const am = this.game.registry.get('audio');
      const theme = this.mapId === 4 ? 'boss-mid' : 'boss-final';
      if (am) am.playMusic(theme);
      this._bossMusicTriggered = true;
    }
  }
```

(`mapId === 4` is zero-indexed Map 5; `mapId === 9` is Map 10. `titan` is the boss enemy type in `src/data/enemies.js`, first appearing on Map 5 per `MAP_WAVES`.)

- [ ] **Step 5: Stop music in shutdown()**

Find the `shutdown()` handler (registered via `this.events.on('shutdown', ...)` — see [project_phaser_lifecycle memory](../../../.claude/projects/-Users-keithtimko-projects-tower-defense/memory/project_phaser_lifecycle.md)). Add:

```js
    const am = this.game.registry.get('audio');
    if (am) am.stopMusic(500);
    if (this.damageNumbers) this.damageNumbers.destroy();
    if (this.shakeCtl)      this.shakeCtl.destroy();
```

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Smoke-test in browser**

Run: `npm run dev`. Open Map 1. Without real audio files, you will see 404s in the console — expected. Confirm:
- No JS errors
- Crit-or-≥30 damage events spawn floating numbers (use airstrike to test)
- Boss-died event fires shake (Map 5 boss)
- Hero ability particles render (orange airstrike ring, blue EMP ring)
- On Map 5, when the first titan spawns, music swaps to `boss-mid` (you'll see the request for `audio/music/boss-mid.mp3`)

- [ ] **Step 8: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat: GameScene mounts polish systems + music state + boss-theme trigger"
```

---

## Task 13: Curate and commit CC0 audio assets

**Files:**
- Create: `public/audio/sfx/*.mp3` (18 files)
- Create: `public/audio/music/*.mp3` (22 files)
- Create: `public/audio/ATTRIBUTIONS.md`

**Context:** Hand-curate from CC0 sources. Asset budget ~5 MB. SFX are short shots from [Kenney audio packs](https://kenney.nl/assets/category:Audio); music is CC0 ambient/electronic loops from freesound.org.

- [ ] **Step 1: Create directories**

```bash
mkdir -p public/audio/sfx public/audio/music
```

- [ ] **Step 2: Source SFX**

Download from Kenney Sci-Fi Sounds, Kenney Impact Sounds, and Kenney UI Audio. For each of the 18 keys in `SFX_KEYS` (defined in `AudioManager.js`), pick a fitting file and convert to mono MP3 at 96 kbps:

| File | Suggested source |
|---|---|
| `tower-fire-machinegun.mp3` | Kenney Sci-Fi laserSmall/laserLarge variant |
| `tower-fire-cannon.mp3` | Kenney Impact Sounds — heavy thud |
| `tower-fire-sniper.mp3` | Kenney Sci-Fi laser long |
| `tower-fire-laser.mp3` | Kenney Sci-Fi laser whoosh |
| `tower-fire-rocket.mp3` | Kenney Sci-Fi explosion-medium prefix |
| `tower-fire-barracks.mp3` | Kenney Impact Sounds — light thud |
| `tower-place.mp3` | Kenney UI Audio — confirmation chime |
| `tower-upgrade.mp3` | Kenney UI Audio — upgrade ding |
| `tower-sell.mp3` | Kenney UI Audio — coin/cancel |
| `enemy-hit.mp3` | Kenney Impact Sounds — short impact |
| `enemy-death-small.mp3` | Kenney Sci-Fi explosion-small |
| `enemy-death-large.mp3` | Kenney Sci-Fi explosion-large |
| `hero-attack.mp3` | Reuse `enemy-hit.mp3` (copy as separate file) |
| `hero-death.mp3` | Reuse `enemy-death-large.mp3` |
| `hero-respawn.mp3` | Reuse `tower-upgrade.mp3` |
| `hero-overcharge.mp3` | Kenney Sci-Fi powerUp |
| `hero-airstrike.mp3` | Kenney Sci-Fi explosion-huge |
| `hero-emp.mp3` | Kenney Sci-Fi laserShock |
| `wave-start.mp3` | Kenney UI Audio — alert |
| `life-lost.mp3` | Reuse `enemy-death-small.mp3` or use a low alarm |
| `victory.mp3` | Kenney UI Audio — jingle |
| `defeat.mp3` | Kenney UI Audio — error |
| `ui-click.mp3` | Kenney UI Audio — short click |

Convert with ffmpeg:

```bash
for f in *.wav; do
  ffmpeg -i "$f" -ac 1 -b:a 96k "public/audio/sfx/${f%.wav}.mp3"
done
```

Target <= 10 KB each.

- [ ] **Step 3: Source music**

For each of 10 maps, find a CC0 ambient electronic/sci-fi loop on freesound.org. Pair each with a more intense "combat" version (same key + tempo). For boss themes, pick two unique CC0 tracks. Convert to 96 kbps mono MP3 with loop-friendly trimming:

```bash
ffmpeg -i source.flac -ac 1 -b:a 96k -t 60 public/audio/music/map-0-ambient.mp3
```

Target <= 200 KB each (<= 250 KB for boss themes).

- [ ] **Step 4: Write ATTRIBUTIONS.md**

Create `public/audio/ATTRIBUTIONS.md`:

```markdown
# Audio Asset Attributions

All audio assets in this directory are licensed CC0 (public domain). Attribution
is not legally required but is listed here for traceability.

## SFX (`public/audio/sfx/`)

| File | Source | License |
|---|---|---|
| tower-fire-machinegun.mp3 | Kenney Sci-Fi Sounds | CC0 |
| tower-fire-cannon.mp3 | Kenney Impact Sounds | CC0 |
| ... | ... | ... |

## Music (`public/audio/music/`)

| File | Source URL | License |
|---|---|---|
| map-0-ambient.mp3 | https://freesound.org/people/... | CC0 |
| ... | ... | ... |

If you add CC-BY assets in the future, update this file with required attribution text.
```

Fill in the actual sources used.

- [ ] **Step 5: Verify total size**

Run: `du -sh public/audio/`
Expected: <= 5 MB.

If over, drop bitrate to 64 kbps for music tracks or shorten loops.

- [ ] **Step 6: Smoke test in browser**

Run: `npm run dev`. Play Map 1. Confirm tower fire, hit, death, wave-start, victory SFX audible. Open settings, drag music slider, confirm music volume changes live. Visit Map 5, confirm boss intro plays boss-mid theme.

- [ ] **Step 7: Commit**

```bash
git add public/audio/
git commit -m "assets: CC0 SFX + two-layer music for 10 maps + 2 boss themes"
```

---

## Task 14: Remove unused howler dep; final verification

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `.claude/notes.md`

**Context:** `howler` is in `package.json` but unused — drop it. Then run the full manual verification list from the spec.

- [ ] **Step 1: Remove howler**

```bash
npm uninstall howler
```

Confirm:

```bash
grep -n howler package.json && echo "STILL THERE" || echo "removed"
```

- [ ] **Step 2: Run full test suite + build**

Run: `npm test`
Expected: all green (count should be ~195+).

Run: `npm run build`
Expected: build succeeds with no errors. Audio file 404s should be gone.

- [ ] **Step 3: Manual browser verification (spec §8)**

Run: `npm run dev`. Walk through every item from spec §8:

1. Play Map 1 — tower fire/hit/death/wave-start SFX audible
2. Open settings → drag each slider → confirm immediate volume change → close/reopen → confirm persistence → toggle mute → confirm silence then restore
3. Reload page → confirm settings persisted (check `localStorage.getItem('lastlight_save')` shows v2 envelope with settings block)
4. Play Map 5 — boss intro replaces music with `boss-mid` → boss death = heavy screen shake + `enemy-death-large` SFX
5. Play Map 10 — boss-final theme; victory SFX
6. Hero Q (overcharge — gold sparkle, no shake), W (airstrike — orange burst + 250ms shake + `AIRSTRIKE 80` damage number), E (EMP — blue ripple + 200ms shake)
7. Floating damage numbers — only crits/AoE/hits >= 30 produce numbers; no spam on wave 10 of Map 10
8. Migration test (in browser devtools):

```js
localStorage.setItem('lastlight_save', JSON.stringify({
  version: 1, maps: [3,2,0,0,0,0,0,0,0,0], upgrades: [],
  stats: { kills: 0, gamesPlayed: 0, victories: 0, defeats: 0, bestWave: 0 }
}));
```

Reload → confirm `JSON.parse(localStorage.getItem('lastlight_save')).version === 2` and `.settings` block present.

- [ ] **Step 4: Update notes.md**

Edit `.claude/notes.md` — move Phase 8 from In Progress to Completed:

```diff
 ## In Progress
-- **Phase 8 (Audio & Polish):** spec at ...
+- None active

 ## Completed
+- ~~Phase 8: Audio & Polish — Phaser WebAudio SFX + two-layer adaptive music, particles, screen shake, floating damage numbers, settings overlay, SaveManager v2~~ (2026-05-25)
```

- [ ] **Step 5: Commit cleanup**

```bash
git add package.json package-lock.json .claude/notes.md
git commit -m "chore: remove unused howler dep; mark Phase 8 complete in notes"
```

- [ ] **Step 6: Push branch and open PR**

```bash
git push -u origin feature/phase-8-audio-polish
gh pr create --base feature/phase-3-tower-system --title "Phase 8 — Audio & Polish" --body "$(cat <<'EOF'
## Summary
- Phaser built-in WebAudio with `AudioManager` on `game.registry` (no Howler dep — removed)
- Two-layer adaptive music: ambient base + combat overlay, 1.5s cross-fade on enemy-on-path transitions
- 23 SFX events from 18 CC0 source files (Kenney + freesound)
- Floating damage numbers (threshold-gated to crit/AoE/>=30); screen shake on boss death + Airstrike + EMP; new particle effects for muzzle flash, projectile trails, and Hero ability VFX
- Settings UI: gear button in MapSelectScene header → modal with Master/SFX/Music sliders + mute
- `SaveManager` bumped v1 → v2 with `settings` block + automatic migration

## Test plan
- [ ] `npm test` — all green
- [ ] `npm run build` — clean build, no audio 404s
- [ ] Manual: full spec §8 walkthrough (9 items)
- [ ] Migration: paste v1 envelope into localStorage, reload, confirm v2 with settings
EOF
)"
```

---

## Self-Review

**Spec coverage check:** Each spec section maps to at least one task:
- §2 Architecture → Tasks 2–11 cover all new modules; Task 12 covers existing-module changes
- §3 Audio System → Tasks 2–5; boss-music trigger lives in Task 12 Step 4 (spec said `CutsceneScene` would call `playMusic('boss-mid')`; that scene doesn't exist in this codebase, so the trigger fires inline from `_spawnEnemy` on first titan spawn on Maps 5/10)
- §4 Visual Polish → Tasks 8–10; Task 10 includes the expanding ring graphics for airstrike (60 px) and EMP (radius) called for in spec §4
- §5 Settings UI → Tasks 6–7; Task 7 includes Esc-key and backdrop-click close (spec §5)
- §6 Save Format & Migration → Task 1; Task 1 Step 6 adds the future-version `console.warn` load-as-is branch (spec §6 final paragraph)
- §7 Asset Budget → Task 13
- §8 Testing Strategy → All TDD tasks + Task 14 manual verification

**Spec deviations (documented in the affected tasks):**
- `Tower.fire()`, `Enemy.die()`, `Hero.die()`, `Hero.useAbility()` referenced in spec §2 do not exist in this codebase. Task 11's context block documents the actual call-site locations and the wiring lives there.
- Spec §2 listed an `enemy-on-path-changed` event. Plan bypasses the event and calls `am.setCombatActive(true/false)` directly from `GameScene._spawnEnemy` and the enemy-removal site in `_updateEnemies` (Task 12 Step 2). Functionally identical to the event-mediated form.
- Spec §3 "Boss intro override via CutsceneScene" → trigger moved to `GameScene._spawnEnemy` on first titan spawn on Maps 5/10 (Task 12 Step 4).
- Spec §5 mentioned `SettingsOverlay.show()` returning a Promise — plan implements `open()` / `close()` matching `UpgradeTreeOverlay` (which spec §2 explicitly says to mirror). No Promise return; close events are observable via the AudioManager debounced save instead.

**Placeholder scan:** All code blocks contain real, runnable code. Asset-curation tables in Task 13 reference specific Kenney packs and ffmpeg commands. No "TBD" or "similar to Task N" placeholders.

**Type/name consistency:**
- `AudioManager.playSfx(key, opts)` signature used consistently in Tasks 3, 11, 12
- `AudioManager.setCombatActive(bool)` consistent in Tasks 4, 12
- `AudioManager.playMusic(id)` accepts `mapId` or `'boss-mid'`/`'boss-final'`; Task 12 Step 4 calls with `'boss-mid'` / `'boss-final'` matching Task 4's signature
- `damage-dealt` event payload `{ target, amount, isCrit, isAoe, abilityLabel }` consistent in Tasks 8, 11
- `boss-died` payload `{ bossType }` consistent in Tasks 9, 11
- `airstrike-impact` payload `{ x, y }` and `emp-pulse` payload `{ x, y, radius }` consistent in Tasks 9, 11
- `ParticleSpawner.spawnMuzzleFlash / spawnProjectileTrail / spawnHeroAbilityVFX / spawnAirstrikeRing / spawnEMPRing` consistent in Tasks 10, 11
- `Enemy.takeDamage(amount, opts)` new signature in Task 11 Step 1 — back-compat preserved (bare `pierce: boolean` second arg still works) so existing callers in Hero/Soldier/GameScene `_dealDamage` continue to compile; explicit-opts callers in Task 11 use the object form
- `Projectile` constructor opt `towerType` added in Task 11 Step 5 and passed by Task 11 Step 8
- `getOrCreateAudioManager(game, sm)` factory introduced in Task 5; entity code in Task 11 uses `game.registry.get('audio')` (matches Task 5's registration key)
- `SaveManager.getSettings()` / `setSettings(partial)` signatures consistent in Tasks 1, 2

Plan is ready for execution.
