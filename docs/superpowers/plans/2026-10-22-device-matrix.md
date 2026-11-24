# Device matrix (roadmap 2.4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run matrix` plays boot → map select → build → upgrade → send wave → pause with real touch/mouse input on desktop, iPhone 14, Pixel 7 and iPad, asserting state after every step, saving per-step screenshots, and exiting 1 on any failure.

**Architecture:** Pure step/expectation/coordinate logic in a new `src/systems/deviceFlow.js` (Vitest-tested, never imported by game code); a `--flow` mode in `scripts/capture.mjs` reuses its build/preview/browser/DEVICES/tap/audit/watchProblems/report plumbing. Zero game-code changes.

**Tech Stack:** vanilla JS ES modules, Vitest + jsdom, Playwright (Chromium) in `scripts/capture.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-22-device-matrix-design.md` — read it; its step table (NN / id / action / assertion) is the contract for Task 2 and its "Pure module" section for Task 1.

## Global Constraints

- No changes under `src/` except the new `src/systems/deviceFlow.js` + its test. No `?debug=` and no `window.__game`/`window.__capture` in the flow.
- Map 0, tower `archer`, pad = `pickPad(MAPS[0])`. Every expected number comes from `src/data/maps.js` / `towers.js` / `story.js`, never literals in code.
- Default `--flow` devices: `desktop, iphone, pixel, ipad`. `--flow` with `--screens` is an argument error.
- Confirmable controls: only `#panel-upgrade-btn`, `#panel-sell-btn`, branch Choose. `#wave-btn` is a plain click. `CONFIRM_WINDOW_MS` from `src/data/input.js`; the harness fails step 11 if > `CONFIRM_WINDOW_MS − 500` ms passed between the two upgrade taps.
- Touch devices: `locator.tap()` / `page.touchscreen.tap`; desktop: `locator.click()` / `page.mouse.click`. Waits are condition-based; the only fixed delay is the 500 ms pause-freeze sample.
- `watchProblems` unchanged: any page error / console error / warning fails the device.
- Screenshots: `.art-cache/captures/<device>/flow/NN-id.png` (+ `NN-id-FAILED.png`); `.art-cache/` is never committed.
- `--screens` behaviour unchanged. Comments explain why. No new dependencies.

## Review Focus

1. Two-tap confirm window silently expiring between harness taps (iPad DPR-2 screenshots are slow) → Task 2's elapsed-time guard, proven by AC2's confirm-gate bite.
2. A pause check that can never fail (static canvas region) → Task 2 asserts the region changes during the wave (step 12) before the freeze check (step 13).
3. Expectations drifting from data (balance edits) → Task 1 derives from tables and throws on an unaffordable map (synthetic poor-map test).
4. Tie between equally-near pads making `pickPad` nondeterministic → Task 1 tie test (lowest index wins).
5. `summarizeFlow` reporting PASS for an empty or problems-only device → Task 1 tests both as failures.

---

### Task 1: Pure flow module

**Files:**
- Create: `src/systems/deviceFlow.js`, `src/systems/deviceFlow.test.js`

