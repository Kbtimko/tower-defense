# Phase 9a — Send-Wave-Early Bonus: Design Spec

**Status:** Approved (2026-05-26) — ready for plan.
**Branch:** `feature/phase-9a-send-wave-early` (off `feature/phase-3-tower-system`)
**Scope:** First of three "Strategic Depth" sub-features. Phase 9b (tower/enemy weakness matrix) and Phase 9c (click-to-inspect overlay) are tracked separately and out of scope here.

---

## 1. Motivation

Today the wave button is dead time between waves — the player waits for the last straggler to walk off the path. This sub-feature rewards aggressive play: send the next wave while the previous one's enemies are still alive on the path, and receive a gold bonus proportional to what those enemies were "worth" to skip. Enemies stay on the path, so the player can still kill them for full reward — the strategic tax is on-screen chaos (two waves overlapping).

This is the smallest of the three Strategic Depth additions and is designed to ship as a standalone PR (~1 session).

---

## 2. Trigger Window

The early-send action is available exclusively when:

```
waveMgr.active === true   &&   waveMgr._spawnQ.length === 0
```

In words: the current wave has spawned every enemy from its queue, but `active` has not yet flipped to `false` because at least one enemy is still alive on the path (or `enemies.length > 0`).

Outside this window, the wave button behaves as today:

| Game state | Today's button | Phase 9a button |
|---|---|---|
| Wave spawning (queue non-empty) | `Wave N in progress…` (disabled) | unchanged |
| Wave fully spawned, enemies still on path | `Wave N in progress…` (disabled) | **`▶ Send Wave N+1 (+Xg)` (enabled — this is the change)** |
| All enemies cleared, between-wave pause | `▶ Send Wave N+1` (enabled) | unchanged (no bonus suffix, since path is clear) |
| Final wave complete | `All Waves Done` (disabled) | unchanged |

The change is exclusively in row 2: today the button is locked while stragglers walk; the new behavior is to enable it the moment spawning finishes.

---

## 3. Bonus Formula

```
bonus = floor( 0.5 × Σ enemy.def.reward  for every enemy currently on the path )
```

- Sums the base `reward` from each enemy's `ENEMY_DEFS` entry (does NOT apply the wave's `scaleFactor` — reward is a flat per-type value in this codebase).
- Rounded down to the nearest integer before passing to `economy.earn()`.
- Only enemies currently in `GameScene.enemies` and not yet `dead` are counted.

Awarded as a single `economy.earn(bonus)` call at the moment the button is clicked. The remaining enemies are NOT removed from the path — they continue toward the end and the player still earns their full reward on kill or loses a life on leak. Effective per-straggler reward when survived = 1.5× normal.

---

## 4. UI

### 4.1 Button label

The existing `#wave-btn` element does triple duty. Label rules:

| Condition | Label |
|---|---|
| `done === true` | `All Waves Done` (disabled) |
| `active === true && _spawnQ.length > 0` | `Wave N in progress…` (disabled) |
| `active === true && _spawnQ.length === 0 && enemies.length > 0` | `▶ Send Wave N+1 (+Xg)` (enabled) |
| `active === false` (between waves, path clear) | `▶ Send Wave N+1` (enabled) |

The `(+Xg)` suffix only appears when bonus > 0.

Note: `_updateWaveButton()` today runs only on `create()`, `_startWave()`, and `_checkWaveComplete()`. It does NOT run on enemy death or end-of-path. This sub-feature adds one new call site: at the end of `GameScene._updateEnemies`, after the dead-enemy filter, when `removed > 0` (the `removed` count is already tracked in `_updateEnemies` for combat-music transitions). One extra function call per game tick where at least one enemy died — negligible cost.

### 4.2 Toast feedback

When the player clicks the button in the early-eligible state, a `+Xg` floating toast appears anchored to the wave button (or HUD gold counter) for ~1.5 s, using the existing `GameScene._toast()` helper. This visually confirms the bonus landed.

No additional UI surface: no separate button, no modal, no hold gesture.

---

## 5. Architecture

### 5.1 New API on `WaveManager`

Add a single read-only getter:

```js
get isEarlyEligible() {
  return this.active && this._spawnQ.length === 0;
}
```

No state changes. No new fields.

### 5.2 Changes in `GameScene`

- `_updateWaveButton()` — extend the existing method:
  - When `waveMgr.isEarlyEligible && this.enemies.length > 0`, compute `bonus = floor(0.5 × sum(e.def.reward for e in enemies if !e.dead))` and append `(+${bonus}g)` to the button label. Keep the button enabled.
- `_updateEnemies()` — add one new call site:
  - At the end of the method, after the dead-enemy filter, when `removed > 0` (already tracked for combat-music transitions in Phase 8), call `this._updateWaveButton()`. This drives the live bonus update as enemies die.
- `_startWave()` — extend:
  - Before invoking `waveMgr.startWave()`, check `waveMgr.isEarlyEligible`. If true AND the computed bonus > 0:
    - Compute the bonus (same formula as the label).
    - `this.economy.earn(bonus)`
    - `this._toast(`+${bonus}g`)`
  - Then call `waveMgr.startWave()` as today. The existing `wave-start` SFX (Phase 8 wiring) provides audible feedback for both normal and early sends; the visual toast distinguishes the bonus. The remaining enemies are NOT removed; they continue on the path.
- No change to enemy lifecycle, soldier interaction, or hero behavior.

### 5.3 Data flow

