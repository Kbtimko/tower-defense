# Fix Missing-Music Crash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `AudioManager` resilient to missing music files so `GameScene.create()` no longer crashes when `public/audio/music/` is empty (Phase 8b backlog not yet completed).

**Architecture:** Add a cache-existence guard in `AudioManager._addMusic` that returns `null` + console-warns once per missing key instead of letting Phaser throw. Update `AudioManager.playMusic` to skip the `.play()` call when `_addMusic` returns null. All other music-touching methods (`setCombatActive`, `stopMusic`, `_stopLayers`) are already null-safe.

**Tech Stack:** Vitest + jsdom for unit tests; Phaser 3's `game.cache.audio.has(key)` API for the cache check.

**Spec:** [docs/superpowers/specs/2026-05-29-fix-missing-music-crash-design.md](../specs/2026-05-29-fix-missing-music-crash-design.md)

**Branch:** `feature/fix-missing-music-crash` off `feature/phase-3-tower-system`

**Baseline test count:** 348 passing across 24 test files (verified via `npm test --silent`).

---

## Task 1: Guard `_addMusic` + null-safe `playMusic` (TDD)

**Files:**
- Modify: `src/systems/AudioManager.js` — extend `_addMusic` (lines 163-167); add three `if` guards in `playMusic` (lines 117-130)
- Modify: `src/systems/AudioManager.test.js` — extend existing `makeMusicGame` helper with a cache stub; append a new `describe` block with three tests

- [ ] **Step 1: Extend `makeMusicGame` to include a default-true cache stub**

Open `src/systems/AudioManager.test.js`. Find the `makeMusicGame` function (lines 110-127). The current return value is:

```js
    return { game: { sound, registry: new Map() }, created };
```

Change it to (add `cache: { audio: { has: () => true } }` so existing tests continue to pass once the guard exists in `_addMusic`):

```js
    return {
      game: {
        sound,
        registry: new Map(),
        cache: { audio: { has: () => true } },
      },
      created,
    };
```

That's the only change to the existing helper — all five existing music tests will continue to pass because `cache.audio.has` returns `true` for every key.

- [ ] **Step 2: Add a failing test block for missing-key behavior**

Append the following `describe` block to the END of `src/systems/AudioManager.test.js` (after the existing `getOrCreateAudioManager` block):

```js
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
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `npx vitest run src/systems/AudioManager.test.js`
Expected: FAIL on the three new tests (all currently throw or assert wrongly because `_addMusic` doesn't check the cache yet). The 13 existing tests in this file still pass (because the `cache.audio.has = () => true` stub from Step 1 keeps them on the present-key code path).

Specifically expect a failure like `TypeError: Cannot read properties of undefined (reading 'has')` or `expected null but got <object>` depending on test order.

- [ ] **Step 4: Add the cache guard to `_addMusic`**

Open `src/systems/AudioManager.js`. Find the `_addMusic` method at lines 163-167:

```js
  _addMusic(key) {
    const sound = this._game.sound.add(key);
    sound.__channel = 'music';
    return sound;
  }
```

Replace the entire method with:

```js
  _addMusic(key) {
    if (!this._game.cache.audio.has(key)) {
      if (!this._missingMusicWarned) this._missingMusicWarned = new Set();
      if (!this._missingMusicWarned.has(key)) {
        console.warn(`[AudioManager] music key "${key}" not found in cache — skipping`);
        this._missingMusicWarned.add(key);
      }
      return null;
    }
    const sound = this._game.sound.add(key);
    sound.__channel = 'music';
    return sound;
  }
```

- [ ] **Step 5: Add null guards to `playMusic`**

Still in `src/systems/AudioManager.js`, find `playMusic` at lines 117-130:

```js
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
```

Replace the entire method with (three `if` guards added — `if (this._music.boss)`, `if (this._music.ambient)`, `if (this._music.combat)`):

```js
  playMusic(id) {
    if (id === 'boss-mid' || id === 'boss-final') {
      this._stopLayers();
      this._music.boss = this._addMusic(id);
      if (this._music.boss) this._music.boss.play({ volume: this.getEffectiveVolume('music'), loop: true });
      return;
    }
    this._stopLayers();
    this._music.combatActive = false;
    this._music.ambient = this._addMusic(`map-${id}-ambient`);
    if (this._music.ambient) this._music.ambient.play({ volume: this.getEffectiveVolume('music'), loop: true });
    this._music.combat = this._addMusic(`map-${id}-combat`);
    if (this._music.combat) this._music.combat.play({ volume: 0, loop: true });
  }
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `npx vitest run src/systems/AudioManager.test.js`
Expected: PASS — all 16 tests green (13 existing + 3 new).

