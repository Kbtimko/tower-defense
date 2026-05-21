# In-Level Exit Button — Design Spec

_Date: 2026-05-20_
_Backlog item #2 (`.claude/notes.md`)_
_Branch: `feature/in-level-exit-button` (off `feature/phase-7-meta-persistence`)_

## Goal

Let the player abandon a level mid-game and return to `MapSelectScene`. Today
the only way out of an in-progress level is to win or lose — there is no
voluntary exit.

Bundled with this feature: fix two known DOM-leak bugs that share the
`GameScene → MapSelectScene` transition path, since the new Exit button
exercises that exact path.

## Scope

In scope:

- An "Exit" button in the in-game bottom bar.
- A confirmation step before the player leaves a run.
- Hiding `#tower-panel` and `#game-msg` on `GameScene` teardown (bug fixes).
- Tests for the `GameScene.shutdown()` DOM-cleanup behavior.

Out of scope:

- Saving / resuming an abandoned run (exit discards level progress).
- Any change to the Victory/Defeat flow beyond resetting shared dialog state.

## Components

### 1. Exit button (`index.html`, `#bottom-bar`)

Add `<button id="exit-btn">⏻ Exit</button>` immediately before `#wave-btn`
in `#bottom-bar`.

Layout: `#wave-btn` currently carries `margin-left: auto`, which right-packs
it. Move `margin-left: auto` off `#wave-btn` and onto `#exit-btn` so the two
buttons group together at the right edge, Exit immediately left of Send-Wave.

Styling: a muted/neutral button (dark background, subtle border — visually in
the family of `#speed-btn`), deliberately quieter than the prominent red
`#wave-btn` CTA so it does not invite a stray click.

### 2. Confirmation dialog (`#game-msg`)

The existing `#game-msg` centered modal holds a title (`#msg-title`), body
(`#msg-body`), and one button (`#msg-btn`). It is reused for the exit
confirmation by adding a second button.

Markup change: add `<button id="msg-cancel-btn">` after `#msg-btn`, hidden by
default (`display: none`).

The dialog now serves two modes:

| Mode | `#msg-title` / `#msg-body` | `#msg-btn` | `#msg-cancel-btn` |
|---|---|---|---|
| Victory / Defeat (existing) | "🏆 Victory!" / "💀 Defeat" + body | "↩ Map Select" | hidden |
| Exit confirm (new) | "Abandon level?" / "Progress on this level will be lost." | "Abandon Level" | "Cancel" (shown) |

Both the Victory path and the Exit-confirm "Abandon Level" button navigate to
`MapSelectScene`, so `#msg-btn`'s existing click handler
(`this.scene.start('MapSelectScene')`) is reused unchanged for both modes —
only its label text differs.

`#msg-cancel-btn` click handler: hide `#game-msg` (return to the level).

### 3. `GameScene` wiring

`_bindDOMEvents()` — add two listeners:

- `#exit-btn` → `_showConfirmExit()`
- `#msg-cancel-btn` → hide `#game-msg`

`_showConfirmExit()` (new method):

- `#msg-title` = "Abandon level?"
- `#msg-body` = "Progress on this level will be lost."
- `#msg-btn` text = "Abandon Level"
- show `#msg-cancel-btn`
- show `#game-msg`

State-leak guard: `_showVictoryOverlay()` and `_onDefeat()` must explicitly
set `#msg-btn` text back to "↩ Map Select" and hide `#msg-cancel-btn` before
showing the dialog. Without this, a player who opens the exit dialog, cancels,
and later wins/loses would see a stale "Abandon Level" / "Cancel" pair.

### 4. `GameScene.shutdown()` — DOM-leak fixes

`shutdown()` currently hides `#hud` and `#bottom-bar`. Two GameScene DOM
elements are left visible and leak onto subsequent scenes:

- **Bug A:** `#tower-panel` — if a tower's detail panel is open at scene
  transition, it stays visible on `MapSelectScene`.
- **Bug B:** `#game-msg` — the Victory/Defeat box stays visible and floats on
  top of the Command Doctrine upgrade overlay (`#game-msg` z-index 20 >
  `#upgrade-overlay` z-index 15).

Fix: in `shutdown()`, also set `display: none` on `#tower-panel` and
`#game-msg`.

Listener cleanup: `shutdown()` removes DOM listeners by cloning each node in a
hardcoded id list. Add `exit-btn` and `msg-cancel-btn` to that list so the new
listeners are removed on teardown.

## Data Flow

```
In-level → click #exit-btn → _showConfirmExit()
                                  ├─ #msg-btn "Abandon Level" → scene.start('MapSelectScene')
                                  └─ #msg-cancel-btn "Cancel"  → hide #game-msg (resume level)

scene.start('MapSelectScene') → GameScene.shutdown()
   → hide #hud, #bottom-bar, #tower-panel, #game-msg
   → clone-clean listeners incl. exit-btn, msg-cancel-btn
```

## Error Handling / Edge Cases

- **Stray click:** the Exit button never leaves the run directly; it only
  opens the confirm dialog. Leaving requires a second deliberate click.
- **Game runs under the dialog:** `_showConfirmExit()` calls `this.scene.pause()`
  so enemies, waves, and timers freeze while the player decides — this also
  prevents a victory/defeat from firing and overwriting the confirm dialog.
  The Cancel handler calls `this.scene.resume()`; the Abandon path navigates
  away via `scene.start()`, which supersedes the paused state.
- **Exit after the game is already over:** `_showConfirmExit()` early-returns
  when `this.over || this.won` is set. Once `#game-msg` shows the Victory/Defeat
  result, the Exit button is inert — it cannot revert the endgame dialog back
  to the abandon-confirm prompt.
- **Cancelled exit then win/loss:** handled by the state-leak guard resetting
  `#msg-btn` text and hiding `#msg-cancel-btn`.

## Testing

New test file `src/scenes/GameScene.shutdown.test.js` (vitest + jsdom):

- Build a DOM fixture containing `#hud`, `#bottom-bar`, `#tower-panel`,
  `#game-msg`, and the cloned-id buttons.
- Instantiate `GameScene` (or a minimal instance exposing `shutdown` with the
  properties `shutdown()` reads stubbed: `game.events.off`, `_onAbility`).
- Assert after `shutdown()`:
  - `#hud`, `#bottom-bar`, `#tower-panel`, `#game-msg` all have
    `display: none`.
  - `#exit-btn` and `#msg-cancel-btn` listeners are removed (verify the node
    was replaced via clone — e.g. a listener registered before `shutdown()`
    no longer fires after).

The implementation plan will resolve the exact instantiation/stubbing approach
against the existing vitest setup.

## Verification

Browser-verify end to end:

1. Start a level, place a tower so `#tower-panel` is open, click **Exit** →
   confirm dialog appears → **Abandon Level** → land on `MapSelectScene` with
   no leftover `#tower-panel` or `#game-msg`.
2. Start a level, click **Exit** → **Cancel** → dialog closes, level resumes.
3. Victory path: beat a map → Victory dialog shows the single "↩ Map Select"
   button (no stray Cancel) → open the Upgrades overlay → no leftover
   `#game-msg`.

## Follow-up

After merge, update `.claude/notes.md`: move backlog item #2 to Completed and
strike the two Known Bugs (`#tower-panel` leak, `#game-msg` leak).