```
enemy dies / leaks                       [user clicks wave button]
       │                                          │
       ▼                                          ▼
_updateEnemies (per-tick)                  GameScene._startWave()
  - filters dead                                  │
  - if removed > 0: _updateWaveButton()           ├─ if waveMgr.isEarlyEligible
                                                  │     && enemies.length > 0
                                                  │     && bonus > 0:
                                                  │     - economy.earn(bonus)
                                                  │     - audio.playSfx('ui-click')
                                                  │     - _toast(`+${bonus}g`)
                                                  │
                                                  └─ waveMgr.startWave()
                                                     (existing path — no change)
```

---

## 6. Edge Cases

| Case | Behavior |
|---|---|
| 0 enemies alive at click (path cleared exactly at click) | `isEarlyEligible` flips to false on the `_checkWaveComplete` tick. Button label drops the `(+Xg)` suffix; click is treated as a normal wave-send (no bonus, no toast). |
| Phantom (flying) enemies at end-of-path | Same as ground enemies — their reward counts toward the bonus while alive. |
| Boss waves (Maps 5 / 10) with active boss-mid / boss-final music | No special handling. The early-send works identically; boss music continues unchanged. |
| Final wave of a map | `waveMgr.done` becomes true after the final wave starts; the button switches to `All Waves Done`. Early-send is never possible from the last wave (because there is no "next" wave). |
| Bonus = 0 (e.g. all remaining enemies somehow have reward 0) | Suffix is hidden, no toast fires, bonus call is skipped. (`economy.earn(0)` would be a no-op anyway, but the explicit guard keeps the toast clean.) |
| Player has UI muted | Toast still shows; SFX is silenced by the existing AudioManager mute. Visual feedback alone is sufficient. |
| Rapid double-click on the button | The first click triggers `_startWave()`. The second click finds `active === true && _spawnQ.length > 0`, so the button has already re-disabled. No double-earn possible. |

---

## 7. Testing Strategy

### 7.1 WaveManager unit (new `WaveManager.test.js` cases)

- `isEarlyEligible` is `false` when `!active`.
- `isEarlyEligible` is `false` while `_spawnQ.length > 0`.
- `isEarlyEligible` is `true` immediately after the last `enemy:spawn` emits but before another `startWave()` call.

### 7.2 GameScene integration (extend existing patterns)

Tests use the standard mocked scene (no Phaser display list). Stub `economy.earn`, `audio.playSfx`, and `_toast`. Provide a stub `waveMgr` exposing the `isEarlyEligible` getter and `startWave()` spy.

- **Bonus path:** `enemies = [{def:{reward:20},dead:false}, {def:{reward:55},dead:false}]`, `waveMgr.isEarlyEligible = true`. `_startWave()` → `economy.earn(37)` called, `_toast('+37g')` called, `waveMgr.startWave()` called.
- **No-bonus path:** `waveMgr.isEarlyEligible = false`. `_startWave()` → `economy.earn` NOT called with a bonus, no toast, `waveMgr.startWave()` still called.
- **Zero-enemy guard:** `waveMgr.isEarlyEligible = true` but `enemies = []`. No `economy.earn` of 0, no toast, only `waveMgr.startWave()` is invoked.
- **Dead-enemy exclusion:** `enemies = [{def:{reward:55},dead:true}]`. Bonus = 0, treated as zero-enemy case above.

### 7.3 _updateWaveButton label states

Drive `waveMgr` and `enemies` through every row of the table in §4.1 and assert the rendered button text matches. Including the live update: simulate an enemy death, confirm the displayed `(+Xg)` drops.

### 7.4 Manual browser verification

- Map 1 (or any map): place a tower, start wave 1, let it spawn, kill a few enemies but leave some walking. Confirm button changes from `Wave 1 in progress…` to `▶ Send Wave 2 (+Xg)` the moment the last enemy spawns.
- Click early. Confirm gold jumps by the displayed amount, toast pops, and the next wave starts spawning while the old enemies finish the path.
- Watch the bonus drop as remaining enemies die naturally — the live label should reflect it.
- Open settings, mute audio, repeat. Toast still appears; SFX silent.

---

## 8. Out of Scope

- Tower/enemy weakness matrix → Phase 9b spec
- Click-to-inspect overlay (hero & enemy stats) → Phase 9c spec
- Persistent stats for "waves sent early" / "early bonus earned"
- Tuning UI / settings panel exposing the 0.5 multiplier
- Achievement-style notification for the player's first early-send
- Different bonus formulas per enemy type beyond the existing reward value (the per-type scaling is naturally baked into `reward`)

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| 0.5 multiplier turns out too generous / too stingy | Single constant in `GameScene._startWave()` — trivial to retune in a follow-up commit. |
| Live label updates cause re-render thrash | `_updateWaveButton()` already runs on the same triggers; this adds one `Array.reduce` over `enemies` (~30 elements max). Cost is negligible. |
| Players don't discover the feature | The label change is in-line with the existing wave button — same screen real estate, same flow, with new content. A tooltip is out of scope for v1; consider a one-time tutorial banner only if usage data later shows zero engagement. |

---

## 10. Acceptance Criteria

The feature ships when:

1. Unit tests in §7.1 and §7.3 pass.
2. Integration tests in §7.2 pass.
3. Manual browser walkthrough in §7.4 passes on a fresh build.
4. `npm test` shows no regression in the existing 215 tests.
5. `npm run build` is clean.
6. PR description includes a short GIF or screenshot of the early-send flow (recommended, not required).
