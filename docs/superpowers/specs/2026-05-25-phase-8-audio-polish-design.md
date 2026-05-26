# Phase 8 — Audio & Polish: Design Spec

**Date:** 2026-05-25
**Status:** Approved, ready for implementation plan
**Base branch:** `feature/phase-3-tower-system`
**Scope source:** [Master design doc, row 8 of Phase Plan](./2026-05-09-tower-defense-game-design.md) — "Howler.js SFX + music, particles, screen shake, floating damage numbers"

> **Note on backlog ordering:** This is item #6 in the current notes.md backlog, not #1. Brainstormed and approved out of order with explicit user direction. The five preceding items (send-wave-early bonus, dead-enemy cleanup, info overlay, type weakness check, hero roster) remain queued for follow-up phases.

---

## 1. Decisions Locked

| # | Question | Decision |
|---|---|---|
| 1 | Scope | Full per spec — audio + music + particles + shake + damage numbers + settings UI |
| 2 | Audio library | Phaser built-in WebAudio (deviation from master spec's Howler.js — Phaser's audio system has matured; no new dependency) |
| 3 | Asset sourcing | CC0 library (Kenney + freesound.org) committed up front. Hard budget ≤ 5 MB |
| 4 | Music structure | Two-layer adaptive (ambient base + combat overlay), 1.5 s cross-fade |
| 5 | Damage number policy | Show only on crits, AoE, or hits ≥ 30 damage |
| 6 | Screen shake triggers | Boss death (600 ms heavy), Hero Airstrike (250 ms medium), Hero EMP (200 ms low-freq). No shake on life-lost or hero death. |
| 7 | Settings UI | Gear button in MapSelectScene header → DOM modal overlay (Master/SFX/Music sliders + mute checkbox), pattern mirrors existing `UpgradeTreeOverlay` |
| 8 | Combat-music trigger | ≥ 1 enemy on path → fade combat in; path empty → fade combat out; 1.5 s cross-fade either direction |
| 9 | New particles | Tower muzzle flash on fire; per-tower projectile trails; replace placeholder Hero ability rings with proper VFX. No placement burst. |

---

## 2. Architecture

### New Modules

All new modules live under `src/systems/` except the shared particle texture.

| Module | Path | Responsibility |
|---|---|---|
| `AudioManager` | `src/systems/AudioManager.js` | One instance per game, registered on `game.registry` so all scenes share it. Loads audio assets, plays SFX by key, owns music state machine, persists settings via SaveManager. |
| `DamageNumberOverlay` | `src/systems/DamageNumberOverlay.js` | Phaser game-object container parented to GameScene. Listens for `damage-dealt`, filters by threshold, spawns short-lived `Phaser.GameObjects.Text` with tween. Pools 24 Text objects to avoid GC churn. |
| `ShakeController` | `src/systems/ShakeController.js` | Thin wrapper over `scene.cameras.main.shake()`. Subscribes to `boss-died`, `airstrike-impact`, `emp-pulse`. Centralizes intensity tuning. |
| `ParticleSpawner` | `src/systems/ParticleSpawner.js` | Helpers for the three new effect types: `spawnMuzzleFlash(x, y, towerType)`, `spawnProjectileTrail(projectile, towerType)`, `spawnHeroAbilityVFX(ability, x, y, radius)`. Uses Phaser's built-in particle emitter. |
| `SettingsOverlay` | `src/ui/SettingsOverlay.js` | DOM overlay mirroring the existing `UpgradeTreeOverlay` (`src/ui/UpgradeTreeOverlay.js`) — markup lives in `index.html`, the class reaches in via `getElementById`, attaches listeners on `open()`, removes them on `close()`. Master/SFX/Music sliders, mute checkbox, close button wired to AudioManager setters. |

### Existing Modules Touched

