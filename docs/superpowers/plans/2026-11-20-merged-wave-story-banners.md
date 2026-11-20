# Merged-wave story banners (#59) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A between-wave story banner whose wave was overlapped by the next wave still shows at the next board clear, oldest first, once per level.

**Architecture:** A pure `dueStoryPanels` helper picks every unshown panel at or below the current wave; `StoryManager.getDuePanels` exposes it; `GameScene._checkWaveComplete` shows the due panels one after another, tracking shown waves in a per-level `Set`.

**Tech Stack:** Vanilla JS ES modules, Phaser 3, Vitest 2 + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-20-merged-wave-story-banners-design.md`

## Global Constraints
- No change to `STORY_PANELS` text, `StoryManager.showBanner`/`hideBanner` DOM behaviour, or the simulator.
- A non-merged banner still appears at the clear of its own wave (existing countdown tests must stay green unchanged except the stub addition in Task 2).
- Pure logic lives in `src/systems/`; comments explain why, not what.

## Review Focus
- Two panels due at one clear (map 0 keys 3 and 7, cleared at wave 7) → both show, 3 then 7, countdown held until the last is dismissed. *(Task 2 test)*
- Player sends a wave while the first of two queued panels is up → banner hides; the unshown panel shows at the next clear and the shown one does not repeat. *(Task 2 test)*
- Debug wave jump (`?debug=1&wave=8`) → no stale banners for waves 3/7 at the first clear. *(Task 2 test of `_skipStoryBefore`)*
- Replaying the level (scene re-entry) → banners show again (Set reset in `create()`). *(covered by placement beside `storyMgr` construction; reviewer check)*
- Victory clear with a missed panel → no banner, victory runs as today. *(Task 2 test)*

---

### Task 1: `dueStoryPanels` helper + `StoryManager.getDuePanels`

**Files:**
- Create: `src/systems/storyQueue.js`
- Create: `src/systems/storyQueue.test.js`
- Modify: `src/systems/StoryManager.js` (add method after `getPanelForWave`)
- Test: `src/systems/StoryManager.test.js`

**Interfaces:**
- Produces: `dueStoryPanels(panels: object, storyKey: string, throughWave: number, shown: Set<number>) → Array<{ wave: number, panel: { headline, body } }>` — ascending by `wave`.
- Produces: `StoryManager#getDuePanels(storyKey, throughWave, shown)` → same array, using the manager's `_panels`.

- [ ] **Step 1: Write failing tests** in `storyQueue.test.js`, with `const P = { m: { waves: { 3: {headline:'a',body:''}, 7: {headline:'b',body:''} } } }`:
  - `returns every unshown panel at or below throughWave, oldest first`: `dueStoryPanels(P,'m',7,new Set()).map(d=>d.wave)` → `[3, 7]`; `[0].panel.headline` → `'a'`.
  - `excludes panels above throughWave`: `(P,'m',6,new Set())` → waves `[3]`.
  - `excludes shown waves`: `(P,'m',7,new Set([3]))` → waves `[7]`.
  - `empty for an unknown storyKey or a map without waves`: `(P,'x',9,new Set())` → `[]`; `({ m: {} },'m',9,new Set())` → `[]`.
  - `sorts numerically, not lexically`: panels keyed `{ 10:…, 5:… }`, throughWave 10 → `[5, 10]`.
  - In `StoryManager.test.js`: `getDuePanels delegates to the panels it was built with` — `new StoryManager(PANELS).getDuePanels('map_a', 5, new Set())` → `[{ wave: 3, panel: PANELS.map_a.waves[3] }]`; with `new Set([3])` → `[]`.
- [ ] **Step 2:** `npx vitest run src/systems/storyQueue.test.js src/systems/StoryManager.test.js` → FAIL (module / method missing).
- [ ] **Step 3:** Implement both (object keys are strings — convert with `Number`).
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit `feat(story): pick every unshown between-wave panel up to a wave (#59)`.

### Task 2: GameScene shows due panels in sequence

**Files:**
- Modify: `src/scenes/GameScene.js` — `create()` (beside `this.storyMgr = new StoryManager(...)`, ~:260), `_checkWaveComplete` (~:898), `applyDebugCapture` (~:155)
- Modify: `src/scenes/GameScene.countdown.test.js` — `frameScene` stub gains `getDuePanels: () => []`; harness sets `_storyShown: new Set()`
- Test: `src/scenes/GameScene.countdown.test.js` (new `describe('merged-wave story banners (#59)')`)

**Interfaces:**
- Consumes: `StoryManager#getDuePanels` (Task 1).
- Produces: `GameScene#_storyShown: Set<number>`; `GameScene#_skipStoryBefore(wave: number)` — adds every panel key `< wave` for this map to `_storyShown`.

Behaviour of `_checkWaveComplete` non-victory branch: `due = storyMgr.getDuePanels(map.storyKey, waveMgr.currentWave, _storyShown)`. Empty → `_updateWaveButton()` as today. Otherwise `_countdown.hold()` and show `due[0]` (add its wave to `_storyShown` when shown); its dismiss shows the next; after the last dismiss → `_countdown.resume(); _updateWaveButton()`. `applyDebugCapture` calls `scene._skipStoryBefore(wave)` before `_startWave()`.

- [ ] **Step 1: Write failing tests** (map 0, `realStory: true`; keys are 3 and 7). Dismiss = `$('story-dismiss').click()`. Clear the board = `scene.enemies = []` then `scene.update(0, 16)`.
  - `a wave overlapped by the next still gets its banner`: send wave 3 holding the board; send wave 4 (`scene._startWave()` after spawns finish); spawn all, clear → banner visible with `$('story-headline').textContent === STORY_PANELS[key].waves[3].headline`.
  - `a shown banner does not repeat`: after the above, dismiss; send/clear wave 5 → banner not visible.
  - `two due banners show oldest first and hold the countdown until the last`: jump to wave 7 (`sendAndSpawnAll(scene, 7, { keepBoard: false })`) → headline is wave 3's, `scene._countdown.held === true`; dismiss → headline is wave 7's, still held; dismiss → not visible, `held === false`.
  - `sending mid-sequence defers the rest to the next clear`: jump to 7 and clear (wave 3 banner up); `scene._startWave()` → banner hidden; spawn all, clear → headline is wave 7's; dismiss; next clear shows nothing.
  - `_skipStoryBefore marks earlier waves shown`: `scene._skipStoryBefore(8)` then jump to 8 and clear → banner not visible.
  - `a victory clear shows no banner`: set `scene._onVictory = vi.fn()`; jump to the final wave (`sendAndSpawnAll(scene, MAP_WAVES[0].length, { keepBoard: false })`) → `scene._onVictory` called once and banner not visible.
- [ ] **Step 2:** `npx vitest run src/scenes/GameScene.countdown.test.js` → new tests FAIL (first one shows no banner).
- [ ] **Step 3:** Implement per the behaviour above; add the stub/harness fields.
- [ ] **Step 4:** Same command → PASS; then `npm test` → whole suite exit 0.
- [ ] **Step 5:** Mutation check: make `_checkWaveComplete` use only `due.at(-1)` → the overlap and two-banner tests fail; restore.
- [ ] **Step 6:** Commit `fix(story): a merged wave's banner shows at the next clear (#59)`.