**Interfaces:**
- Consumes: `railMetricsFor({ pointerFine })`, `WORLD_WIDTH`, `WORLD_HEIGHT` (`src/data/layout.js`); `MAPS`; `TOWER_DEFS`; `STORY_SEQUENCES`, `briefKey` (`src/data/story.js`).
- Produces:
  - `FLOW_STEPS: Array<{ n:number, id:string, touchOnly:boolean }>` — n/id exactly the spec table: 1 boot, 2 skip-story, 3 select-map, 4 play, 5 briefing, 6 level-ready, 7 arm-tower, 8 build, 9 open-panel, 10 upgrade-arm (touchOnly), 11 upgrade, 12 send-wave, 13 pause.
  - `stepsFor({ hasTouch }) -> step[]`; `shotName(step) -> 'NN-id.png'` (two-digit n).
  - `pickPad(map) -> number`; `padWorldPoint(map, i) -> { x, y }`.
  - `worldToPagePoint({ x, y }, canvasBox:{x,y,width,height}, { pointerFine }) -> { x, y }` — page x = `box.x + (x + railWidth) * box.width / canvasWidth`, y = `box.y + y * box.height / WORLD_HEIGHT`.
  - `flowExpectations({ map, towerType }) -> { startGold, goldAfterBuild, goldAfterUpgrade, waveBefore, waveAfter, lockedAfterUpgrade, expectBriefing, pad:{x,y} }` — `waveBefore` = `` `0/${map.waveCount}` ``, `waveAfter` = `` `1/${map.waveCount}` `` (check the HUD's real wave format in UIScene/GameScene first and match it); `lockedAfterUpgrade` = `map.maxTierAllowed < 3`.
  - `summarizeFlow(deviceResults) -> { lines:string[], failedDevices:number }` where each result is `{ device, steps:[{ n, id, status:'pass'|'fail'|'skip', detail }], problems:string[] }`.

- [ ] **Step 1: Write the failing tests** (`deviceFlow.test.js`), one `describe` per function:
  - `flowExpectations({ map: MAPS[0], towerType: 'archer' })`: `startGold === MAPS[0].startGold`, `goldAfterBuild === startGold − TOWER_DEFS.archer.cost`, `goldAfterUpgrade === goldAfterBuild − TOWER_DEFS.archer.tier2.cost`, `expectBriefing === (STORY_SEQUENCES[briefKey(MAPS[0].storyKey)]?.panels?.length > 0)`, `pad` equals `padWorldPoint(MAPS[0], pickPad(MAPS[0]))`. A synthetic `{ ...MAPS[0], startGold: 10 }` throws `/afford/`; `{ ...MAPS[0], maxTierAllowed: 1 }` throws `/tier/`.
  - `padWorldPoint(MAPS[0], i)` equals `new PathManager(…).buildZones[i]` x/y for every i (read PathManager's constructor signature; `vi.mock('phaser')` if it imports Phaser).
  - `pickPad`: returns an index in range; for a synthetic map whose slots are `[[0.1,0.1],[0.5,0.5],[0.9,0.9]]` returns 1; for `[[0.4,0.5],[0.6,0.5]]` (tie) returns 0.
  - `worldToPagePoint`: world (0,0) with box `{x:0,y:0,width:1488,height:720}` fine → `{x:104,y:0}`; coarse box 1632 wide → `{x:176,y:0}`; a box scaled ×0.5 at offset (10,20) scales and offsets both axes.
  - `stepsFor`: `{hasTouch:false}` has 12 steps and no n=10; `{hasTouch:true}` has 13; n strictly increasing; ids unique. `shotName({n:8,id:'build'}) === '08-build.png'`.
  - `summarizeFlow`: all-pass device → line starts `PASS desktop`, failedDevices 0; a failed step → `FAIL iphone at 11 upgrade: <detail>`, failedDevices 1; skipped steps after a failure don't count as passes; all steps pass but `problems` non-empty → FAIL; `[]` → failedDevices ≥ 1.
- [ ] **Step 2: Run** `npx vitest run src/systems/deviceFlow.test.js` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/systems/deviceFlow.js` with the signatures above (tie in `pickPad`: first/lowest index wins).
- [ ] **Step 4: Run** the file, then `npm run test` — all pass; report the count (baseline 2251).
- [ ] **Step 5: Commit** `feat(matrix): pure device-flow steps, expectations and coordinates (2.4)`.

### Task 2: `--flow` mode in the capture harness

**Files:**
- Modify: `scripts/capture.mjs`, `package.json` (`"matrix": "node scripts/capture.mjs --flow"`)

**Interfaces:**
- Consumes: everything Task 1 produces; existing `DEVICES`, `contextOptions`, `tap`, `watchProblems`, `audit`, `IN_GAME_TARGETS`, `RAIL_ONLY_TARGETS`, `shoot`, report.json writing, `POINTER_FINE_QUERY`.

- [ ] **Step 1: Arg handling.** `--flow` sets `opts.flow`; with `--screens` → throw an argument error; with no `--devices` the flow uses `['desktop','iphone','pixel','ipad']`. Update the usage header (flow ignores `--maps/--wave/--build/--hero/--video`). Call `flowExpectations({ map: MAPS[0], towerType: 'archer' })` before launching the browser.
- [ ] **Step 2: Coordinates.** Refactor `clickGamePoint` to use `worldToPagePoint` (behaviour identical); add `tapGamePoint(page, deviceName, x, y)` — touchscreen tap on `hasTouch`, mouse click otherwise.
- [ ] **Step 3: `captureFlow(browser, base, deviceName, exp)`.** Fresh context per device; iterate `stepsFor(device)`; each step: perform the spec table's action, run its condition-based assertion (≤10 s unless the table says otherwise), shoot `flow/<shotName>`; on the first failure shoot `NN-id-FAILED.png`, mark the rest `skip`, keep going to the next device. Record `{ n, id, status, detail, file, ms }`. Implement the step-10→11 elapsed guard, the step-12 canvas-region-changes check (≤5 s), and step 13 (overlay `.shown` visible, `#pause-btn` text `▶ Resume`, wait for `document.getAnimations().length === 0`, two canvas-region screenshots 500 ms apart byte-identical). Merge `watchProblems` output into the device's `problems`.
- [ ] **Step 4: Report + exit.** Append `{ device, mode:'flow', pointerFine, pass, steps, problems }` per device to report.json; print `summarizeFlow(...).lines`; `process.exitCode = 1` when `failedDevices > 0`.
- [ ] **Step 5: Verify (AC1, AC4).** `npm run matrix` → exit 0, `PASS desktop 12/12` and `PASS <touch> 13/13` ×3. Then `npm run capture -- --screens --devices iphone --no-build` → same LAYOUT result as before (none). If a step fails, diagnose the root cause; never loosen an assertion or `watchProblems` without a named, commented reason.
- [ ] **Step 6: Prove the checks bite (AC2)** in scratch edits that are reverted and never committed, each run with `npm run matrix -- --devices iphone` (or `desktop` for the gold case) and exit 1 expected: (a) make GameScene write a wrong gold value to `#stat-gold` after a build → step 08 fails; (b) make `_bindConfirmable` take the mouse path for touch → step 10 fails; (c) remove the `scene.pause()` from the pause toggle → step 13 fails. Record each failing line in the report; `git diff --stat src/` must be empty afterwards.
- [ ] **Step 7: Run** `npm run test` once more, then **Commit** `feat(matrix): --flow device matrix in the capture harness (2.4)` (stage `scripts/capture.mjs package.json` only).

### After Task 2 (controller)

Convert the 12 curated shots (spec "PR screenshots") to JPG under `docs/captures/2.4-device-matrix/<device>-NN-id.jpg`, tick roadmap 2.4, update `.claude/notes.md`, open the PR (stacked on #105).