| Module | Change |
|---|---|
| `SaveManager` | Bump envelope from v1 to v2; add top-level `settings` block; add `getSettings()` + `setSettings(partial)`; write v1→v2 migration. (Current code is v1 with flat keys — no `data` wrapper to add.) |
| `BootScene` | Preload all audio assets via new `AudioManager.loadAssets(scene)` |
| `GameScene` | Instantiate `DamageNumberOverlay`, `ShakeController`, `ParticleSpawner`; emit new events; call `AudioManager.playMusic(mapId)` on create, `stopMusic()` on shutdown; emit `enemy-on-path-changed` when count crosses 0↔1 |
| `MapSelectScene` | Add gear button in header; mount `SettingsOverlay` on click |
| `Tower.fire()` | Call `ParticleSpawner.spawnMuzzleFlash`; call `AudioManager.playSfx('tower-fire-' + towerType)` |
| `Projectile` constructor | Call `ParticleSpawner.spawnProjectileTrail(this, towerType)` |
| `Enemy.takeDamage()` | Emit `damage-dealt` event with payload (target, amount, isCrit, isAoe, abilityLabel); play `enemy-hit` SFX with random detune |
| `Hero.useAbility()` | Existing ability code + `ParticleSpawner.spawnHeroAbilityVFX` + `AudioManager.playSfx`; emit `airstrike-impact` and `emp-pulse` events |

### Asset Layout

```
public/
  audio/
    ATTRIBUTIONS.md
    sfx/
      tower-fire-machinegun.mp3
      tower-fire-cannon.mp3
      tower-fire-sniper.mp3
      tower-fire-laser.mp3
      tower-fire-rocket.mp3
      tower-fire-barracks.mp3
      tower-place.mp3
      tower-upgrade.mp3
      tower-sell.mp3
      enemy-hit.mp3
      enemy-death-small.mp3
      enemy-death-large.mp3
      hero-attack.mp3
      hero-death.mp3
      hero-respawn.mp3
      hero-overcharge.mp3
      hero-airstrike.mp3
      hero-emp.mp3
      wave-start.mp3
      life-lost.mp3
      victory.mp3
      defeat.mp3
      ui-click.mp3
    music/
      map-0-ambient.mp3 … map-9-ambient.mp3
      map-0-combat.mp3  … map-9-combat.mp3
      boss-mid.mp3
      boss-final.mp3
  particles/
    spark.png   (4×4 white square, tinted at runtime)
```

### New Events on `scene.events`

| Event | Payload | Emitter |
|---|---|---|
| `damage-dealt` | `{ target, amount, isCrit, isAoe, abilityLabel }` | `Enemy.takeDamage()` |
| `enemy-on-path-changed` | `{ count }` (only on 0↔1 boundary) | `GameScene` (tracks active enemies) |
| `boss-died` | `{ bossType }` | `Enemy.die()` for boss types (titan, future) |
| `airstrike-impact` | `{ x, y }` | `Hero.useAbility('w')` at impact frame |
| `emp-pulse` | `{ x, y, radius }` | `Hero.useAbility('e')` at activation |

---

## 3. Audio System

### `AudioManager` API

```js
class AudioManager {
  constructor(game)
  loadAssets(scene)                          // called in BootScene.preload
  playSfx(key, opts?)                        // opts: { volume?, rate?, detune? }
  playMusic(mapId | 'boss-mid' | 'boss-final')
  stopMusic(fadeMs = 500)
  setCombatActive(active)                    // fade combat layer in/out over 1.5s
  setMasterVolume(0..1)
  setSfxVolume(0..1)
  setMusicVolume(0..1)
  setMuted(bool)
  getSettings()                              // { masterVol, sfxVol, musicVol, muted }
  applySettings(settings)                    // called once on game load
}
```

**Effective volume per sound** = `master × (muted ? 0 : channelVol)`. Applied via Phaser's per-sound `setVolume` on every play and on every slider change (iterate active sounds, update volume in real time).

**iOS unlock:** Phaser handles WebAudio unlock on first user gesture automatically. The first `playSfx` happens after a map-select click → GameScene start → first SFX (`wave-start`) fires ~3 s in, well after the unlocking gesture.

**Persistence:** Slider changes call `SaveManager.setSettings({ ... })` debounced 300 ms to avoid localStorage thrashing during a drag.

### Music State Machine

```
GameScene.create():
  AudioManager.playMusic(mapId)         → ambient at musicVol, combat at 0

on enemy-on-path-changed (0→1):
  AudioManager.setCombatActive(true)    → combat layer fades 0 → musicVol over 1.5 s

on enemy-on-path-changed (1→0):
  AudioManager.setCombatActive(false)   → combat layer fades musicVol → 0 over 1.5 s

GameScene.shutdown():
  AudioManager.stopMusic(500)
```

