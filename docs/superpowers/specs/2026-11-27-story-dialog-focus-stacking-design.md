# Story dialog: focus after a Story Log replay, and stacking — design (#55 a, b)

**Backlog:** #55 `[auto]` (3.5 story-dialog follow-ups), sub-items (a) and (b). Self-approved under the `[auto]` rule. (c, d, e) were triaged as not worth it on 2026-11-27.

## The asks, literally

> (a) The Story Log replay returns focus to `<body>`; fall back to `#open-story-log` for keyboard users.
> (b) The inspector panel (z 40), `.story-banner` (z 25) and the wave preview (z 19) can sit above a victory epilogue (z 18) if they're open when victory fires. This predates 3.5.

## Verified in the code (2026-11-27)

**(a)**
- `MapSelectScene._bindStoryLog` builds one `.story-log-entry` button per seen beat. A click hides `#story-log-overlay` and calls `this._storyDialog.play(id, () => {})`.
- `StoryDialogOverlay.play` saves `document.activeElement` (the clicked entry) as `_returnFocus`. `_restoreFocus` focuses it on close.
- In a browser, the entry is inside a `display:none` overlay, so `focus()` does nothing. The dialog's own Next button is then hidden, so focus falls to `<body>`. The comment on `_restoreFocus` describes this exact case.
- jsdom doesn't do layout, so there the entry button keeps focus. Either way, focus doesn't land on `#open-story-log`.

**(b)**
- `#game` is `position: relative` with no `z-index`, so it creates no stacking context. `#story-dialog` (z 18) inside it stacks against the page root, alongside these body-level elements:
  - `.inspector-panel` (z 40: the enemy, hero and tower inspectors);
  - `#inspect-peek` (45);
  - `#tower-tooltip` (50);
  - `.ability-card` and `#hint-peek` (21).
- Its siblings inside `#game` stack against it the same way:
  - `.story-banner` (25);
  - `.game-toast` and `#paused-overlay` (30);
  - `#game-msg` and `#codex-overlay` (20);
  - `.rs-overlay` (26).
- **The wave preview claim is wrong.** `#wave-preview` sits inside `#hud-layer` (z 6, a stacking context), so it is already below the dialog.
- `GameScene._onVictory` plays the epilogue first. `_showResults`, which hides the tooltip, inspector, peek and wave preview, runs only after the epilogue closes. The story banner, ability card and hint peek are never hidden at all.
- The same dialog element also plays mid-level and world-map beats, so this isn't only a victory problem.

## Design

**(a)** In the entry's click handler, call `openBtn.focus()` before hiding the list. `play()` then records `#open-story-log` as the return target, and the dialog's existing restore puts focus back there. Fix the stale example in the `_restoreFocus` comment.

**(b)** Raise `.story-dialog-overlay` to `z-index: 55`. It's a modal that covers the screen and traps Tab, so nothing from the page should paint over it.
- 55 is above every in-page floater (the highest is 50).
- It stays below `#title-screen` (60) and `#rotate-prompt` (1000), which are meant to cover everything.
- A CSS test derives every z-index in `index.html` and fails if any rule other than those two is ≥ the dialog's. A future floater can't slip above it unnoticed.

## Approaches

1. **(b) Raise the dialog's z-index, with a derived guard test (chosen).** One value fixes every play, including the victory epilogue, mid-level beats and the world map. It also covers floaters that the victory path never hides (the story banner, ability card and hint peek).
2. (b) Hide the level's floaters at victory, by moving `_showResults`'s hide block ahead of the epilogue and adding the banner and cards. That fixes only the victory epilogue, and every new floater has to remember to join the list.
3. (a) Add a `returnFocus` option to `StoryDialogOverlay.play`. It's more API for the same result as focusing the opener first.

## Rulings (mine)

- **z 55, above `#fps-meter` (50).** The debug FPS meter is covered while a dialog is up. If wrong: allowlist it in the test and pick 51.
- **The dialog is also above `.rs-overlay` (26).** The two never show together: results open from the epilogue's onComplete. If wrong: nothing visible changes.
- **The wave preview item is closed as already fine.** It's in `#hud-layer`.
- **No victory-time hiding.** Under a modal at the top of the stack, an open inspector is simply covered, and `_showResults` still clears it before results appear.

## Edge cases

| Case | Expected |
|---|---|
| (a) Story Log entry clicked, replay finished with Skip | focus on `#open-story-log` |
| (a) the same, with the replay finished by keyboard (Escape or Enter to the end) | focus on `#open-story-log` |
| (a) entries list reopened afterwards | rebuilt as before (unchanged) |
| (b) inspector, peek, tooltip, banner, ability card or hint peek open when the epilogue plays | covered by the dialog |
| (b) title screen and rotate prompt | still above the dialog |
| (b) a new rule with z ≥ 55 added later | the CSS test fails |
