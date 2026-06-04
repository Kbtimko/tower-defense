# Menu Music for `MapSelectScene` — Design Spec

**Date:** 2026-06-03
**Backlog item:** #9 — Add music to main menu (MapSelectScene)
**Author:** Brainstormed with Claude (Opus 4.7), approved by user

## Goal

The map-select screen is silent today: after the boot splash, the player lands on a quiet UI until they click Play and `GameScene.create()` starts the level's music. Add a single dedicated ambient loop that plays whenever the player is on `MapSelectScene`, establishing tone before levels and matching the audio quality bar set by Phase 8b.

## Non-goals

- Hover-driven combat-swap on map cards (backlog option C). Adds gameplay complexity for marginal benefit; the menu is not a place for intensity ramps.
- Crossfade between menu and level music. The established convention is abrupt-cut on `playMusic`; menu→level should match.
- Stopping menu music when DOM overlays open. The upgrade tree and settings overlays are HTML, not Phaser scene transitions; music should keep playing.
- A separate menu SFX layer (e.g., card-hover sounds). Out of scope.

## Asset

One new CC0 ambient/menu track.

- **Tone:** calm, mysterious, slightly cinematic. Sets the pre-battle mood; should not feel triumphant or combat-y.
- **Source:** the same CC0 wells used in Phase 8b (Kenney, OpenGameArt, Patrick de Arteaga, etc.).
- **Length:** 60–90 s, seamlessly looping.
- **Pipeline:** dropped into the staging area, then processed through `scripts/convert-audio.sh`. Outputs `public/audio/music/menu.mp3` and `public/audio/music/menu.ogg` (Opus). Uses the existing `MUSIC_BITRATE=64k` setting.
- **Attribution:** added to `ATTRIBUTIONS.md` under the Music section in the same format as the existing 22 tracks.
- **Bundle cost:** ~250–500 KB over-wire (Opus path); ~600–900 KB for the MP3 fallback.

## API extension — `AudioManager`

### `MUSIC_KEYS`

Append the literal `'menu'` to the exported `MUSIC_KEYS` array in `src/systems/AudioManager.js`. This is the only registry change needed; `BootScene.preload()` already iterates `MUSIC_KEYS` and loads each as a dual-format `[ogg, mp3]` array.

### `playMusic(id)`

Add a new branch at the top of `playMusic`, matching the shape of the existing boss branch:

```js
if (id === 'menu') {
  this._stopLayers();
  this._music.combatActive = false;
  this._music.ambient = this._addMusic('menu');
  if (this._music.ambient) {
    this._music.ambient.play({ volume: this.getEffectiveVolume('music'), loop: true });
  }
  return;
}
```

Rationale for the ambient slot (not the boss slot):

- `_reapplyActiveVolumes` already treats ambient as a music-channel track at full music volume.
- The combat-fade logic in `setCombatActive` is a no-op when `_music.combat` is null, so leaving combat null is safe.
- A subsequent `playMusic(mapId)` will call `_stopLayers()` and replace ambient/combat cleanly — no stray menu instance.

No other `AudioManager` methods change. `setCombatActive`, `stopMusic`, `setMasterVolume`, etc. all work transparently because `_music.ambient` carries the `__channel = 'music'` tag set by `_addMusic`.

### Backward compatibility

`playMusic` continues to accept a numeric map id, `'boss-mid'`, or `'boss-final'`. Adding `'menu'` is purely additive. No existing call sites change.

## Scene wiring

### `MapSelectScene.create()`

After the existing setup (sidebar, hero picker, meta bar, button bindings), call:

```js
const am = this.game.registry.get('audio');
if (am) am.playMusic('menu');
```

This mirrors the existing pattern in `GameScene.create()`. The `am != null` guard handles the rare case where audio failed to initialize.

### `MapSelectScene.shutdown()`

