# Device matrix (visual roadmap 2.4) — design

Branch `visual/2.4-device-matrix` (base includes 2.1 input model, 2.2 HUD rails, 2.3 mobile shell, #43 fine-pointer rails). Vanilla JS, Phaser 3.88, Vite 5, Vitest + jsdom, Playwright (Chromium).

## Goal

Roadmap text: *"Playwright touch-emulation scripts: boot → select map → build → upgrade → send wave → pause, on iPhone 14, Pixel 7, iPad. Screenshots into the PR. Real-device check is part of G3."*

The goal is one command that plays the opening of the game the way a new player does. It starts from a fresh first run and uses only real input: Playwright touch on touch devices and the mouse on desktop. It checks the game state after every step, saves a screenshot per step, and exits non-zero if any step fails, so later work can be gated on it. `--screens` already checks that controls are reachable. This flow checks that they work: the two-tap confirm, coordinates on the pointer-aware rails, and pause.

## Decisions

1. **A `--flow` mode inside `scripts/capture.mjs`, not a separate script.** capture.mjs already has everything the flow needs: the `capture`-mode build, `vite preview`, the Chromium lifecycle, `DEVICES`, `tap`, `watchProblems`, `audit`, `shoot` and `report.json`. A separate script would mean moving all of that into a shared module and keeping two entry points in sync. A new mode adds about 150 lines and keeps one source of truth. The pure logic goes in `src/systems/deviceFlow.js`, next to `layoutAudit.js` and `debugCapture.js`, which capture.mjs already imports. Vitest picks it up, and no game code imports it, so it never ships. A new `npm run matrix` alias runs `node scripts/capture.mjs --flow`.
2. **Zero game-code changes.** The matrix tests the shipped game. All assertions read DOM that already exists. `window.__game` exists only in DEV, and `window.__capture` only appears with `?debug=1`, which the flow never uses. The capture-mode build is still used because it is the harness's build. Without `?debug=`, BootScene/GameScene take the normal path.
3. **Fixed map 0 (Outpost Sigma), archer, and the pad nearest the map centre.** On a fresh save only map 0 is unlocked, so it is the only map a real first run can reach. The archer is the cheapest tower, so the flow can afford a build plus a tier-2 upgrade. Costs come from `src/data/towers.js` and `maps.js` and are checked before any browser starts. The pad is chosen by a pure helper, not a hard-coded index, so the choice survives edits to the pad list.
4. **Default devices: `desktop, iphone, pixel, ipad`.** These are the roadmap's three touch devices plus a fine-pointer desktop, which proves the 104-px rails (#43) through the same coordinate conversion. `phone844` and `phone932` are left out of the default: they use the same iPhone 14 descriptor as `iphone` (same UA, touch and pointer class), and their geometry is already checked by `--screens`. `--devices` still accepts any `DEVICES` key.
5. **Fail on console problems, strictly.** The flow reuses `watchProblems` unchanged. Page errors, console errors and console warnings all fail the device; the harness already treats a Phaser warning as a defect (see the double-pause guard in `_onPauseToggle`). If the first live run turns up benign noise, add a named filter with a *why* comment inside `watchProblems`, the same way the GL Driver filter was added. Do not loosen the rule.

## Confirmable controls (researched)

`_bindConfirmable` (GameScene.js:1379) is applied to exactly three controls: **`#panel-upgrade-btn`**, **`#panel-sell-btn`** and the tier-4 **branch `Choose`** buttons. **Send Wave is not confirmable**: `#wave-btn` uses a plain `click`. On touch or pen, the first press relabels the button `Tap again: <label>` and adds class `confirming`. A second press within `CONFIRM_WINDOW_MS` (2500, `src/data/input.js`) runs the action. A mouse click runs the action at once. The flow drives Upgrade only. Sell would destroy the tower before Send Wave, and branch Choose cannot be reached on map 0 (`maxTierAllowed: 2`). Both are covered by `GameScene.touchInput.test.js`.

## Step table

Every DOM control is pressed with `tap(page, device, sel)`: `locator.tap()` on `hasTouch` devices, `locator.click()` otherwise. Playwright's actionability checks fail the step if the control is covered. Canvas points are pressed with the new `tapGamePoint`: `page.touchscreen.tap` on touch devices, `page.mouse.click` otherwise. Its page coordinates come from `worldToPagePoint`, using the pointer class read from the page. Expected values (E.*) come from `flowExpectations`. Screenshots go to `.art-cache/captures/<device>/flow/NN-<id>.png`. Numbering is global, so desktop has no `10` and file names line up across devices.

| NN | id | Action | Assertion (condition-based wait, ≤10 s unless noted) |
|---|---|---|---|
| 01 | boot | `goto('/')` in a fresh context (empty localStorage) | `#story-dialog` visible (30 s, covers the boot load); page `matchMedia(POINTER_FINE_QUERY)` equals `!hasTouch` |
| 02 | skip-story | tap `#story-dialog-skip` | `#story-dialog` hidden; `#map-select` visible |
| 03 | select-map | tap `.ow-node[data-map-id="0"]` | node has `.active`; `#featured-name` = `MAPS[0].name` |
| 04 | play | tap `#featured-play` | `#hud-layer` visible; `#stat-gold` = E.startGold; `#stat-wave` = E.waveBefore (`0/10`); `#wave-btn` text `▶ Send Wave 1` |
| 05 | briefing | if E.expectBriefing: assert `#story-dialog` visible, shoot, tap `#story-dialog-skip` | `#story-dialog` hidden afterwards. If not expected, assert it was never shown (no shot) |
| 06 | level-ready | none | `audit(page, device, 'flow-in-game', IN_GAME_TARGETS, RAIL_ONLY_TARGETS)` returns no problems. This includes `railGeometryProblems`, which is the explicit 104/176-px rail check |
| 07 | arm-tower | tap `.tower-btn[data-type="archer"]` | button has `.selected`; `#cancel-btn` visible; gold unchanged |
| 08 | build | `tapGamePoint` at E.pad | `#stat-gold` = E.goldAfterBuild |
| 09 | open-panel | `tapGamePoint` at E.pad again (a tower hit beats the armed build) | `#tower-panel` visible; `#panel-name` contains the archer's name; `#panel-lvl` = `Level: 1/4`; `#panel-upgrade-btn` enabled. Record its text as `labelBefore` |
| 10 | upgrade-arm *(touch only)* | tap `#panel-upgrade-btn` once | text = `Tap again: ${labelBefore}`; has `.confirming`; gold still E.goldAfterBuild |
| 11 | upgrade | touch: second tap; mouse: single click | `#stat-gold` = E.goldAfterUpgrade; `#panel-lvl` = `Level: 2/4`; no `.confirming`; upgrade button `disabled` iff E.lockedAfterUpgrade |
| 12 | send-wave | tap `#wave-btn` | `#stat-wave` = E.waveAfter (`1/10`); the canvas region screenshot changes within 5 s. This is the control that proves step 13's freeze check can fail |
| 13 | pause | tap `#pause-btn` | `#paused-overlay` has `.shown` and is visible; `#pause-btn` text `▶ Resume`. Wait until every `document.getAnimations()` entry has `playState === 'finished'`: the wave banner uses `fill-mode: forwards`, so its animation stays listed after it ends. No CSS animation is infinite. Then take two canvas-region screenshots 500 ms apart: they must be byte-identical |

The two-tap gap (steps 10→11) contains the label wait, the gold read and one screenshot. The harness records the time just after the first tap. If more than `CONFIRM_WINDOW_MS − 500` has passed before the second tap, step 11 fails with "harness exceeded confirm window". Without that check, a silent re-arm would read as "upgrade did nothing".

## Pure module: `src/systems/deviceFlow.js` (unit-tested in `deviceFlow.test.js`)

- `FLOW_STEPS`: ordered `{ n, id, touchOnly }` list matching the table. `stepsFor({ hasTouch })` drops `touchOnly` steps. `shotName(step)` returns `NN-id.png`.
- `pickPad(map)` returns the index of the `towerSlots` entry nearest the world centre. `padWorldPoint(map, i)` returns `{ x: nx * WORLD_WIDTH, y: ny * WORLD_HEIGHT }`.
- `worldToPagePoint({ x, y }, canvasBox, { pointerFine })` does the math `clickGamePoint` uses today, via `railMetricsFor`. `clickGamePoint` (`--screens`, mouse-only, behaviour unchanged) and the new `tapGamePoint` both call it.
- `flowExpectations({ map, towerType })` returns `{ startGold, goldAfterBuild, goldAfterUpgrade, waveBefore, waveAfter, lockedAfterUpgrade, expectBriefing, pad }`. A fresh context has no meta-upgrades, so start gold is `map.startGold` and the build cost is `def.cost`. `expectBriefing` = `STORY_SEQUENCES[briefKey(map.storyKey)]?.panels.length > 0`. It **throws** a descriptive error if the map cannot afford build + tier-2, or if `maxTierAllowed < 2`.
- `summarizeFlow(deviceResults)` returns `{ lines, failedDevices }`. A device passes only if every step passed **and** `problems` is empty. An empty result list counts as a failure, because nothing was proved.

Tests (each one must be shown failing before the code is written):
- Expectations for `MAPS[0]` + archer are derived from the data tables, not literals. A synthetic poor map makes the helper throw.
- `padWorldPoint` matches `new PathManager(...).buildZones[i]` for map 0.
- `pickPad` returns a valid index and the nearest slot, including when two slots are equally near.
- `worldToPagePoint`: fine vs coarse offsets, world origin → the left rail's inner edge, scaling of `canvasBox`.
- `stepsFor`: desktop has no step 10 and touch has 13 steps; step numbers are unique and ordered.
- `summarizeFlow`: all pass; one failed step; steps skipped after a failure; console problems alone fail a device; empty list.

## Outputs and exit code

- After a failing step, the device's remaining steps are recorded as `skip`. A `NN-id-FAILED.png` is saved. The run continues with the next device, so one bad device still leaves the other devices' evidence.
- `report.json` (same path as today) gets one entry per device: `{ device, mode: 'flow', pointerFine, pass, steps: [{ n, id, status, detail, file, ms }], problems }`.
- Printed summary: one line per device, e.g. `PASS desktop 12/12`, or `FAIL iphone at 11 upgrade: gold 70, expected 20`, followed by any console problems.
- `process.exitCode = 1` if `failedDevices > 0`. The existing layout-line rule and the crash handler stay as they are.
- `--flow` together with `--screens` is an argument error. The flow ignores `--maps/--wave/--build/--hero/--video`; the usage header says so. With no `--devices`, `--flow` uses the matrix default.
- **PR screenshots:** JPGs committed in `docs/captures/2.4-device-matrix/<device>-NN-id.jpg`, following the 2.2 pattern: `10-upgrade-armed` for the three touch devices, plus `11-upgraded` and `13-paused` for all four devices, plus `desktop-06-level-ready` to show the 104-px rails. That is 12 files, linked in the PR body.

## Edge cases

- **Story dialogs:** the first-run intro is always expected, so missing it is a failure. The in-level briefing is created synchronously in `GameScene.create()` (in the same create() call as `#hud-layer` is shown), so it can be checked as soon as the HUD is visible, with no timing race. Whether it should appear comes from the data, not from "if any".
- **Map node already active:** on a fresh save map 0 is pre-selected, so tapping it changes no state. The step still proves that the node is tappable (actionability) and that the featured panel reads map 0.
- **Confirm window:** see the two-tap gap rule above. A slow iPad screenshot (DPR 2) is the likely way to exceed it.
- **Pad occupied:** this cannot happen in a fresh run. If the tap misses or lands on an occupied pad, gold does not change and step 08 fails with expected vs actual gold. No retries: a retry could hide a coordinate bug.
- **Not enough gold:** `flowExpectations` throws before the browser launches. If balance changes so that map 0 can no longer afford archer + tier 2, the matrix says so directly instead of failing on a "Not enough gold!" toast.
- **The armed build stays armed after placing** (`place` does not clear the build): step 09 relies on resolveTap's tower-first order, which closes it.
- **The tap lands on the hero or an inspectable instead:** before the wave, the only inspectable is the hero at `path[0]` (the left edge), far from the centre pad. If a future map change moved it close, step 08 would fail visibly rather than pass by accident.
- **iPad is coarse:** in Chromium, `iPad Pro 11 landscape` (`isMobile`, `hasTouch`) reports `pointer: coarse`, so it gets 176-px rails and two-tap confirm. Step 01 asserts that pointer class. An iPad with a trackpad (fine pointer) belongs to G3.
- **Wrong pointer class or rail width:** step 01 (pointer class) and step 06 (`railGeometryProblems`) report it directly. A wrong rail offset would also make step 08 miss the 22-px slot radius.
- **Freeze check noise:** UIScene keeps running while paused but only drives DOM. Phaser `scene.pause` stops GameScene's update, tweens and timers. If the two samples differ, investigate the difference as a finding (something animates while paused). Do not loosen the comparison.
- **Headless frame rate:** every wait polls a DOM or canvas condition. The only fixed delay is the 500 ms freeze sample, which the check itself requires.

## Acceptance criteria

1. `npm run matrix` builds, serves, runs all 4 default devices, prints the per-device summary and writes `report.json`. It exits 0 on the current branch, with 12/12 desktop steps and 13/13 on each touch device.
2. Each check is shown able to fail by temporarily breaking the game in a scratch change, never committed: a wrong `stat-gold` makes step 08 or 11 fail; disabling the confirm gate (mouse path for touch) makes step 10 fail; removing `scene.pause()` makes step 13 fail. In each case the run exits 1.
3. `deviceFlow.test.js` is green and the full suite is green. Report the actual test count.
4. `--screens` output and behaviour are unchanged, checked with one `--screens --devices iphone` run.
5. The 12 curated JPGs are committed and linked in the PR, and the roadmap 2.4 checkbox is ticked with a pointer to this spec.

## Out of scope

- Real devices, iOS Safari / WebKit and Android Chrome on hardware: that is **G3**. This matrix is Chromium emulation only.
- A Playwright WebKit run, Sell / branch / long-press / drag-to-place flows (unit-tested in 2.1), maps other than 0, portrait/rotation (already in `--screens`), video, and CI wiring.

## Open questions

None blocking. The defaults are chosen above: the device set, strict console rule and committed shot list.
