# Results Screen + Stars (roadmap 3.6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the victory/defeat `#game-msg` panel with an action-comic results screen (banner, stars, stat chips, speaker caption, NEXT MISSION / RETRY / WORLD MAP), move the star rule into data, and save per-map best records (save v5).

**Architecture:** Pure rule/presentation modules in `src/systems/` (stars, records, timeline, flow, model, exit payload, layout audit) and tunables/copy in `src/data/results.js`. One thin DOM module `src/ui/ResultsScreen.js` plus a module-level `src/ui/gestureTail.js`. GameScene and MapSelectScene only wire them. The capture harness proves the input rules with real input.

**Tech Stack:** Phaser 3.88, Vite 5, Vitest 2 + jsdom, Playwright (capture harness), plain ES modules.

**Spec:** `docs/superpowers/specs/2026-10-25-results-screen-design.md`. Every task cites the spec sections it implements. Executors read those sections; the spec holds the exact copy, the line pool, the timing values and the CSS look. This plan does not repeat them.

## Global Constraints

- Work in `/Users/keithtimko/projects/tower-defense/.claude/worktrees/matrix-idle-1024`, branch `visual/3.6-results-stars`. The PR targets `visual/integration`. Never touch the primary checkout.
- **Prerequisite (verified 2026-10-26):** the stale-save fix is in this branch (`6594d06`, via #115). `SaveManager._refresh()` exists, and all six mutators call it first. New mutators must call `this._refresh()` first too.
- **The star rule is byte-for-byte today's:** `p >= 0.8 ? 3 : p >= 0.5 ? 2 : 1`, with `p = lives / MAPS[mapId].startLives`.
- **Tunables and copy go in `src/data/`. Pure logic goes in `src/systems/` and takes data as default parameters** (`rule = STAR_RULE`, `lines = RESULT_LINES`, `maps = MAPS`).
- **Results CSS:**
  - Paint only with `var(--ui-*)`. Ink is `var(--ui-bevel-lo)`.
  - Lengths are `calc(N * var(--ui-u))`.
  - No hex, no named colours, and no colour functions except `rgba(0,0,0,a)`.
  - Animate `translate`/`scale`/`rotate`/`opacity`, never `transform`.
  - A resting `.rs-reveal` element never sits at `opacity:0`/`visibility:hidden`.
- **Guards that must stay green:** `themeCss`, `kitRollout`, `noNativeTitles`, `railCss`, `typeFloor`, `storyDialogCss`, `worldMapCss`. Plus the new `resultsCss`.
- No `title=` in markup, and no `.title =` / `setAttribute('title'` in JS. The model field is `bannerText`.
- **No `setTimeout`/`setInterval` in results code.** Guards compare timestamps from the injected `now()`.
- **Listeners:**
  - Wire and unwire every listener as a named pair.
  - Scene events use `once('shutdown')`, never an inline arrow.
  - Tap swallows cover `pointerdown`, `pointerup`, `touchstart`, `touchend` and `click`, registered `{ capture: true, passive: false }`.
- **Tests that import Phaser-dependent modules** must `vi.mock('phaser')` (existing pattern in `src/scenes/*.test.js`).
- **Every new test is mutation-checked:** break the code on purpose, watch that specific test fail, restore. The task report names the mutation and the test that failed.
- **Every task ends with** `npx vitest run`, its full output captured to a file with no `| tail`/`| head`, plus the exit code checked and the counts reported. Baseline: 189 files / 3055 tests.
- **Commits:** Conventional Commits, explicit paths only (never `git add -A`/`.`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

Failure modes the spec implies but its tests don't pin. Each has a test in the task named.

1. **RETRY after playing at 2×.** `create()` resets `this.speed = 1` and the Pause button (`_resetPauseButton`). It does **not** reset `#speed-btn`'s text, and shutdown's clone keeps "⏸ 1x". The retried level must show `⏩ 2x` at 1× speed. This bug predates 3.6, but RETRY makes it a one-tap repro. → Task 6.
2. **Phaser's window-level keyboard** (tower hotkeys, Space pause, hero Q/W/E via `this.input.keyboard`) must not fire behind the results. The spec's test spies on document bubble only. → Task 5 adds a `window` bubble-phase spy.
3. **Retry chain that ends in NEXT MISSION:** first clear 1★ → RETRY → win again → NEXT MISSION. The exit payload must be `{ result:'victory', prevStars:0, next:true }`, so the flight still plays and lands on the next map. → Task 4.
4. **Longest real kicker on compact.** The worst-case audit forces line, kills, gold and time, but the kicker is `MISSION n · <MAP NAME>` and the longest map name is never forced. → Task 8 audits the map with the longest `MAPS[i].name`, derived, not hardcoded.
5. **A selected tower's panel or an aim/build mode open at the moment the level ends.** It must be closed or inert, not left floating above or under the results. → Task 6 asserts the tower panel is hidden and aim/reposition mode cleared after `_showResults`, alongside the tooltip/inspector/wave-preview hides.

---

### Task 1: Star rule, records, run counters and formatters (pure + economy)

**Model:** sonnet. **Spec:** §4.1 (data file, verbatim), §4.2, §5.1 rows `starRating`/`runRecord`/`display.js`, §5.5, §12.1-1, -2, -4, -8 (data-only part), -9.

**Files:**
- Create: `src/data/results.js`, `src/systems/starRating.js`, `src/systems/runRecord.js`
- Modify: `src/utils/display.js` (append), `src/systems/EconomyManager.js`, `src/systems/TowerPlacementManager.js` (`sellTower`)
- Test: `src/data/results.test.js`, `src/systems/starRating.test.js`, `src/systems/runRecord.test.js`, `src/utils/display.test.js` (create; none exists), `src/systems/EconomyManager.test.js`, `src/systems/TowerPlacementManager.test.js` (add `refund` to its economy mock)

**Interfaces (produces):**
- `src/data/results.js`: `STAR_RULE`, `RESULTS`, `RESULTS_COPY`, `RESULT_SPEAKERS`, `RESULT_LINES`, exactly as spec §4.1 (all `Object.freeze`d)
- `starsFor(lives:number, startLives:number, rule = STAR_RULE) → 1|2|3`
- `livesLostFor(startLivesOfRun, livesLeft) → integer ≥ 0 | null`
- `sanitizeRecord(raw) → { livesLost: int|null, timeMs: int|null } | null`
- `mergeRecord(prev, run) → { record, newBest: { livesLost: boolean, time: boolean } }`
- `formatDuration(ms) → 'm:ss' | 'h:mm:ss'`, `formatCount(n) → string`
- `EconomyManager#earned` (number, starts 0), `EconomyManager#refund(amount)`

- [ ] **Step 1: Write the failing tests**
  - `starRating.test.js`:
    - **oracle:** for each `m` of `MAPS`, for `lives` in `0..2*m.startLives`, `starsFor(lives, m.startLives) === (p => p >= 0.8 ? 3 : p >= 0.5 ? 2 : 1)(lives / m.startLives)`
    - boundaries `16/20→3, 15/20→2, 10/20→2, 9/20→1, 12/15→3`
    - `starsFor(NaN,20)`, `starsFor(5,0)`, `starsFor(5,Infinity)` → `1`
    - `STAR_RULE` shape: best-first, `minRatio ∈ (0,1]`, `floor === 1`
  - `runRecord.test.js`: every case in spec §12.1-2, including the **Garrison fixture**: `mergeRecord({livesLost:0,timeMs:null}, {livesLost: livesLostFor(22,22), timeMs: 500000})` → `newBest.livesLost === false` and `record.livesLost === 0`.
  - `results.test.js`:
    - every `victory`/`final` tier 1–3 is non-empty, and `defeat` is non-empty
    - every line ≤ `RESULTS.maxLineChars`, with no duplicates across pools
    - `RESULT_SPEAKERS.victory/defeat ∈ Object.keys(STORY_SPEAKERS)`
  - `display.test.js`: the §12.1-9 table.
  - `EconomyManager.test.js`:
    - `earn(50)` → `earned === 50`
    - `refund(30)` → gold +30, `economy:update` emitted, `earned` unchanged
    - `spend` leaves `earned` alone
    - the constructor's start gold is not counted
  - The `sellTower` test asserts `economy.refund` was called with the refund amount and `earn` was not.

- [ ] **Step 2: Run them and confirm they fail** on missing modules/exports. Command: `npx vitest run src/systems/starRating.test.js src/systems/runRecord.test.js src/data/results.test.js src/utils src/systems/EconomyManager.test.js`

- [ ] **Step 3: Implement.** Copy `src/data/results.js` from spec §4.1 verbatim, including the 13 Command lines and 5 Veth lines. `starsFor` loops `rule.thresholds` best-first with `>=`; a non-finite or `≤ 0` `startLives` returns `rule.floor`. `formatCount` is `Math.round(n).toLocaleString('en-US')`. `sellTower` switches `earn` → `refund`.

- [ ] **Step 4: Run the tests and confirm they pass.** Then mutation-check: (a) `>=`→`>` in `starsFor`, which must fail the oracle; (b) make `mergeRecord` higher-is-better for lives, which must fail the Garrison fixture; (c) make `refund` call `earn`, which must fail the economy test. Restore each.

- [ ] **Step 5: Full suite green, then commit**
```bash
git add src/data/results.js src/data/results.test.js src/systems/starRating.js src/systems/starRating.test.js src/systems/runRecord.js src/systems/runRecord.test.js src/utils/display.js src/utils/display.test.js src/systems/EconomyManager.js src/systems/EconomyManager.test.js src/systems/TowerPlacementManager.js src/systems/TowerPlacementManager.test.js
git commit -m "feat(results): star rule in data, run records, income counter, formatters"
```

---

### Task 2: Save v5 with per-map records

**Model:** sonnet. **Spec:** §4.3, §4.4, §12.1-3.

**Files:** Modify `src/systems/SaveManager.js` and `src/systems/SaveManager.test.js`.

**Interfaces:**
- Consumes: `sanitizeRecord`, `mergeRecord` (Task 1)
- Produces:
  - `VERSION = 5`, and an exported `migrateV4toV5(env)` (export it beside the existing migrate helpers)
  - `SaveManager#getRecord(mapId) → { livesLost, timeMs } | null` (a copy)
  - `SaveManager#recordRun(mapId, { livesLost, timeMs }) → { newBest: { livesLost, time } }`

- [ ] **Step 1: Write the failing tests** (spec §12.1-3, every bullet), including:
  - a v4 fixture → after construction, storage holds `version: 5` and `records` of length `MAP_COUNT`, all `null`, with every other field deep-equal to the fixture
  - v1, v2 and v3 fixtures → v5
  - garbage `records` (`'x'`, wrong length, `[{lives:18}]`) → sanitized nulls
  - a future `version: 6` keeps sanitized records
  - `recordRun` returns the flags, persists, and makes **no `setItem` call** when nothing improved (spy on `localStorage.setItem`)
  - mutating the object `getRecord` returns doesn't change the next `getRecord`
  - **freshness:**
    - instance B constructed, A `setStars(0,3)`, B `recordRun(0,…)` → a fresh instance reads 3 stars and the record
    - A `recordRun`, then B `setSettings` → the record survives
- [ ] **Step 2: Run `npx vitest run src/systems/SaveManager.test.js`** and confirm the new tests fail.
- [ ] **Step 3: Implement.**
  - The loader accepts versions 1–5. Chain the v1/v2/v3 branches through `migrateV4toV5`, and add a v4 branch that migrates and writes back.
  - `_normalize` maps a length-`MAP_COUNT` `records` array through `sanitizeRecord`, else `Array(MAP_COUNT).fill(null)`.
  - `freshEnvelope()` includes `records`.
  - `recordRun` calls `this._refresh()` first and saves only when `mergeRecord` changed the record.
- [ ] **Step 4: Confirm the tests pass.** Mutation-check: (a) remove `this._refresh()` from `recordRun`, which must fail a freshness test; (b) drop `records` from `_normalize`, which must fail the "setSettings after recordRun" test. Restore. The hotfix's six cross-instance tests stay green.
- [ ] **Step 5: Full suite green, then commit** `feat(save): v5 envelope with per-map best records`.

---

### Task 3: Results timeline, flow and model (pure presentation)

**Model:** sonnet. **Spec:** §5.1 rows `resultsTimeline`/`resultsFlow`/`resultsModel`, §5.2, §6.1, §7.2, §7.5 (announcement), §12.1-5, -6, -7, -8 (`longestResultLine`).

**Files:**
- Create: `src/systems/resultsTimeline.js`, `src/systems/resultsFlow.js`, `src/systems/resultsModel.js`
- Test: one `.test.js` next to each

**Interfaces:**
- Consumes: `RESULTS`, `RESULTS_COPY`, `RESULT_LINES`, `RESULT_SPEAKERS` (Task 1); `formatDuration`, `formatCount` (Task 1); `STORY_SPEAKERS` (existing, for the speaker's display name in the announcement); `MAPS`
- Produces:
  - `resultsTimeline(result, cfg = RESULTS) → { banner, shake, stars, chips, newBest, caption, actions, endMs }`. Each beat is `{ at, ms }`; `shake` is `null` on victory; `stars` is `[]` on defeat; `newBest[i]` is the slot for chip `i` (`null` on defeat).
  - `openFlow(now, { motion, endMs }) → state`, `tickFlow(state, now) → state`, `pressFlow(state, now, cfg = RESULTS) → { state, act: boolean }`
  - `resultsModel(run, { maps = MAPS, lines = RESULT_LINES, copy = RESULTS_COPY, speakers = RESULT_SPEAKERS } = {}) → model` (shape: spec §5.2). `run = { result, mapId, lives, startLives, stars, kills, goldEarned, timeMs, wave, waveCount, newBest }`.
  - `pickResultLine({ result, stars, final, mapId, wave }, lines = RESULT_LINES) → string`, `longestResultLine(lines = RESULT_LINES) → string`

- [ ] **Step 1: Write the failing tests**
  - **timeline:**
    - victory `endMs === 2600`, defeat `endMs === 1750`
    - victory stars at `500/750/1000`, chips at `1350/1450/1550/1650`, caption `1900`, actions `2300`
    - defeat chips at `500..800`, caption `1050`, actions `1450`, shake `{at:400, ms:400}`
    - every value derived in the test from `RESULTS` fields, not literals, except the two pinned `endMs`
    - beats are monotonic
    - each `newBest[i].at > chips[i].at` and `< actions.at`
  - **flow:**
    - natural end → `ready`, `readyAt === openedAt + endMs`
    - press while revealing → ready, `act:false`
    - press at `readyAt + 249` → `act:false`; at `readyAt + 250` → `act:true`
    - motion off → ready at open, and a press at `openedAt + 100` gives `act:false`
    - `Object.freeze` the input state and assert nothing throws (immutability)
  - **model:** spec §12.1-7. Use a run of lives 17, startLives 22, kills 214, goldEarned 3480, timeMs 582000 → chips `['17/22','214','3,480','9:42']`. Also:
    - defeat chips `wave,kills,gold,time` and `1/10` on wave 1
    - final victory → kicker `CAMPAIGN COMPLETE`, actions `['map','retry']`, a final-pool line
    - NEW BEST flags victory-only
    - `starsLabel` `'2 of 3 stars'` / `''`
    - the announcement includes the stars label, the four chips, "New best time" when set, and `"<speaker name>: <line>"`
    - the model has no `title` key
  - `pickResultLine`: victory index `mapId % n` per tier; defeat `(mapId + wave) % n`; final pool on the last map
  - `longestResultLine` equals the max-length line found by scanning all pools in the test
- [ ] **Step 2: Run the three test files** and confirm they fail.
- [ ] **Step 3: Implement.** `resultsModel` computes `final = mapId === maps.length - 1` and `kicker = RESULTS_COPY.kicker(mapId + 1, maps[mapId].name)`. The kicker becomes `campaignComplete` only on a final victory.
- [ ] **Step 4: Confirm the tests pass.** Mutation-check: guard `>=` → `>` in `pressFlow`; `readyAt = now` on a natural end; swap the defeat pick to `mapId % n`. Each must fail its test.
- [ ] **Step 5: Full suite green, then commit** `feat(results): pure timeline, input flow and view model`.

---

### Task 4: Exit payload, next-mission pick, layout audit (pure)

**Model:** sonnet. **Spec:** §5.1 rows `missionExit`/`arrivalPlan`/`resultsLayout`, §8.4, §9.1, §9.2, §12.1-10, -11.

**Files:**
- Create: `src/systems/missionExit.js`, `src/systems/resultsLayout.js`, with tests
- Modify: `src/systems/arrivalPlan.js` and its test (add `nextMissionId`; leave `planArrival`/`arrivalFrame` untouched)

**Interfaces:**
- Produces:
  - `exitPayload({ mapId, result, entryStars, savedStars, runStars, next }) → { mapId, result, prevStars, stars, next? }` (formula: spec §9.1)
  - `nextMissionId({ from, plan, stars }) → mapId | null` (table: spec §9.2)
  - `resultsProblems(m) → string[]` (input shape and rules: spec §8.4)
  - `bannerLowerEdge(box, skewDeg) → (x) => y`
- Consumes: `targetSizeProblems` from `src/systems/layoutAudit.js` (existing) inside `resultsProblems`

- [ ] **Step 1: Write the failing tests**
  - **`exitPayload`:**
    - the five return-payload cases, built from the same inputs `GameScene.returnToMap.test.js` uses (fresh victory, the prevStars-before-setStars case, worse replay, defeat, abandon), with identical expected objects
    - chain cases: first clear + retry + defeat → `{result:'victory', prevStars:0, stars:1}`; first clear 3★ + retry 1★; first clear + retry + abandon
    - **Review Focus 3:** `entryStars:0, savedStars:1, runStars:1, result:'victory', next:true` → `{ result:'victory', prevStars:0, stars:1, next:true }`
    - `next` key absent unless `next: true`
  - **`nextMissionId`:** one test per §9.2 row, including a gap save (`advance` with `toId` ≠ `mapId+1`) and the last map.
  - **`resultsProblems`:**
    - one passing fixture, plus one failing fixture per rule in §8.4: outside map, banner text overflow, caption overflow, each named overlap pair, banner collision measured by the parallelogram edge, a small visible button, a font under 11 px
    - a rect inside the bounding-box corner but under the slanted edge must **pass**, proving the parallelogram is used
  - **`bannerLowerEdge`:** at `cx` it returns `box.bottom`; at the left edge with 5° it returns `box.bottom + tan(5°)·(cx − left)`.
- [ ] **Step 2: Run** and confirm the tests fail.
- [ ] **Step 3: Implement** to the formulas in §9.1, §9.2 and §8.4.
- [ ] **Step 4: Confirm the tests pass.** Mutation-check: `improved` uses `>=`; drop the `stamp` row's open check; use the bounding box instead of the edge. Each must fail.
- [ ] **Step 5: Full suite green, then commit** `feat(results): exit payload, next-mission pick and layout audit`.

---

### Task 5: Results DOM, CSS and gesture tail

**Model:** opus. **Spec:** §5.8, §5.9, §6 (all), §7 (all), §8.1–8.3, §10, §11, §12.1-12, -13, -17. Mockup: `/Users/keithtimko/projects/tower-defense/.superpowers/brainstorm/18926-1792977250/content/results-directions-v2.html` (option B) for the look only.

**Files:**
- Create: `src/ui/ResultsScreen.js`, `src/ui/gestureTail.js`, `src/ui/resultsCss.test.js`, `src/ui/ResultsScreen.test.js`, `src/ui/gestureTail.test.js`
- Modify: `index.html` (the `#results` markup from §8.1 after `#story-log-overlay`, before `#game-msg`; the results CSS block next to the story-dialog CSS); `src/ui/theme.test.js` (extend with the §6.2 contrast pairs, using its existing `contrastRatio` imports)

**Interfaces:**
- Consumes: the model from Task 3 (`resultsModel` output), `resultsTimeline`, `openFlow`/`tickFlow`/`pressFlow`, `RESULTS`; `speakerLook`, `portraitPath` (3.5, existing); `isBrowserShortcut` (`src/ui/browserShortcut.js`)
- Produces:
  - `new ResultsScreen({ motion, now, raf, caf, root })` with `open(model, onAction)` (`onAction(id)` runs at most once per open) and `close()` (idempotent, never calls `onAction`)
  - `armGestureTail({ now, windowMs, key })`, `disarmGestureTail()`
  - DOM ids: `#results`, `#results-kicker`, `#results-banner-text`, `#results-stars`, `#results-chips`, `#results-caption`, `#results-portrait`, `#results-speaker`, `#results-line`, `#results-actions`, `#results-next`, `#results-retry`, `#results-map`, `#results-live`
  - Root data attributes: `data-result`, `data-final`, `data-phase`, `data-stars`, `data-speaker`, `data-shape`, `data-glitch`

- [ ] **Step 1: Write `resultsCss.test.js` first** (every assertion in spec §11's last row), modelled on `src/ui/storyDialogCss.test.js`'s parser. Run it and confirm it fails: no rules yet, so the more-than-15-rules guard fails.
- [ ] **Step 2: Write `gestureTail.test.js`** (§12.1-13). Fake `now`.
  - The touch listeners are added with `passive: false`: spy on `document.addEventListener` and check the options.
  - After `disarmGestureTail()` and after the first post-window event, zero listeners remain (count add/remove pairs).
  - Run it and confirm it fails.
- [ ] **Step 3: Write `ResultsScreen.test.js`** (every bullet of §12.1-12). Inject `now`, `raf` (manual queue), `caf`, `motion`. Add the **Review Focus 2** case:
  - a `window.addEventListener('keydown', spy)` (bubble) registered before `open`
  - `Space`, `Enter`, `Escape`, `Digit1`, `KeyQ` keydowns dispatched on `document.body` while revealing and while ready
  - `spy` is never called
  - `Control+KeyR` reaches it

  Run it and confirm it fails.
- [ ] **Step 4: Implement `gestureTail.js`, then `ResultsScreen.js`, then the markup and CSS.**
  - Timings reach CSS as `--rs-*-ms` vars plus per-element inline `--rs-at`, following 3.5's `publishTimings` pattern in the story-dialog module.
  - The Veth glitch reuses the `sd-glitch` keyframes on inner elements.
  - Compact layout is `@media (max-height: 500px)` (§8.2). Coarse-pointer and compact `.rs-btn` are `min-height: 44px; min-width: 44px`.
  - `#results[hidden] { display: none }` is set explicitly.
- [ ] **Step 5: Run the three new test files plus the existing CSS guards** (`npx vitest run src/ui`) and confirm they pass. Mutation-check:
  - delete the `.rs-done` animation-none rule → `resultsCss` fails
  - make the touch listeners passive → `gestureTail` fails
  - remove `stopPropagation` for unhandled keys → the Review Focus 2 spy test fails
  - drop the guard compare → the "click within guard" test fails

  Restore each.
- [ ] **Step 6: Visual sanity in a real browser (controller checks too).**
  - Run `npm run dev` and open the screen from the console with a hand-built model on a blank page section.
  - Screenshot victory (tall), defeat (Veth) and compact (844×390 viewport).
  - Compare against mockup B.
  - Save to the scratchpad. Not committed.
- [ ] **Step 7: Full suite green, then commit** `feat(results): action-comic results screen DOM, CSS and gesture tail`.

---

### Task 6: GameScene integration, the same-frame fix and RETRY

**Model:** opus. **Spec:** §5.3, §5.4, §9.1 (test-file changes), §12.1-14.

**Files:**
- Modify: `src/scenes/GameScene.js`, the `applyDebugCapture` hook in `src/scenes/GameScene.js` (around line 94: `end(result, overrides)`), `src/scenes/GameScene.exit.test.js`, `src/scenes/GameScene.returnToMap.test.js`, `src/scenes/GameScene.shutdown.test.js`
- Create: `src/scenes/GameScene.results.test.js`

**Interfaces:**
- Consumes:
  - `starsFor` and `livesLostFor` (Task 1)
  - `SaveManager#recordRun` (Task 2)
  - `resultsModel` (Task 3)
  - `exitPayload` (Task 4)
  - `ResultsScreen` (Task 5)
  - `economy.earned` (Task 1)
- Produces:
  - `GameScene#_showResults(result)`, `#_onResultsAction(id)`, `#_retry()`, `#_returnToMap(opts = {})` (opts `{ next }`)
  - fields `_entryStars`, `_runMs`, `_startLives`, `_newBest`
  - `scene.restart` data `{ mapId, heroId, entryStars }`
  - `window.__capture.end(result, overrides)` with `overrides = { lives, kills, goldEarned, timeMs, line }` (capture/dev builds only)
- Removes: `_showVictoryOverlay`

- [ ] **Step 1: Write the failing same-frame test first**, in `GameScene.results.test.js` (§5.4).
  - Stub at the final wave, 1 life, the last enemy on the base.
  - Run one `update()` path.
  - Expect `won === false`, `setStars` and `recordRun` not called, `_commitStats` called once with `false`, and `_showResults` called with `'defeat'`.
  - Run it and confirm it fails today.
- [ ] **Step 2: Write the other failing tests** (every bullet of §12.1-14), plus:
  - **Review Focus 1:** after `_toggleSpeed()` to 2× and a fresh `create()` (the restart path), `this.speed === 1` and `#speed-btn.textContent === '⏩ 2x'`.
  - **Review Focus 5:** with a selected tower (tower panel shown) and an active aim mode at `_onVictory`/`_onDefeat`, `_showResults` leaves the tower panel hidden and no aim/reposition/build mode active (`_modeState()` has no mode).
  - **Retry ×3 in `GameScene.shutdown.test.js`:** after three create/shutdown cycles via the restart path, each scene event has exactly one listener, and one `enemy:spawn` gives one enemy.
  - **Rewrites:**
    - The `GameScene.exit.test.js` modal-reset cases that used `_showVictoryOverlay`/`#game-msg` now use `#results`.
    - `GameScene.returnToMap.test.js`: the fixture gains `_entryStars` and `saveMgr.recordRun`, and the label case is rewritten per §9.1. **The five oracle assertions and the double-click case are unchanged** (diff them).
- [ ] **Step 3: Run the scene tests** and confirm the new ones fail.
- [ ] **Step 4: Implement §5.3 in order:**
  1. `init`/`create` fields
  2. the `update()` clock line
  3. `_onVictory` (`|| this.over`, `starsFor`, `recordRun` before the dialog)
  4. `_onDefeat`
  5. `_showResults`
  6. `_onResultsAction`
  7. `_returnToMap` via `exitPayload`
  8. `_retry`
  9. `shutdown` closes the results
  10. the speed-button text reset in `create` next to `_resetPauseButton()`
  11. the capture hook overrides

  `#game-msg` keeps its Exit-confirm role untouched.
- [ ] **Step 5: Confirm the tests pass.** Mutation-check:
  - remove `|| this.over` → the same-frame test fails
  - drop `_unwireSceneEvents()` from `shutdown` → retry ×3 fails
  - remove the speed-text reset → Review Focus 1 fails
  - carry `debug` in `_retry` → its test fails
- [ ] **Step 6: Full suite green, `npm run build` OK, then commit** `feat(results): wire results screen into GameScene; retry; defeat wins a same-frame tie`.

---

### Task 7: World-map hand-off and briefing-card best line

**Model:** opus. **Spec:** §4.5, §5.6, §5.7, §9.3, §12.1-15, -16.

**Files:**
- Modify: `src/scenes/MapSelectScene.js`, `src/systems/briefingCard.js`, `src/ui/BriefingCard.js`, `src/data/campaign.js` (`CARD_COPY`), plus `MapSelectScene.arrival.test.js`, `MapSelectScene.worldMap.test.js` and the briefing-card tests
- The `.fs-best` paint rule goes in the existing world-map CSS block in `index.html`; keep `worldMapCss.test.js` green.

**Interfaces:**
- Consumes: `nextMissionId` (Task 4), `SaveManager#getRecord` (Task 2), `formatDuration` (Task 1)
- Produces:
  - `briefingCardModel(mapId, stars, records = []) → { …existing, record }`
  - `CARD_COPY.best = 'Best: '`, `CARD_COPY.lostWord = 'lost'`, `CARD_COPY.bestSep = ' · '`
  - `MapSelectScene#_nextId`

- [ ] **Step 1: Write the failing tests** (every bullet of §12.1-15 and -16). Focus is asserted as `document.activeElement === document.getElementById('featured-play')` **after** `_bindPlay()` cloned it. `_skipArrival` with a keydown whose `defaultPrevented` is true leaves `data-arrival` unchanged.
- [ ] **Step 2: Run** and confirm they fail. The existing arrival/world-map tests must still pass untouched.
- [ ] **Step 3: Implement §5.6 and §5.7.**
  - Move `_prepareArrival(data?.from)` before `_defaultSelection`.
  - Focus LAUNCH with `{ preventScroll: true }` in `_finishArrival` and after `_bindPlay()` when no arrival plays.
  - Read the records once in `create`.
- [ ] **Step 4: Confirm the tests pass.** Mutation-check: drop the `defaultPrevented` early return; focus before `_bindPlay()` (focus lands on the discarded node); ignore `_nextId` in `_defaultSelection`. Each must fail.
- [ ] **Step 5: Full suite green, then commit** `feat(world-map): next-mission hand-off with LAUNCH focus; best run on the briefing card`.

---

### Task 8: Capture harness: results shots, audits and proving runs

**Model:** opus. **Spec:** §12.2, §12.3, §14 (acceptance list, for what the shots must show).

**Files:** Modify `scripts/capture.mjs`. If a pure helper grows, put it in `src/systems/deviceFlow.js` with a unit test. `FLOW_STEPS` and `deviceFlow.test.js` stay unchanged.

**Interfaces:**
- Consumes:
  - the DOM ids and data attributes from Task 5
  - `resultsProblems` (Task 4)
  - `RESULTS.actGuardMs`, `longestResultLine` (Tasks 1 and 3)
  - `__capture.end(result, overrides)` (Task 6)
  - `MAPS`
- Produces:
  - capture runs `captureResultsGuard`, `captureRetry`, `captureNextMissionReplay`, `captureHeldEnter` (desktop only)
  - `resultsAudit(page, device, label)`
  - the updated `winMapZero` and `returnToMap(page, device, onStory, via = '#results-map')`
  - shots `05-defeat`, `05a-defeat-reveal`, `07-victory`, `07a-victory-reveal`, `07e-victory-final`

- [ ] **Step 1: Update `winMapZero`, `returnToMap`, `capturePostWin`, `captureHeldSkip`, `captureReducedMotion` and `captureNoFonts`** per §12.2, and add the shots.
- [ ] **Step 2: Add `resultsAudit`.** It runs on every device after `.rs-done`, with the worst-case overrides from §12.2 (longest line, kills 9 999, gold 99 999, time 9:59:59, a seeded worse record so both NEW BEST tags show, 1★ and 2★, final map). It also runs on **Review Focus 4**: the map whose `MAPS[i].name` is longest, derived in the script with `reduce`. It audits again in `captureNoFonts`.
- [ ] **Step 3: Add the four proving runs** exactly as §12.2 describes, with real input only:
  - `page.mouse`/`touchscreen`
  - scroll into view before coordinate taps
  - CDP for long-press if needed
  - each "expect" bounded tighter than the natural animation, with the proving action done first in its step
- [ ] **Step 4: Prove each new run fails with the feature disabled.** Run each proof in §12.2 once by a temporary local edit:
  - `actGuardMs: 0`
  - remove the click-finish
  - pass `debug` through restart
  - drop `next` from the payload
  - remove the `_skipArrival` `defaultPrevented` check
  - remove the key tail

  Record which run failed and the message, then restore. Paste the evidence in the report. Never commit a proof edit.
- [ ] **Step 5: Gates.** Each runs with full output captured to a file and its exit code checked:
  - `npm test`
  - `npm run build`
  - `npm run matrix` (desktop 17/17, touch 18/18; report `uptime` before and after)
  - `npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad` with **zero problems**
- [ ] **Step 6: Commit the harness, plus captures as JPEG q90** in `docs/captures/3.6/`:
```bash
git add scripts/capture.mjs docs/captures/3.6/05-defeat-*.jpg docs/captures/3.6/05a-defeat-reveal-*.jpg docs/captures/3.6/07-victory-*.jpg docs/captures/3.6/07a-victory-reveal-*.jpg docs/captures/3.6/07e-victory-final-*.jpg   # one per device; list with ls first, never add the whole dir
git commit -m "test(harness): results screen shots, layout audit and proving runs"
```

---

## After the tasks (controller, not a subagent)

1. **Controller live check on the production build** (`npm run build && npm run preview`) at desktop 1440×900 and iPhone 14 (844×390), with real input. Run spec §12.4 (a)–(f), seeding `lastlight_save` v4. Compare the screenshots against mockup B before trusting the reviews.
2. **Final whole-branch review on opus**, then one fix wave and one scoped re-review.
3. **Notes:**
   - `.claude/notes.md`: 3.6 done, the iPhone/iPad matrix confirmed idle on 2026-10-24, hotfix #114/#115.
   - Backlog follow-ups: stale *reads* across `SaveManager` instances; Rael on the results screen.
   - Session file `.claude/sessions/2026-10-26-<slug>.md`.
   - Commit these onto this branch **before** `gh pr create --base visual/integration`.