No change. When the player clicks Play, `scene.start('GameScene', ...)` fires, `GameScene.create()` runs, and its `am.playMusic(this.mapId ?? 0)` call invokes `_stopLayers()` — which stops the menu ambient and starts the level ambient/combat pair in the same frame. The cut is consistent with level-to-level transitions in the current build.

### Return-to-menu

When the player exits a level (Exit button, victory screen, defeat screen), `GameScene` shuts down and `MapSelectScene.create()` runs again. Its new `playMusic('menu')` line resumes the menu loop automatically. No additional plumbing.

### DOM overlays

The upgrade tree and settings overlays are HTML overlays opened in-place; they do not cause a Phaser scene transition. Menu music continues to play underneath them, which is the desired behavior.

## Test coverage

### `src/systems/AudioManager.test.js`

1. **`playMusic('menu')` loads and plays the menu key.**
   Asserts that after `playMusic('menu')`, the ambient slot holds a sound for key `'menu'`, played at `getEffectiveVolume('music')` with `loop: true`. Combat and boss slots are null.

2. **`playMusic('menu')` → `playMusic(0)` transitions cleanly.**
   Asserts that the menu sound is stopped before the map-0 ambient is played, and no stray menu instance is left in the `_music` object.

3. **Missing-key warning path is exercised by an existing test pattern.**
   No new assertion needed: `_addMusic` already warns and returns null when the cache lacks the key. Covered by existing tests.

### `src/scenes/MapSelectScene.menuMusic.test.js` (new file)

4. **`MapSelectScene.create()` calls `am.playMusic('menu')`.**
   Mocks the audio registry entry with a spy and asserts `playMusic` was called exactly once with `'menu'`. New file (not added to `MapSelectScene.heroPicker.test.js`) so the menu-music concern stays isolated and the heroPicker file remains focused on its single topic.

### Implicit coverage

- `BootScene.preload` already iterates `MUSIC_KEYS` and dual-format loads each entry. Adding `'menu'` to the array means it's loaded — no preload test change needed beyond keeping the existing assertion (if any) tolerant of array growth.
- `SettingsOverlay` music-volume slider already routes through `_reapplyActiveVolumes`, which handles `_music.ambient` regardless of which track lives there.

## Implementation order

1. Add `'menu'` to `MUSIC_KEYS` and the new `playMusic('menu')` branch. Write tests (1) and (2) first per the project's TDD convention.
2. Wire `MapSelectScene.create()` to call `playMusic('menu')`. Write test (4) first.
3. Source one CC0 menu track. Run it through `convert-audio.sh`. Commit the two output files plus the `ATTRIBUTIONS.md` update.
4. Manual browser verification: fresh load → menu music plays; click Play on Map 1 → menu cuts, level music starts; exit back to map select → menu music resumes.

The asset can land last because the code is asset-agnostic: with `'menu'` in `MUSIC_KEYS` but no file on disk, `_addMusic` will log a single warning and return null — the rest of the scene works fine. This means steps 1 and 2 can be shipped as code-only first if the curation hits a snag.

## Risks

- **Curation may take longer than the code work.** Mitigated by the asset-agnostic implementation: code can ship with the warning, and the asset can land in a follow-up commit on the same branch.
- **Track choice affects player perception of game tone.** Pick a track consistent with the existing map ambient palette — neither too sparse (feels broken) nor too combat-y (clashes with level transition).
- **Bundle size.** At ~250–500 KB Opus, this is a single-track addition in line with Phase 8b's per-track cost. Negligible.

## Files touched

- `src/systems/AudioManager.js` — `MUSIC_KEYS` + `playMusic('menu')` branch.
- `src/systems/AudioManager.test.js` — two new tests.
- `src/scenes/MapSelectScene.js` — one new line in `create()`.
- `src/scenes/MapSelectScene.menuMusic.test.js` — new file, one new test.
- `public/audio/music/menu.mp3` + `public/audio/music/menu.ogg` — the new track.
- `ATTRIBUTIONS.md` — one new music entry.
