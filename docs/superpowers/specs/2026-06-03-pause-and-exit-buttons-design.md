# Design Spec: In-Level Pause & Exit Buttons

**Date:** 2026-06-03
**Author:** Claude (with Keith Timko)
**Branch target:** `feature/phase-3-tower-system` (integration line)
**Backlog item:** #9 — In-level Exit button missing (PR #8 regression), expanded to add a Pause button.

---

## 1. Motivation

Two HUD chrome buttons are missing from in-level play on the integration line:

1. **Exit button (regression).** PR #8 shipped `⏻ Exit` + confirm-modal Cancel button + scene pause-on-confirm + a DOM-leak fix for `#tower-panel`/`#game-msg` on `GameScene.shutdown()`. PR #8 was merged into the then-stale `feature/phase-7-meta-persistence` branch, not into `feature/phase-3-tower-system`. Result: `feature/phase-3-tower-system` (the production integration line) never received these four commits, so the in-level Exit button does not exist in shipped builds.

2. **Pause button (new).** Players have no way to stop the action mid-level without exiting. A pause button has been a frequently-requested control.

Both ship in one PR because the wiring overlaps (both use `scene.pause()`/`scene.resume()`), the chrome touches the same HUD region, and the Exit confirm needs to interact with user-pause state.

---

## 2. Goals & Non-Goals