- [ ] **Step 7: Run the full test suite to confirm no regressions**

Run: `npm test --silent`
Expected: 351 passing (348 baseline + 3 new) across 24 test files.

- [ ] **Step 8: Commit**

```bash
git add src/systems/AudioManager.js src/systems/AudioManager.test.js
git commit -m "$(cat <<'EOF'
fix(audio): guard playMusic against missing cache keys

GameScene.create() crashed at scene boot when public/audio/music/
was missing files — Phaser's sound.add(key) throws when the key
isn't in the cache. The throw killed scene create() before the
canvas, HUD, or window.__game were registered, leaving a blank
dark-blue screen on every level launch.

Add a cache-existence guard in _addMusic that returns null and
console-warns once per missing key. Update playMusic to skip the
.play() call when _addMusic returns null. Game now boots and plays
silently when music files are missing, with one warning per absent
key per session.

All other music-touching methods (setCombatActive, stopMusic,
_stopLayers) were already null-safe and remain unchanged. SFX is
unaffected — its assets are committed and load fine.

Discovered while attempting visual verification of
feature/dead-enemy-cleanup. Reproduced on fdbdcbb so confirmed
pre-existing, not regression.
EOF
)"
```

---

## Task 2: Browser verification

**Files:** none modified. Confirm the fix unblocks local gameplay.

- [ ] **Step 1: Start the dev server**

Run (in background): `npm run dev`
Expected: Vite reports `Local: http://localhost:5173/` within ~2s.

- [ ] **Step 2: Open the game in Playwright and load a level**

1. `browser_navigate` to `http://localhost:5173/`.
2. `browser_snapshot` confirms MapSelectScene rendered with map list + PLAY button.
3. `browser_click` the PLAY button.
4. `browser_evaluate` checks `typeof window.__game !== 'undefined' && window.__game !== null` — must be **true** (GameScene reached create() and ran to completion).
5. `browser_evaluate` checks `getComputedStyle(document.getElementById('bottom-bar')).display` — must be `'flex'` (HUD shown).

- [ ] **Step 3: Confirm warnings instead of fatal errors in console**

Run: `browser_console_messages` with `level: 'error'` and `all: true`.

Expected:
- `Error decoding audio: map-N-ambient` (and similar) entries — these are Phaser's loader complaints; non-fatal, pre-existing.
- **NO** `Error: Audio key "X" not found in cache` thrown from a stack involving `GameScene.create`.

Run: `browser_console_messages` with `level: 'warning'` and `all: true`.

Expected:
- One or more `[AudioManager] music key "X" not found in cache — skipping` warnings (one per touched missing key, deduped).

- [ ] **Step 4: Confirm gameplay works end-to-end**

1. Verify the bottom-bar tower buttons are visible (Archer, Mage, Cannon, Ice, Sniper, Barracks).
2. `browser_click` a tower button (e.g., Archer) then a build zone on the canvas. Verify a tower appears (use `browser_take_screenshot` if needed to confirm visually, or check `window.__game.placementManager.getTowers().length === 1`).
3. `browser_click` the "Send Wave 1" button.
4. After ~5s, `browser_evaluate` checks `window.__game.kills > 0` — confirms enemies spawned and at least one was killed.

- [ ] **Step 5: Stop the dev server**

Kill the background `npm run dev` process: `lsof -ti:5173 | xargs kill 2>/dev/null`.

- [ ] **Step 6: No additional commit needed unless a bug surfaces**

If steps 2-4 surface a regression (e.g., crash in a different code path, HUD doesn't show, etc.), fix it inline, re-run `npm test --silent`, and commit with `fix(audio): <what>`. Otherwise no further commits — Task 1's commit covers the change.

---

## Out of scope

- Sourcing the actual 22 music files (Phase 8b — separate backlog item).
- Refactoring SFX loading (works fine today).
- Pre-filtering `MUSIC_KEYS` based on file existence.
- Any change to `convert-audio.sh` or the music-curation workflow.