**Boss intro override:** On Maps 5 and 10, `CutsceneScene` calls `playMusic('boss-mid')` or `playMusic('boss-final')` which replaces the ambient/combat pair with a single non-layered boss theme. The boss theme plays for the remainder of the map; ambient/combat layers do not resume. While boss music is active, `setCombatActive` is a no-op (the `enemy-on-path-changed` event is ignored by the music controller).

**Rapid trigger toggling:** if `enemy-on-path-changed` fires while a cross-fade tween is in flight, kill the in-flight tween and start a fresh 1.5 s tween in the new direction from the current intermediate volume (no stacking, no abrupt cuts).

### SFX Inventory (23 events, 18 unique source files)

| Category | Event key | Trigger | Source |
|---|---|---|---|
| **Tower** | `tower-fire-machinegun` | MG fires | unique |
| | `tower-fire-cannon` | Cannon fires | unique |
| | `tower-fire-sniper` | Sniper fires | unique |
| | `tower-fire-laser` | Laser fires | unique |
| | `tower-fire-rocket` | Rocket launcher fires | unique |
| | `tower-fire-barracks` | Soldier melee swing | reuse cannon-soft variant |
| | `tower-place` | Tower placed | unique |
| | `tower-upgrade` | Tower upgraded | unique |
| | `tower-sell` | Tower sold | unique |
| **Enemy** | `enemy-hit` | Any enemy takes damage | unique; ±50 cent detune per call |
| | `enemy-death-small` | Drone / skitter dies | unique |
| | `enemy-death-large` | Brute / titan / boss dies | unique |
| **Hero** | `hero-attack` | Rael melee swing | reuse `enemy-hit` |
| | `hero-death` | Rael dies | reuse `enemy-death-large` |
| | `hero-respawn` | Rael respawns | reuse `tower-upgrade` |
| | `hero-overcharge` | Q ability | unique |
| | `hero-airstrike` | W ability impact | unique |
| | `hero-emp` | E ability | unique |
| **Game** | `wave-start` | Wave countdown ends | unique |
| | `life-lost` | Enemy leaks past | reuse `enemy-death-small` |
| | `victory` | Map win | unique |
| | `defeat` | Map loss | unique |
| **UI** | `ui-click` | Button clicks (subtle) | unique |