### Goals
- Restore PR #8 functionality (Exit + Cancel + scene pause-on-confirm + game-over guard + DOM-leak fix) on `feature/phase-3-tower-system`.
- Add a Pause toggle button in the top HUD with semi-transparent `PAUSED` overlay and keyboard `Space` shortcut.
- Land both as a single PR using `superpowers:subagent-driven-development`.
- Keep test coverage at parity (port PR #8's `GameScene.shutdown.test.js` + add new pause-toggle tests).

### Non-Goals
- Redesigning `#speed-btn`'s existing `⏸ 1x` glyph (it shares the ⏸ icon with the new Pause button — accepted, the labels differ and they sit in different contexts).
- Persisting pause across reloads / page navigation.
- Auto-pausing on tab blur.
- Coupling `SettingsOverlay` to pause (Settings already opens over a running scene; the new Pause button is independent).
- Pausing the UI/HUD itself (Phaser's `scene.pause()` only halts the Game scene loop; HUD remains visible and clickable, matching PR #8's existing Exit-confirm behavior).

---

## 3. Background

### 3.1 Current state of integration

Confirmed via `git branch --contains` and source inspection:

- Commits `6af2e49`, `2c96b2f`, `6c37981`, `6d811d0` exist only on `feature/in-level-exit-button` and `origin/feature/phase-7-meta-persistence`.
- `origin/feature/phase-3-tower-system`'s `index.html` contains no `#exit-btn` or `#msg-cancel-btn`.
- `origin/feature/phase-3-tower-system`'s `GameScene.shutdown()` (lines 180–199) does NOT hide `#tower-panel` or `#game-msg` and does NOT clean up `exit-btn`/`msg-cancel-btn` listeners.
- The integration `shutdown()` has gained new cleanup logic since PR #8: `_sentries[]` teardown, `_areaEffects.destroyAll()`, `damageNumbers.destroy()`, `shakeCtl.destroy()`, `audio.stopMusic(500)`. These must be preserved by the port.

### 3.2 Why raw `git cherry-pick` is wrong

`shutdown()` has diverged. A raw cherry-pick of `2c96b2f` will conflict on the cleanup list and display-none block; the test file `GameScene.shutdown.test.js` does not mock the new cleanup paths (`_sentries`, `_areaEffects`, etc.) and will fail at runtime when its mock scene doesn't define them. **Implementation will port hunks manually via Edit operations rather than `git cherry-pick`.**

### 3.3 Existing pause precedents

- **Exit confirm (PR #8):** `_showConfirmExit()` calls `this.scene.pause()`; Cancel button calls `this.scene.resume()`.
- **`SettingsOverlay`:** does not call `scene.pause`. The game keeps running behind the overlay.
- **Speed button:** `_onSpeedToggle()` flips `_speedFast` and emits `ui:speed-toggle`; uses `⏸ 1x` / `⏩ 2x` labels. Independent of pause.

---

## 4. Component Inventory

### 4.1 DOM additions in [index.html](index.html)

| Element | Location | Notes |
|---------|----------|-------|
| `#exit-btn` | Bottom bar, before `#wave-btn`, with `margin-left: auto` | PR #8 port. Muted red styling (`#2a1a1a` bg, `#6a4a4a` border). |
| `#msg-cancel-btn` | Inside `#game-msg`, after `#msg-btn`, `display:none` by default | PR #8 port. Grey styling (`#333` bg). |
| `#pause-btn` | Inside `#hud`, after `#speed-btn` | New. Same compact button styling as `#speed-btn`. Initial text `⏸ Pause`. |
| `#paused-overlay` | Inside `#game`, absolute-positioned, full-canvas | New. Semi-transparent black background (`rgba(0,0,0,0.55)`), centered `PAUSED` text in large white type, `z-index: 30` (above story-banner, below modals). `display:none` by default. `pointer-events: none` so the user can still click `#pause-btn` (and any other HUD chrome) without the overlay intercepting. Space key and the Pause/Resume button are the two ways to resume. |

CSS additions ported from PR #8 plus new rules for `#pause-btn` and `#paused-overlay`.

### 4.2 [src/scenes/GameScene.js](src/scenes/GameScene.js)

| Symbol | Change | Source |
|--------|--------|--------|
| `create()` event-listener block | Add `exit-btn` click → `_showConfirmExit()`; add `msg-cancel-btn` click → hide modal + conditional `scene.resume()`; add `pause-btn` click → `_onPauseToggle()`. | PR #8 port + new |
| `_showConfirmExit()` | New method. Game-over guard → `scene.pause()` → set modal title/body/buttons → show modal. | PR #8 port (`6c37981` + `6d811d0`) |
| `_onPauseToggle()` | New method. Game-over guard → flip `_userPaused` → `scene.pause/resume` → toggle overlay display + button text. | New |
| `_userPaused` instance flag | New. Initialized `false` in `create()` — Phaser runs `create()` on every scene mount, so this resets per level. | New |
| `_onVictory` / `_onDefeat` | Reset `msg-btn` text to `'↩ Map Select'`, hide `#msg-cancel-btn`. | PR #8 port (`6c37981`) |
| `shutdown()` | Extend the clone-replace listener id list with `msg-cancel-btn`, `exit-btn`, `pause-btn`; add `display:none` for `#tower-panel`, `#game-msg`, `#paused-overlay`. **Preserve existing cleanup of `_sentries`, `_areaEffects`, `damageNumbers`, `shakeCtl`, `audio.stopMusic`.** | PR #8 port (`2c96b2f`) + new |

### 4.3 [src/scenes/UIScene.js](src/scenes/UIScene.js)

| Symbol | Change |
|--------|--------|
| `_onKeyDown` | Extend the existing Q/W/E key handler with a `Space` (or `' '`) key branch that emits `ui:pause-toggle` (existing INPUT/TEXTAREA guard already covers typing context). |

UIScene does NOT attach a click listener to `#pause-btn` and therefore does NOT add it to its `shutdown` clone-replace list. Only GameScene owns the button's click handler.

### 4.4 Event added to `this.game.events`

| Event | Emitter | Listener | Payload |
|-------|---------|----------|---------|
| `ui:pause-toggle` | UIScene (Space key) | GameScene `_onPauseToggle` | none |

GameScene also has a direct `#pause-btn` click handler invoking `_onPauseToggle()`, so the Space key and click route through the same method.

### 4.5 Tests

**Ported (adjusted for current integration shape):**

- `src/scenes/GameScene.shutdown.test.js` — verify `#hud`, `#bottom-bar`, `#tower-panel`, `#game-msg`, `#paused-overlay` all hidden; `exit-btn`, `msg-cancel-btn`, `pause-btn` listeners cloned away. Must include `scene._sentries = []`, `scene._areaEffects = { destroyAll(){} }`, `scene.damageNumbers = null`, `scene.shakeCtl = null` in `makeScene()` to satisfy the integration `shutdown()` body, and the registry stub must return either `undefined` or `{ stopMusic(){} }` for the audio lookup.

**New:**

- `_onPauseToggle()` unit tests — toggle flips `_userPaused`; calls `scene.pause()` when entering paused; calls `scene.resume()` when leaving paused; updates `#pause-btn` text between `⏸ Pause` and `▶ Resume`; toggles `#paused-overlay` display.
- Game-over guard — `_onPauseToggle()` early-returns when `this.over === true` or `this.won === true`; pause-btn click is a no-op.
- Exit-Cancel × user-pause interaction — when `_userPaused === true`, clicking `msg-cancel-btn` hides the modal but does NOT call `scene.resume()` (game stays paused).
- Space key in UIScene — `Space` keydown emits `ui:pause-toggle`; typing in an INPUT element does not emit.

---

## 5. Data Flow

### 5.1 User-initiated pause

```
User clicks #pause-btn  OR  presses Space
            │
            ▼
GameScene._onPauseToggle()
            │
            ├── if (this.over || this.won) return;
            ├── this._userPaused = !this._userPaused;
            ├── if (this._userPaused):
            │        this.scene.pause();
            │        document.getElementById('paused-overlay').style.display = 'block';
            │        document.getElementById('pause-btn').textContent = '▶ Resume';
            └── else:
                     this.scene.resume();
                     document.getElementById('paused-overlay').style.display = 'none';
                     document.getElementById('pause-btn').textContent = '⏸ Pause';
```

### 5.2 Exit-confirm flow with user-pause awareness

```
User clicks #exit-btn
            │
            ▼
GameScene._showConfirmExit()
            │
            ├── if (this.over || this.won) return;
            ├── this.scene.pause();                       (no-op if already paused)
            ├── set msg-title = 'Abandon level?'
            ├── set msg-body  = 'Progress on this level will be lost.'
            ├── set msg-btn   = 'Abandon Level'
            ├── show #msg-cancel-btn
            └── show #game-msg

User clicks #msg-btn ('Abandon Level')
            │
            ▼
scene.start('MapSelectScene')           (existing handler, unchanged)

User clicks #msg-cancel-btn
            │
            ├── hide #game-msg
            └── if (!this._userPaused) this.scene.resume();
```

### 5.3 Edge-case interaction matrix

| Scenario | Behavior |
|----------|----------|
| User pauses, then clicks Exit | `_userPaused === true`. Exit pause is a no-op (already paused). Cancel → modal hides, scene stays paused, Pause button still says ▶ Resume. User clicks ▶ Resume → scene resumes. ✓ |
| User clicks Exit, then clicks Pause from modal-open state | Pause toggle flips `_userPaused → true` (scene already paused — no-op). User clicks ▶ Resume → `_userPaused → false`, `scene.resume()` called, game un-pauses while Exit modal is still showing. Then user clicks Cancel → modal hides, no resume (already running). Slightly weird but legal. **Not a recommended UX path but no broken state.** |
| Player wins/loses while paused | Impossible — `scene.pause()` halts the update loop; `_dealDamage`/`_endWave` cannot fire. The only way `over`/`won` becomes true is via the update loop. |
| Space key pressed while typing in upgrades/settings inputs | Existing UIScene `_onKeyDown` guard (`e.target.tagName === 'INPUT' \|\| 'TEXTAREA'`) skips emission. ✓ |
| User pauses, then page reload / scene shutdown | `shutdown()` clones away listeners and hides `#paused-overlay`. `_userPaused` is a per-mount field — implicitly cleared. New scene mount starts unpaused. ✓ |
| Game-over (over/won) reached | `_onPauseToggle` early-returns; `_showConfirmExit` early-returns. Both buttons get a `disabled` style applied in `_onVictory`/`_onDefeat`. |

---

## 6. Error Handling

- All DOM lookups (`getElementById`) inside the new methods are for IDs we add in the same change-set. If an element is missing, the developer has a code bug; intentional fallback is not warranted.
- `scene.pause()` / `scene.resume()` are Phaser primitives — no error path.
- The shutdown clone-and-replace pattern is idempotent (cloning an already-replaced node is harmless).

---

## 7. Testing Strategy

### 7.1 Unit (Vitest + jsdom)

All new tests live next to the code they cover. Mock `phaser` with the same `Scene` + `GameObjects.Container` shim used by the existing `GameScene.shutdown.test.js` and other GameScene tests.

- `GameScene.shutdown.test.js` (ported + adapted): hud/bottom-bar/tower-panel/game-msg/paused-overlay all hidden; exit-btn/msg-cancel-btn/pause-btn listeners cloned; `_sentries`/`_areaEffects` paths exercised via stubs.
- `GameScene.pause.test.js` (new): pause toggle state machine; button text + overlay visibility transitions; `scene.pause`/`scene.resume` call counts; game-over guard; Exit-Cancel × user-pause interaction.
- `UIScene` Space key test (new, or fold into an existing `UIScene.test.js` if one exists): `Space` keydown emits `ui:pause-toggle`; INPUT-target keydown does not.

### 7.2 Browser verification (manual via `npm run dev`)

Required checks before opening the PR:

1. Start a level → click `⏻ Exit` → confirm modal appears, game is paused → click Cancel → modal hides, game resumes.
2. Start a level → click `⏻ Exit` → click `↩ Abandon Level` → MapSelectScene loads, no leaked `#tower-panel` or `#game-msg`.
3. Start a level → click `⏸ Pause` → game freezes, `PAUSED` overlay visible, button text becomes `▶ Resume` → click `▶ Resume` → unfreezes, overlay hides.
4. Press `Space` to toggle pause same as click. Press while focused in any text input (none exist in-game, so this is the SettingsOverlay or Upgrades context) → no toggle.
5. Pause, open SettingsOverlay (gear button or wherever it lives in-game) → settings overlay shows over PAUSED overlay → close settings → game stays paused. Click Resume → unfreezes.
6. Pause, click Exit → confirm modal shows over PAUSED overlay → Cancel → modal hides, game stays paused (Resume button still shows ▶ Resume).
7. Lose a wave → `_onDefeat` runs → Pause and Exit buttons both visually disabled, clicks are no-ops, keyboard Space also no-op.

---

## 8. Branch & Delivery

- **Source branch:** `feature/in-level-pause-button` off `origin/feature/phase-3-tower-system` (verified via `git rebase --onto` per branch-base-verification memory).
- **Worktree:** `~/.config/superpowers/worktrees/tower-defense/feature/in-level-pause-button`.
- **Execution:** `superpowers:subagent-driven-development` (per the always-subagent feedback memory).
- **PR target:** `feature/phase-3-tower-system`.
- **PR title:** `feat(ui): in-level Pause + Exit buttons (PR #8 port + new pause)`.

---

## 9. Open Questions / Deferred

- Whether to apply the same `disabled` visual treatment to `#exit-btn` on game-over as the new pause-btn. PR #8 only added the logic guard, not the visual disable. **Decision:** add the visual disable to both buttons in this PR — small UX win, minimal extra code, consistent.
- Whether `Esc` should also close the pause overlay (in addition to Space). **Decision:** no. Esc is associated with closing modals; if SettingsOverlay or future modals add Esc handling, a shared Esc-binding gets messy. Space is the canonical pause key in TD games; keep it focused.
