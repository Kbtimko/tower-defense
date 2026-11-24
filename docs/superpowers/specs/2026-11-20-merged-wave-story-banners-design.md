# Merged-wave story banners (backlog #59) — design

**Status:** approved 2026-11-20 (short design, small change).

## Intent
Mid-level story banners (`STORY_PANELS` in `src/data/story.js`, e.g. map 5's
"Warning — Wave 5: TITAN-class organism on approach") must not be lost when
waves overlap. Today `GameScene._checkWaveComplete` looks up only the panel
keyed to `waveMgr.currentWave` at the moment the board empties. When auto-send
(#51) or an early Send Wave starts wave N+1 before wave N clears, the board
clears once at N+1 and panel N is never looked up. Affects every map
(panels at 3/7, 4/8, 4/9, 5/10, 5/11, 6/12).

## Goals
- Every panel whose wave has been reached is shown at a board clear, oldest first.
- Each panel shows at most once per level attempt.

## Non-goals
- No change to banner text, styling, or `StoryManager`'s DOM behaviour.
- No change to when a non-merged banner appears (still at the clear of its wave).
- No change to the simulator (it has no story banners).

## Anti-goals
- Stale banners on a debug wave jump (`?debug=1&wave=W`) — the capture harness
  uses it, and a banner holds the countdown.
- A banner left open over a running wave (sending a wave already hides it, spec S1 of #51).

## Approaches
- **Queue every due panel at the next clear (picked).** Fixes the loss with the
  least behaviour change.
- Show only the newest due panel — still loses warnings.
- Show panels at wave *start* instead of clear — changes when every banner appears.

## Design
- New pure helper `src/systems/storyQueue.js`:
  `dueStoryPanels(panels, storyKey, throughWave, shown)` → ordered array of
  `{ wave, panel }` for every key `k` with `k <= throughWave` and `!shown.has(k)`,
  ascending by `k`. Unknown `storyKey` / no `waves` → `[]`.
- `GameScene`: `this._storyShown = new Set()` reset in `create()` beside `storyMgr`.
- `_checkWaveComplete` (non-victory branch): compute due panels; if none, behave as
  today. Otherwise hold the countdown and show them in sequence — add each wave to
  `_storyShown` when it is displayed; each dismiss shows the next; after the last,
  resume the countdown and `_updateWaveButton()`.
- A wave sent mid-sequence hides the banner (existing behaviour); undisplayed
  panels stay out of `_storyShown`, so they show at the next clear.
- Debug wave jump (`GameScene.js` ~:157, `currentWave = wave - 1`): add every
  panel key `< wave` to `_storyShown` first.
- Victory clear: no banners (unchanged); the epilogue takes over.

## Left to the builder
- Exact placement of the sequencing code (inline closure vs a small method).
