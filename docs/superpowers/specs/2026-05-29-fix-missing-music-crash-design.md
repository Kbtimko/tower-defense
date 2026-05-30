# Fix Missing-Music Crash — Design

**Date:** 2026-05-29
**Branch:** `feature/fix-missing-music-crash` off `feature/phase-3-tower-system`
**Trigger:** Discovered while attempting visual verification of the `feature/dead-enemy-cleanup` branch — local dev was blank-blue on every level launch. Reproduced on `fdbdcbb` (current `origin/feature/phase-3-tower-system` tip) so the bug is pre-existing, not caused by dead-enemy work.

---

## 1. Problem

`GameScene.create()` at [src/scenes/GameScene.js:43](../../../src/scenes/GameScene.js#L43) unconditionally calls `am.playMusic(this.mapId ?? 0)`. That walks into [AudioManager.playMusic:117-130](../../../src/systems/AudioManager.js#L117-L130) → [_addMusic:163-167](../../../src/systems/AudioManager.js#L163-L167) which calls `this._game.sound.add(key)`. Phaser throws when the key is not in the audio cache:

```
Error: Audio key "map-1-ambient" not found in cache
    at new WebAudioSound2 (phaser.js:115797)
    at WebAudioSoundManager2.add (phaser.js:116633)
    at AudioManager._addMusic (AudioManager.js:164)
    at AudioManager.playMusic (AudioManager.js:126)
    at GameScene.create (GameScene.js:43)
    at SceneManager2.create (phaser.js:110790)
```

The throw kills `GameScene.create()` mid-flight — Phaser stops executing the rest of `create()`, so the canvas, HUD, bottom-bar, and `window.__game` registration never happen. The user sees a blank dark-blue canvas with no game content.

The cache is missing those keys because [public/audio/music/](../../../public/audio/music/) contains only a `.gitkeep` — the 22 music files referenced by `MUSIC_KEYS` ([AudioManager.js:13-17](../../../src/systems/AudioManager.js#L13-L17)) are the Phase 8b backlog item ("Music curation: 22 freesound.org CC0 tracks") and were never sourced/committed. Vite serves a 200 with an empty body for each missing file; Phaser logs `Error decoding audio: <key> - Unable to decode audio data`, but those errors are non-fatal and just leave the key absent from the cache. The fatal error comes later, when `_addMusic` looks the key up.

The existing 348-test suite mocks Phaser entirely, so this code path was never exercised against a real audio cache. Whoever played locally before me likely had music files generated via `scripts/convert-audio.sh` that aren't committed.

## 2. Goals

- `GameScene.create()` succeeds when music files are missing. Game is fully playable without music.
- Missing music keys produce a one-time `console.warn` per key (so a future regression is still visible), not a thrown error.
- No change to SFX (assets are committed and load fine today).
- No change to `playMusic`'s behavior when keys ARE present (existing 348 tests pass unchanged).

## 3. Non-Goals

- Sourcing the actual music files (that's Phase 8b — separate backlog item).
- Pre-loading filtering of `MUSIC_KEYS` (we want to load whatever's present; warn only on what's missing at play time).
- Any change to SFX loading or `playSfx`.
- Any change to `setCombatActive`, `stopMusic`, `_stopLayers` — already null-safe (see §5).

## 4. Approach

Two small changes to `src/systems/AudioManager.js`.

### 4.1 `_addMusic` guards the cache lookup

Current ([AudioManager.js:163-167](../../../src/systems/AudioManager.js#L163-L167)):

```js
_addMusic(key) {
  const sound = this._game.sound.add(key);
  sound.__channel = 'music';
  return sound;
}
```

New:

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

The `_missingMusicWarned` Set is created lazily on first miss (avoids constructor churn for the common path where music loads fine). The `console.warn` fires once per key per `AudioManager` instance — across a single play session, expect at most 22 warnings (10 ambient + 10 combat + 2 boss).

### 4.2 `playMusic` handles null from `_addMusic`

Current ([AudioManager.js:117-130](../../../src/systems/AudioManager.js#L117-L130)):

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

New (three `if` guards added; no other change):

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

The `this._music.{ambient,combat,boss}` assignments deliberately still happen (with `null`) — the rest of `AudioManager` already treats those slots as nullable.

## 5. Why this is safe

All other code paths that touch `this._music.{ambient,combat,boss}` already null-check:

| Call site | Existing null-handling |
|---|---|
| `setCombatActive` ([line 132-137](../../../src/systems/AudioManager.js#L132-L137)) | `if (this._music.boss \|\| !this._music.combat) return;` — early return when combat is null |
| `stopMusic` ([line 139-146](../../../src/systems/AudioManager.js#L139-L146)) | `for (...) { if (!s) continue; ... }` — skips null entries |
| `_stopLayers` ([line 148-161](../../../src/systems/AudioManager.js#L148-L161)) | `if (s) { ... }; this._music[k] = null;` — skips null entries |
| `GameScene` boss-music trigger | calls `playMusic('boss-mid')` / `'boss-final'` — same code path, same null-safe handling |

The constructor already initialises all three slots to `null` ([line 37](../../../src/systems/AudioManager.js#L37)), so post-fix the runtime invariant is *"these slots are either a real Phaser sound or null"* — unchanged.

SFX is unaffected because `playSfx` ([line 70-84](../../../src/systems/AudioManager.js#L70-L84)) has its own caching path that doesn't call `_addMusic`. The SFX asset set is fully committed (per `public/audio/ATTRIBUTIONS.md`), so the cache hit rate there is 100% in normal operation.

## 6. Files touched

- **`src/systems/AudioManager.js`** — modify `_addMusic` (add ~7 lines of guard); modify `playMusic` (add three `if` checks; no statements moved or removed).
- **`src/systems/AudioManager.test.js`** — append new tests under a new `describe` block.

No other production files change. No new modules, no new events, no API surface change visible to GameScene or any caller.

## 7. Tests

Append to `src/systems/AudioManager.test.js`. The existing mock infrastructure (`makeGame`, `makeSave`) is sufficient — only the `cache.audio.has` stub needs to be controllable per test.

### 7.1 `_addMusic` returns null and warns when key missing
- Create an `AudioManager` with a `game` whose `cache.audio.has` returns `false` for the target key.
- Spy on `console.warn`.
- Call `_addMusic('map-0-ambient')` twice.
- Assert: returns `null` both times; `console.warn` was called exactly once; the warning message mentions the key name.

### 7.2 `playMusic(id)` does not throw when ambient + combat keys missing
- Create an `AudioManager` with `cache.audio.has` returning `false` for both `map-0-ambient` and `map-0-combat`.
- Call `playMusic(0)`. Assert it does not throw.
- Assert `this._music.ambient` and `this._music.combat` are both `null`.

### 7.3 `playMusic('boss-mid')` does not throw when boss key missing
- Same setup with `cache.audio.has` returning `false` for `boss-mid`.
- Call `playMusic('boss-mid')`. Assert it does not throw.
- Assert `this._music.boss` is `null`.

### 7.4 `playMusic(id)` still plays normally when keys present
- Default mock (keys present). Existing tests already cover this — verify they still pass unchanged.

## 8. Risk + rollback

- **Risk:** very low. The change adds defensive guards; no existing behavior is altered when keys are present.
- **Rollback:** revert the single commit. No data migration, no save-format change.

## 9. Estimate

~15 LOC production + ~30 LOC tests. Single commit on `feature/fix-missing-music-crash`. Single small PR.

## 10. Out of scope

- Sourcing the 22 music files (Phase 8b — separate backlog item).
- Refactoring SFX loading.
- Pre-filtering `MUSIC_KEYS` based on file existence (impossible to know synchronously).
- Any change to `convert-audio.sh` or the music-curation workflow.