**Sourcing:** [Kenney Sci-Fi Sounds](https://kenney.nl/assets/sci-fi-sounds), [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), [Kenney UI Audio](https://kenney.nl/assets/ui-audio) — all CC0.

**Tier-4 branches reuse base tower fire sounds** (deferred to backlog Phase 8b — per-branch SFX adds 10 more files for marginal benefit).

---

## 4. Visual Polish

### Floating Damage Numbers (`DamageNumberOverlay`)

**Trigger rule:** spawn a number only when ALL apply:
- `Enemy.takeDamage()` deals damage > 0 (post-armor)
- AND at least one of: `isCrit === true`, `isAoe === true`, or `damage >= 30`

**Lifecycle per number:**
- Spawn at `(enemy.x, enemy.y - 12)` with ±8 px random x-jitter
- Tween: `y -= 50` over 1200 ms with `ease: 'Cubic.easeOut'`
- Alpha: `0 → 1` in first 100 ms, hold to 800 ms, `1 → 0` over last 400 ms
- Pool size: 24 reusable `Phaser.GameObjects.Text` objects
- On expiry, returned to pool (not destroyed)
- **Pool overflow:** if all 24 are in flight and a 25th spawn is requested, drop the new number silently. With threshold filtering (crit/AoE/≥30) the pool will not exhaust under normal play.

**Styling:**

| Type | Font | Color | Example |
|---|---|---|---|
| Big hit (`amount ≥ 30`, no crit/aoe) | 16 px bold monospace | white `#ffffff` | `34` |
| Crit (`isCrit`) | 22 px bold monospace | yellow `#ffcc44` | `CRIT 45!` |
| AoE / ability (`isAoe` or `abilityLabel`) | 16 px bold monospace | orange `#ff9966` | `AIRSTRIKE 80` |

All have a 1 px black stroke and a Phaser `Text.setShadow` for legibility.

**Crit flag** is `false` for all current towers (no crit chance in the game yet). The schema supports it for future use.

### Screen Shake (`ShakeController`)

Wraps `camera.shake(duration, intensity)` where intensity is 0–1 (fraction of camera dimensions).

| Trigger | Duration | Intensity | Note |
|---|---|---|---|
| `boss-died` | 600 ms | 0.020 | Heavy; only fires 2× per playthrough |
| `airstrike-impact` | 250 ms | 0.012 | Medium |
| `emp-pulse` | 200 ms | 0.008 | Short low-frequency rumble |

New shake overrides any active shake (Phaser default). No queueing.

### Particle Effects (`ParticleSpawner`)

All three new effect types share `public/particles/spark.png` (a 4×4 white square; tinted at runtime).

**Muzzle flash** — `spawnMuzzleFlash(x, y, towerType)`:
- 3 particles, 80 ms lifetime, scale `0.6 → 0`, speed 60, spread ±30° from tower's aim angle
- Tint by type: MG/sniper white, cannon yellow `#ffdd66`, laser cyan `#66ccff`, rocket orange `#ff8844`

**Projectile trail** — `spawnProjectileTrail(projectile, towerType)`:
- Continuous emitter parented to projectile; 1 particle every 16 ms (≈60 Hz), lifetime 250 ms
- Scale `0.4 → 0`, alpha `1 → 0`
- Style by type: bullet = thin white line; rocket = grey smoke puffs; laser = thick cyan streak
- Emitter destroyed when projectile hits target or expires

**Hero ability VFX** — replaces existing placeholder ring graphics:
- **Overcharge (Q):** gold sparkle aura around each affected tower for 6 s — 8 particles/sec orbiting tower base, scale 0.4, tint `#ffcc44`
- **Airstrike (W):** orange shockwave at impact — 30-particle radial burst, lifetime 400 ms, scale `1.0 → 0`, tint `#ff6633`; plus a 60 px-radius expanding ring graphic
- **EMP Pulse (E):** blue ripple from Rael — 20 particles in expanding circle, lifetime 600 ms, scale `0.5 → 0`, tint `#66ccff`; plus an expanding stun ring matching ability radius

**Performance budget:** at peak (10 enemies + 6 towers firing + Airstrike + EMP) expect ~80 simultaneous particles + 24 damage numbers. Phaser handles 1000+ particles on desktop; iOS comfortably handles 200+ at 60 fps. Well under budget.

---

## 5. Settings UI

### Gear Button in MapSelectScene

Add next to the existing `★ X / 30` stars bar:

```html
<button id="settings-gear-btn" class="header-btn" title="Audio settings">⚙</button>
```

Styled to match the existing Upgrades button (same height, border, hover state).

### `SettingsOverlay` DOM

Same pattern as `UpgradeTreeOverlay`: a `<div id="settings-overlay">` appended to `document.body` on `show()`, removed on `hide()`. No Phaser DOM elements.

```html
<div id="settings-overlay" class="overlay-backdrop">
  <div class="overlay-panel settings-panel">
    <div class="overlay-header">
      <h2>⚙ Audio Settings</h2>
      <button class="overlay-close" aria-label="Close">✕</button>
    </div>
    <div class="overlay-body">
      <div class="slider-row">
        <label for="vol-master">Master</label>
        <input id="vol-master" type="range" min="0" max="100" step="1" />
        <span class="slider-val" data-bind="master">80</span>
      </div>
      <div class="slider-row">
        <label for="vol-sfx">Sound Effects</label>
        <input id="vol-sfx" type="range" min="0" max="100" step="1" />
        <span class="slider-val" data-bind="sfx">100</span>
      </div>
      <div class="slider-row">
        <label for="vol-music">Music</label>
        <input id="vol-music" type="range" min="0" max="100" step="1" />
        <span class="slider-val" data-bind="music">60</span>
      </div>
      <div class="mute-row">
        <label><input id="mute-all" type="checkbox" /> Mute all audio</label>
      </div>
    </div>
  </div>
</div>
```

### Behavior

- **Open:** Click gear → instantiate `SettingsOverlay` with `AudioManager.getSettings()` → sliders reflect current state.
- **Slider drag:** `input` event → update displayed value immediately, call AudioManager setter → applies to all active sounds in real time, triggers 300 ms debounced save.
- **Mute toggle:** `change` event → `AudioManager.setMuted(checked)` → all audio silenced via volume × 0. Sliders stay editable while muted; values persist.
- **Close:** backdrop click, ✕ button, or `Esc` key. No save button needed.
- **Keyboard:** native `<input type="range">` so arrows = ±1, PageUp/Down = ±10 (accessibility free).

### Class Surface

```js
class SettingsOverlay {
  constructor(audioManager)
  show()      // creates DOM, attaches listeners, returns Promise that resolves on close
  hide()      // removes DOM, detaches listeners
}
```

---

## 6. Save Format & Migration

> **Correction:** Initial spec draft assumed the existing `SaveManager` was at v2 with a `data.{progress,upgrades,stats}` nested wrapper. The actual code (`src/systems/SaveManager.js`) is at **VERSION 1** with **top-level** `maps` / `upgrades` / `stats` keys and a legacy-bare-array migration. The plan reflects the real shape below.

### Current — v1 envelope (in code today)

```js
{
  version:  1,
  maps:     [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],   // star count per map
  upgrades: [],                                // array of purchased upgrade ids
  stats:    { kills, gamesPlayed, victories, defeats, bestWave }
}
```

Legacy bare array at `localStorage['lastlight_progress']` is already migrated into v1 on first load (existing behavior — keep it).

### New — v2 envelope

```js
{
  version:  2,
  maps:     [/* unchanged */],
  upgrades: [/* unchanged */],
  stats:    { /* unchanged */ },
  settings: {
    masterVol: 0.8,
    sfxVol:    1.0,
    musicVol:  0.6,
    muted:     false
  }
}
```

`settings` is a sibling of `maps` / `upgrades` / `stats` — **no `data` wrapper**, matching the existing flat shape.

### v1 → v2 Migration

```js
function migrateV1toV2(v1) {
  return {
    ...v1,
    version: 2,
    settings: defaultSettings(),
  };
}

function defaultSettings() {
  return { masterVol: 0.8, sfxVol: 1.0, musicVol: 0.6, muted: false };
}
```

Runs once inside `SaveManager._load()` when `parsed.version === 1`. Result is immediately written back to `localStorage[STORAGE_KEY]` so subsequent loads are direct v2 reads.

### Migration Chain

- bare array → v1 (existing, in code today)
- v1 → v2 (new)

A future-version save (`version > 2`) is loaded as-is with a `console.warn` — never overwritten with reset.

### `freshEnvelope()` update

The existing `freshEnvelope()` factory in `SaveManager.js` is bumped to return `version: 2` and include a `settings: defaultSettings()` field, so brand-new saves start at v2.

### `_normalize()` update

Existing `_normalize()` accepts a parsed v2 envelope; if `parsed.settings` is missing or malformed, fall back to `defaultSettings()` (defensive — handles partial corruption).

### SaveManager API Additions

```js
getSettings()                  // returns data.settings, or defaults if absent
setSettings(partial)           // shallow-merge into data.settings, triggers save
```

`AudioManager.applySettings()` is called once at game start with `SaveManager.getSettings()`. The 300 ms debounced save inside AudioManager calls `SaveManager.setSettings(...)`.

---

## 7. Asset Budget

| Category | Files | Format | Per-file | Subtotal |
|---|---|---|---|---|
| SFX | 18 unique | MP3 96 kbps mono | ~10 KB | ~180 KB |
| Music — ambient | 10 (one per map) | MP3 96 kbps mono, loop-marked | ~200 KB | ~2.0 MB |
| Music — combat | 10 (one per map) | MP3 96 kbps mono, loop-marked | ~200 KB | ~2.0 MB |
| Music — boss themes | 2 | MP3 96 kbps mono | ~250 KB | ~500 KB |
| Particles | 1 (`spark.png`) | PNG 4×4 white | <1 KB | <1 KB |
| **Total** | | | | **~4.7 MB** |

**Hard cap: ≤ 5 MB added to repo.**

**Attribution doc:** `public/audio/ATTRIBUTIONS.md` lists source + license per track. CC0 doesn't require it but listing is good practice and future-proofs us for any CC-BY additions.

---

## 8. Testing Strategy

### Unit-Testable (Vitest, ~25 new tests target)

| Module | Key assertions |
|---|---|
| `AudioManager` | `setMasterVolume` clamps to [0,1]; `setMuted(true)` makes effective volume 0; `applySettings` updates all channels; `playSfx` respects mute; debounced save fires after 300 ms |
| Music state machine (inside `AudioManager`) | `setCombatActive(true)` triggers fade-in tween; rapid toggles don't stack; boss theme replaces ambient+combat pair |
| `DamageNumberOverlay` | Spawns on `damage-dealt` with `isCrit: true` regardless of amount; spawns on `amount >= 30`; suppresses small non-crit hits; pool reuses Text objects |
| `ShakeController` | `boss-died` triggers `camera.shake(600, 0.02)`; airstrike triggers `(250, 0.012)`; EMP triggers `(200, 0.008)` |
| `SaveManager` | v1→v2 migration adds settings block with defaults; v2 round-trip preserves all fields; `getSettings` returns defaults when settings missing or malformed |
| `ParticleSpawner` | `spawnMuzzleFlash` creates emitter with correct tint per tower type; `spawnProjectileTrail` parents to projectile; emitter cleaned up on projectile destroy |

### Manual Browser Verification

1. Play Map 1 — confirm tower fire SFX, enemy hit/death SFX, wave-start SFX audible at default volumes
2. Open settings — drag each slider, confirm immediate volume change; close + reopen, confirm persistence; toggle mute, confirm full silence then full restore
3. Reload page — confirm settings persisted (localStorage v2 envelope present with settings block)
4. Play Map 5 — boss intro replaces map music with `boss-mid`; on boss death, heavy screen shake + `enemy-death-large` SFX
5. Play Map 10 — same for `boss-final`; victory SFX on win
6. Hero abilities — Q (overcharge gold sparkle, no shake), W (airstrike orange burst + 250 ms shake + `AIRSTRIKE 80` damage number), E (EMP blue ripple + 200 ms shake)
7. Floating damage numbers — only crits/AoE/hits ≥ 30 produce numbers; no spam during wave 10 of Map 10
8. Migration — manually set localStorage to a v1 envelope, reload, confirm settings block auto-added and version bumped to 2
9. iOS Safari smoke test — open Vercel preview on iPhone, confirm audio unlocks on first tap, music plays on map start

---

## 9. Explicit Out-of-Scope (Deferred)

| Item | Why deferred |
|---|---|
| Per-tower-branch SFX (5 tier-4 branches) | Backlog item — Phase 8b. Phase 8 reuses base tower fire sound. |
| Per-enemy-type hit sounds | Backlog item — Phase 8b. Phase 8 uses generic + detuned. |
| In-level access to settings overlay | Adds GameScene pause logic — bigger surface; defer. |
| Music ducking on big SFX | Nice polish; not required for "audio shipped" bar. |
| Per-map combat-music intensity (pressure-based) | Rejected option during brainstorm; would need per-map tuning. |
| Graphics/quality settings, keybinds, fullscreen | Out of audio/polish scope. |
| Cloud sync of settings | Out of all-localStorage architecture. |
| Tower placement particle burst | Rejected during brainstorm as low priority. |
| Cross-fade between maps on MapSelectScene | MapSelectScene currently has no music; separate task if added. |

---

## 10. Deviations from Master Spec

| Decision | Master spec | This spec | Rationale |
|---|---|---|---|
| Audio library | Howler.js | Phaser built-in WebAudio | Phaser audio has matured; no need to add a dependency the engine now duplicates. |
| Music structure | (not specified) | Two-layer adaptive (ambient + combat) | Adds dynamic feel without per-map tuning complexity. |
| Damage number frequency | (not specified) | Threshold-gated (crit/AoE/≥30) | Map 10 wave 10 spam would dilute feedback. |
| Settings UI | (not specified) | Gear → modal (mirrors UpgradeTreeOverlay) | Matches existing overlay infrastructure. |
