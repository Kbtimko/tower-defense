# Auto-send Waves (#51) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a wave's last enemy spawns, a per-map countdown (ring badge on Send Wave) runs; at zero the next wave sends itself, and calling it early pays gold for the seconds skipped.

**Architecture:** One pure state machine (`src/systems/waveCountdown.js`) and one pure button view (`src/systems/waveButtonView.js`) drive both `GameScene` and the headless sim. The sim gains a `waveTiming` option so balance before/after is measurable, and a report-only calibration script picks `goldPerSecond` and each map's `waveCountdownSec`. The ring is a `#wave-btn::before` pseudo-element. The capture harness defaults auto-send OFF on debug levels and gains one run that proves it fires.

**Tech Stack:** Phaser 3, Vite 5, Vitest 2 + jsdom, vanilla ES modules, Playwright (harness).

**Spec:** `docs/superpowers/specs/2026-10-27-auto-send-waves-design.md` (read it; this plan does not repeat its reasoning, state table or edge-case table — task tests reference them by ID, e.g. E13).

## Global Constraints

- Work only in the worktree `/Users/keithtimko/projects/tower-defense/.claude/worktrees/auto-send-51`, branch `visual/51-auto-send`. Run every command from there. Stage explicit paths only (never `git add -A`/`.`). Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tunables live in `src/data/` (`src/data/waveCountdown.js`, per-map `waveCountdownSec` in `src/data/maps.js`). No countdown number literal in scene/entity/sim logic.
- `WAVE_COUNTDOWN = { defaultSec: 20, goldPerSecond: <calibrated in Task 4; 1.75 provisional>, warnSec: 5, ringQuantum: 0.005 }`, frozen.
- `waveCountdownSec` is absent (→ 20) or an integer in (20, 120].
- Bonus = `floor(remainingMs / 1000 × goldPerSecond × rewardMult)`. It REPLACES `_computeEarlyBonus`, which is deleted.
- Countdown ticks by the same speed-scaled `dtMs` as `_runMs`, never the scene Clock (`this.time`).
- Exact button labels: `▶ Send Wave ${n}`, `▶ Send Wave ${n} (+${b}g)`, `Wave ${n} in progress...`, `All Waves Done`.
- Settings key `autoSend` (default `true`), registry key `autoSend`, checkbox `#auto-send` labelled `Auto-send waves`.
- Kit CSS: only published `--ui-*` vars, no hex; rail lengths as `calc(Npx * var(--hud-k))`. The ring digit font-size MUST be `calc(24px * var(--hud-k))` (or larger N) — `--ui-u` fails typeFloor. Guards that must stay green: themeCss, kitRollout, noNativeTitles, railCss, typeFloor, storyDialogCss, resultsCss.
- Every new test is first run against deliberately broken code and must fail for the specific reason (spec "Test strategy" table, "Break it by" column). Record each break-and-fail in the task report.
- Never loosen an existing timeout. Never pipe test/build output through `head`/`tail`; check the exit code.
- Tests that import anything that transitively imports Phaser must `vi.mock('phaser', …)` as the neighbouring GameScene tests do.

## Review Focus

1. **Double send on the zero frame:** a click on Send Wave landing just after an auto-send must not start a second wave. `_startWave` returns while the new wave is spawning. → Task 6 test `manual press right after auto-send is a no-op`.
2. **Displayed bonus ≠ paid bonus:** the `(+Ng)` the player reads must be exactly what a press in that frame pays. → Task 6 test `press pays the bonus the label shows`.
3. **Longest real label with the ring:** map 9's wave-18 label, with its full bonus, must fit beside the ring on iPhone and desktop without wrapping or clipping. → Task 8, `auto-send` run audits a map-9 `wave=17` countdown.
4. **Stale ring after RETRY / exit:** the shutdown clone of `#wave-btn` carries `cd-on`, `cd-warn`, `data-secs`, `--cd`. → Task 6 liveScene RETRY test.
5. **Huge frame delta (tab return, slow phone):** remaining clamps at 0 and at most one wave sends per frame (E13). → Task 1 pure test + Task 6 scene test with `delta = 60000`.

---

### Task 1: Countdown state machine and tunables  (model: sonnet)

**Files:**
- Create: `src/data/waveCountdown.js`, `src/systems/waveCountdown.js`, `src/systems/waveCountdown.test.js`
- Modify: `src/data/maps.test.js` (data contract for `waveCountdownSec`)

**Interfaces:**
- Produces (exact):
  - `WAVE_COUNTDOWN` (frozen object, Global Constraints values; `goldPerSecond: 1.75` with a comment `// provisional — Task 4 calibrates`).
  - `countdownMsFor(map) → number` — `map.waveCountdownSec * 1000` when it is a positive finite number, else `WAVE_COUNTDOWN.defaultSec * 1000`.
  - `shouldStartCountdown({ spawnsDone, done, currentWave, startedFor }) → boolean` — `spawnsDone && !done && currentWave > 0 && startedFor !== currentWave`.
  - `class WaveCountdown`: `start(totalMs, forWave)`, `tick(dtMs)`, `hold()`, `resume()`, `cancel()`; getters `running`, `held`, `remainingMs`, `totalMs`, `startedFor`, `displaySeconds` (`ceil(remainingMs/1000)`), `fraction` (via `cooldownFraction` from `src/systems/juiceMath.js`); methods `isWarning(warnMs)` (`0 < remaining ≤ warnMs`), `bonus({ goldPerSecond, rewardMult })` (`running ? floor(remainingMs/1000 × gps × rm) : 0`), `shouldAutoSend(enabled)` (`enabled && running && !held && remainingMs === 0`).
  - `cancel()` sets `running = false` and keeps `startedFor`, so the same wave never re-arms. `running` stays true at 0 (waiting-at-zero).
  - `lastSpawnMs(wave) → number` — the same delay accumulation as `WaveManager.startWave` (`src/systems/WaveManager.js:39-46`): sum of `interval` over every enemy except the last.

- [ ] **Step 1: Write failing tests** in `src/systems/waveCountdown.test.js` covering the spec's Task-1 rows: start/tick/clamp (E13: `tick(60000)` on a 20000 total → `remainingMs === 0`, never negative); hold makes tick a no-op; `cancel` then `shouldStartCountdown({…, startedFor: 3, currentWave: 3})` is false; no trigger when `done` or `currentWave === 0`; E20 table (`20000→20, 19001→20, 1→1`); `isWarning(5000)` true at 5000, false at 5001 and 0; bonus: `remaining 20000, gps 1.75, rm 1 → 35`, `remaining 400 → 0` (E10), `rm 0.5` halves before flooring; `shouldAutoSend` truth table over `enabled × held × remaining∈{0,1}`; `countdownMsFor` E14 (`{}`, `{waveCountdownSec: 0}`, `-5`, `NaN`, `'30'` → 20000; `{waveCountdownSec: 45}` → 45000); `lastSpawnMs(MAP_WAVES[0][0]) === 6000` (derive the expected value from the table in the test, don't hardcode 6000 alone: assert it equals `(count−1)×interval` for that single-group wave) and a two-group synthetic wave sums sequentially; a single-enemy wave → 0 (E15).
- [ ] **Step 2:** In `src/data/maps.test.js` add `every waveCountdownSec is absent or an integer in (20, 120]` over real `MAPS`.
- [ ] **Step 3:** Run `npx vitest run src/systems/waveCountdown.test.js src/data/maps.test.js` → FAIL (module missing).
- [ ] **Step 4:** Implement both files.
- [ ] **Step 5:** Run the same command → PASS. Then apply each "Break it by" sabotage from the spec table (drop clamp, ignore held, drop startedFor guard, drop `!done`, `Math.floor` in displaySeconds, `Math.round` in bonus, ignore `enabled`, return raw field, per-group max in lastSpawnMs) one at a time and confirm the named test fails; restore.
- [ ] **Step 6: Commit** `feat(waves): pure wave countdown state machine (#51)`.

### Task 2: Pure Send Wave button view  (model: sonnet)

**Files:**
- Create: `src/systems/waveButtonView.js`, `src/systems/waveButtonView.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 at runtime except `cooldownFraction`.
- Produces: `waveButtonView({ done, spawning, currentWave, countdown, bonus, warnMs }) → { disabled, label, ring }` where `countdown` is `{ running, remainingMs, totalMs } | null` and `ring` is `null | { secs, frac, warn }`.
  - `done` → `{ disabled: true, label: 'All Waves Done', ring: null }`
  - `spawning` → `{ disabled: true, label: \`Wave ${currentWave} in progress...\`, ring: null }`
  - `countdown?.running && remainingMs > 0` → `{ disabled: false, label: bonus > 0 ? \`▶ Send Wave ${currentWave + 1} (+${bonus}g)\` : \`▶ Send Wave ${currentWave + 1}\`, ring: { secs: ceil(remainingMs/1000), frac: cooldownFraction(remainingMs, totalMs), warn: remainingMs <= warnMs } }`
  - otherwise (pre-wave-1, waiting-at-zero) → `{ disabled: false, label: \`▶ Send Wave ${currentWave + 1}\`, ring: null }`

- [ ] **Step 1:** Failing tests: one per state above with exact labels; pre-wave-1 label is exactly `▶ Send Wave 1`; bonus 0 → no `(+…)`; warn boundary at `warnMs` and `warnMs + 1`; waiting-at-zero (`running: true, remainingMs: 0`) → no ring.
- [ ] **Step 2:** `npx vitest run src/systems/waveButtonView.test.js` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS; sabotage (swap a label; `<` for `<=` on warn) → the named test fails; restore.
- [ ] **Step 5: Commit** `feat(waves): pure Send Wave button view (#51)`.

### Task 3: Simulator wave timing  (model: opus — parity with today is a hard gate)

**Files:**
- Create: `scripts/captureSimGolden.mjs`, `src/sim/__fixtures__/legacyGolden.json`, `src/sim/waveTiming.test.js`
- Modify: `src/sim/simulate.js` (header `:19-39`, loop `:184-423`), `src/sim/deficit.js:12`, `src/sim/strategy.js:50`

**Interfaces:**
- Consumes: `countdownMsFor`, `shouldStartCountdown`, `WaveCountdown` (Task 1).
- Produces:
  - `simulateMap({ …existing, waveTiming = 'countdown' })` — `'countdown' | 'onClear'`.
  - `waveLog[i]` gains `sentAtMs`, `spawnsDoneAtMs`, `rewardAliveAtSpawnsDone` (Σ `def.reward` of live enemies on the spawns-done tick, before `rewardMult`), `overlapped` (enemies alive at send). Result gains `overlapSends` and `boardClears` (number of board-clear bonuses paid). These are logged in BOTH modes (Task 4 reads `rewardAliveAtSpawnsDone` in onClear mode); parity compares only the golden's keys. In countdown mode `livesLost` per entry = lives lost between this send and the next.
  - `findWinMultiplier(map, waves, { buildPlan, max, tolerance, waveTiming })` and `bestStrategy(map, waves, { waveTiming } = {})` forward `waveTiming` to every `simulateMap` call.

- [ ] **Step 1: Capture golden BEFORE touching the sim.** Write `scripts/captureSimGolden.mjs`: for every map in `MAPS` with waves, for every strategy in `CANDIDATE_STRATEGIES`, store `simulateMap({ map, waves, buildPlan: strategyPlan(s) })` (all defaults) keyed `${map.id}:${strategyLabel(s)}`, written as JSON to `src/sim/__fixtures__/legacyGolden.json`. Run it with `node scripts/captureSimGolden.mjs`; confirm 50 keys. Commit the script + fixture alone: `test(sim): golden results before the wave-timing refactor (#51)`.
- [ ] **Step 2: Failing tests** in `src/sim/waveTiming.test.js`:
  - `onClear parity`: for every golden key, `simulateMap({…, waveTiming: 'onClear'})` picked down to the golden's keys (top-level and each `waveLog` entry's keys) deep-equals the golden.
  - `countdown sends at spawnsDone + L`: map 0, `{ ...MAPS[0], waveCountdownSec: 30 }`: for every n ≥ 1, `sentAtMs(n+1) − spawnsDoneAtMs(n)` is within one tick (`dt×1000`) of 30000.
  - `overlap happens`: map 0 with `waveCountdownSec` absent → `overlapSends > 0`.
  - `clear bonus per board-clear`: a synthetic two-wave map where wave 2 is sent before wave 1 clears pays `round(38 × rewardMult)` once, not twice: `boardClears === 1` and gold reflects one bonus.
  - `bestStrategy forwards waveTiming`: `bestStrategy(map, waves, { waveTiming: 'onClear' }).best.run` deep-equals (legacy keys) the golden for that best strategy.
- [ ] **Step 3:** `npx vitest run src/sim/waveTiming.test.js` → the parity tests PASS (the unknown `waveTiming` param is ignored by today's code) and the countdown tests FAIL. Confirm they fail because the new log fields / timing are missing, not from a typo.
- [ ] **Step 4: Restructure** `simulateMap` into one continuous tick loop per the spec's "Sim restructure" pseudocode: extract the build phase (`:186-227`) into a local `build(waveIndex)` and recompute `soldiers` after every build; one `send()` that records `sentAtMs`/`overlapped` and calls `waveMgr.startWave()`; the unchanged combat body; board-clear mirrors `_checkWaveComplete`; countdown mode uses `WaveCountdown` exactly as GameScene will (start on `shouldStartCountdown`, no tick that frame, else tick; `shouldAutoSend(true)` → build + send). The timeout keeps today's semantics (onClear moves on to the next wave after `maxSecondsPerWave`), which the parity test pins. Update the header simplifications: no early calls modelled; countdown waits on an empty board give soldiers/hero extra regen (slightly optimistic).
- [ ] **Step 5:** Run `npx vitest run src/sim` → all PASS, including the pre-existing sim tests.
- [ ] **Step 6:** Sabotage: change tick order (tick on the start frame) → the 30000 test fails; send on clear in countdown mode → the overlap test fails; restore.
- [ ] **Step 7:** `npm run balance` still runs to exit 0 (its numbers will now reflect countdown mode with L=20 — expected to be harder; Task 4 fixes the data).
- [ ] **Step 8: Commit** `feat(sim): model wave countdown and overlap (#51)`.

### Task 4: Calibration, balance report, data values  (model: sonnet; the controller runs the long calibration)

**Files:**
- Create: `scripts/calibrateAutoSend.mjs`, `src/sim/verdict.js`, `src/sim/verdict.test.js`
- Modify: `package.json` (`"calibrate:autosend": "node scripts/calibrateAutoSend.mjs"`), `scripts/balance.mjs` (header `:66-71`, new section), `src/data/waveCountdown.js` (`goldPerSecond`), `src/data/maps.js` (`waveCountdownSec` per calibrated map, one-line *why* comment like the existing `startGold`/`rewardMult` comments)

**Interfaces:**
- Consumes: `simulateMap`, `bestStrategy`, `findWinMultiplier`, `strategyPlan` with `waveTiming` (Task 3).
- Produces: the calibrated data; a report printed to stdout.

- [ ] **Step 1:** Write `scripts/calibrateAutoSend.mjs` (report-only, never edits files), args `--map N` optional:
  - **goldPerSecond:** under each map's onClear best strategy, collect `0.5 × rewardAliveAtSpawnsDone` for every wave; print median M, p25, p75 and `round(M / 20, 2)`.
  - **Per-map L:** `before = bestStrategy(map, waves, { waveTiming: 'onClear' }).best`. For L in 20…120: `afterBest(L)` = `bestStrategy({ ...map, waveCountdownSec: L }, waves).best`; `afterSame(L)` = `findWinMultiplier` + `simulateMap` with `before.strategy`'s plan in countdown mode. `Match(L)` = for both readings: multiplier rank not worse (null = ∞); if both win at 1×, `livesRemaining ≥ before.livesRemaining − 1`; verdict band not harder (UNWINNABLE > PUNISHING > OK > TOO EASY, verdict rules copied from `balance.mjs:25-31` — export `verdict` from `balance.mjs`'s logic into `src/sim/verdict.js` and import it in both rather than copy). Pick the smallest L with Match at L, L+1, L+2. A 5-s coarse scan then 1-s refine is allowed. Print per map: L (or `NONE ≤120`), before (mult, lives kept %, tag, strategy), afterBest, afterSame.
- [ ] **Step 2:** `src/sim/verdict.js` gets a unit test (`kept 0.9 → TOO EASY`, `0.25 → PUNISHING`, lost → UNWINNABLE), proven to fail with the thresholds swapped.
- [ ] **Step 3:** `scripts/balance.mjs`: header says waves auto-send after a per-map countdown; new section "Auto-send countdown" printing per map: L, before (onClear), after (countdown, current data), match yes/no. Headline uses countdown mode (the shipped game).
- [ ] **Step 4 (controller, background):** `npm run calibrate:autosend > <scratchpad>/calibrate.txt`; check exit code. **If any map prints `NONE ≤120`, STOP and report to the controller — do not ship data for it.**
- [ ] **Step 5:** Set `goldPerSecond` and every map's `waveCountdownSec` (omit where L = 20) from the report. Re-run `npm run balance`: every map shows `match yes`. Save the before/after table for the PR.
- [ ] **Step 6:** `npx vitest run` full suite green.
- [ ] **Step 7: Commit** `feat(balance): calibrate auto-send countdowns per map (#51)`.

### Task 5: Auto-send setting  (model: opus)

**Files:**
- Modify: `src/systems/SaveManager.js:9-11`, `src/scenes/BootScene.js:39-47`, `index.html:1409-1417`, `src/ui/SettingsOverlay.js:41-64`
- Test: `src/systems/SaveManager.test.js`, `src/ui/SettingsOverlay.test.js`

**Interfaces:**
- Produces: `save.getSettings().autoSend` (boolean, default `true`); registry `autoSend` = `getSettings().autoSend !== false`; `#auto-send` checkbox.

- [ ] **Step 1:** Failing tests: fresh save → `autoSend === true`; a stored v5 envelope without `autoSend` → `true`; `setSettings({ autoSend: false })` keeps `ambientMotion`/`muted`; SettingsOverlay: checkbox reflects registry, change sets registry AND calls `save.setSettings({ autoSend })`.
- [ ] **Step 2:** Run those test files → FAIL.
- [ ] **Step 3:** Implement, mirroring the `ambient-motion` row and handler exactly (new `.settings-mute` row after `map-grade`).
- [ ] **Step 4:** Run → PASS; sabotage (omit default; drop the save write) → named tests fail; restore. Run the settings-related capture guard tests if any reference the row count (grep `settings-mute`).
- [ ] **Step 5: Commit** `feat(settings): Auto-send waves toggle (#51)`.

### Task 6: GameScene countdown integration  (model: opus)

**Files:**
- Modify: `src/scenes/GameScene.js` — `create()` (`:161-347`), `update()` (after `_checkWaveComplete()` at `:718`, and the debug block `:682-685`), `_startWave` (`:731-748`), `_checkWaveComplete` (`:769-785`), `_updateWaveButtonText` (`:1808-1828`), delete `_computeEarlyBonus` (`:1844-1851`), `applyDebugCapture` (`:104-139`)
- Modify tests: `src/scenes/GameScene.startWave.test.js`, `GameScene.updateWaveButton.test.js`, `GameScene.wavePreview.test.js` (rewrite alive-enemy-bonus cases — removed on purpose, spec C1)
- Create: `src/scenes/GameScene.countdown.test.js` (frameScene pattern from `GameScene.results.test.js:55-101`; RETRY via `liveScene` from `src/scenes/gameSceneHarness.js:56`)

**Interfaces:**
- Consumes: Tasks 1, 2, 5 (`registry.get('autoSend')`).
- Produces: `scene._countdown` (WaveCountdown), `scene._autoSendOn()`, `scene._updateCountdown(dtMs)`, `scene._startWave({ auto = false } = {})`, `scene._renderWaveButton()`, `scene._waveBtnCache`, `scene._autoSendOverride` (null | boolean), `window.__capture.countdownMs` (`running ? remainingMs : null`, debug block only). DOM contract for Task 7: `#wave-btn` gets class `cd-on` (ring visible) and `cd-warn`, attribute `data-secs`, inline style `--cd` (fraction, quantised by `ringQuantum`), and `cd-tick` via `pulseClass` (`src/ui/pulse.js`) on each whole-second change while warn unless `registry.get('ambientMotion') === false`.

- [ ] **Step 1: Failing tests** in `GameScene.countdown.test.js` — one per spec "Test strategy" GameScene row, plus Review Focus 1, 2, 4, 5:
  - starts on the spawns-done frame and does not tick that frame; sends at zero; `wave-start` SFX once; no toast on auto-send.
  - `_runMs` delta equals countdown delta over a run with `speed 2` frames and a hit-stop frame (E1, E12).
  - defeat earlier in the same frame → no `startWave` (E6).
  - clear + zero on the same frame: clear bonus paid then send; with a banner panel → hold, no send (E4).
  - banner: hold on show, resume on dismiss; press while held pays the frozen bonus and hides the banner (E3, E11).
  - manual press pays `bonus` and toasts `+Ng`; bonus 0 → no toast; live enemies alone pay nothing.
  - **press pays the bonus the label shows:** after a render, parse `(+Ng)` from `#wave-btn` text; a press in the same frame raises gold by exactly N.
  - **manual press right after auto-send is a no-op** (wave still spawning): `currentWave` unchanged, no gold.
  - auto OFF (`registry autoSend: false`): waits at zero, ring removed, press pays 0; set registry true → sends next frame (E9, E18).
  - throttle: 30 frames of 16 ms inside one displayed second → `textContent` written once (MutationObserver count); `--cd` writes ≤ 30.
  - popover: the per-frame path never calls `_wavePreview.setWave`; an auto-send calls `_wavePreview.hide()` and the refreshed preview describes wave `currentWave + 1` (E19).
  - **huge delta:** one `update(0, 60000)` during a countdown → exactly one `startWave`.
  - final wave: no countdown after its spawns; label `All Waves Done` (E5).
  - **RETRY residue (liveScene):** set `cd-on cd-warn`, `data-secs`, `--cd` on `#wave-btn`, restart the scene → all gone, text `▶ Send Wave 1`.
  - debug override: `scene._debug.autoSend === false` → `_autoSendOverride === false` → no send at zero (E16).
- [ ] **Step 2:** `npx vitest run src/scenes/GameScene.countdown.test.js` → FAIL for the right reasons.
- [ ] **Step 3:** Implement per the spec's "GameScene" and "Frame order" sections. `_autoSendOn()` = `this._autoSendOverride ?? (this.game.registry.get('autoSend') !== false)`. `applyDebugCapture` sets `scene._autoSendOverride = scene._debug.autoSend === true` before `_startWave()` (Task 8 adds `autoSend` to the parsed params; until then `undefined === true` → false, i.e. OFF on debug levels). The render clears every class/attr/style it doesn't set (shutdown-clone residue, `:644-647`). Keep `_updateWaveButton()` (render + preview refresh) for state changes; the per-frame path calls only `_renderWaveButton()`.
- [ ] **Step 4:** Rewrite the three existing test files' early-bonus cases to the time bonus; delete assertions about `_computeEarlyBonus`.
- [ ] **Step 5:** `npx vitest run src/scenes` → PASS. Sabotage each named break (tick with real `delta`; drop the `over` check; tick before `_checkWaveComplete`; skip `hold()`; keep `_computeEarlyBonus`; send regardless of flag; write every frame; call `_updateWaveButton` per frame; skip clearing in render) → the named test fails; restore.
- [ ] **Step 6:** Full suite `npx vitest run` green.
- [ ] **Step 7: Commit** `feat(waves): auto-send countdown in GameScene (#51)`.

### Task 7: Ring badge CSS  (model: opus)

**Files:**
- Modify: `index.html` (wave button rules near `:293`, `:317-324`, `:996-997`; reduced-motion block)
- Test: existing guards `src/ui/typeFloor.test.js`, `railCss.test.js`, `themeCss.test.js`, `kitRollout.test.js`, `noNativeTitles` test

**Interfaces:**
- Consumes: Task 6 DOM contract (`cd-on`, `cd-warn`, `cd-tick`, `data-secs`, `--cd`).

- [ ] **Step 1:** Read `src/ui/typeFloor.test.js` and `railCss.test.js` to confirm they scan every `index.html` rule including `#wave-btn::before` (spec: `typeFloor.test.js:57, 69-75`, `railCss.test.js:77-89`). If either skips pseudo-element selectors, extend its selector scan so `#wave-btn::before` is covered — that extension is this task's failing test.
- [ ] **Step 2:** Implement per the spec "Button CSS": `#wave-btn { position: relative }`; `#wave-btn.cd-on { padding-left: calc(64px * var(--hud-k)) }`; `#wave-btn.cd-on::before` = 52-game-px donut (`calc(52px * var(--hud-k))`), `content: attr(data-secs)`, digit `font-size: calc(24px * var(--hud-k))`, arc `conic-gradient(var(--wave-ring) calc(var(--cd, 0) * 360deg), <track> 0)` masked to a donut; `--wave-ring: var(--ui-currency)`, `#wave-btn.cd-warn { --wave-ring: var(--ui-danger) }`; `@keyframes wave-cd-tick` (~250 ms scale pulse) on `#wave-btn.cd-tick::before`, `animation: none` under `prefers-reduced-motion: reduce`. Ring hidden unless `.cd-on`.
- [ ] **Step 3:** `npx vitest run src/ui` → all guards green. Sabotage: write the digit size as `calc(24 * var(--ui-u))` → typeFloor fails; write a bare `52px` → railCss fails; restore.
- [ ] **Step 4:** Live look (controller does the device check in Task 9; the implementer does a quick one): `npm run build && npm run preview`, open map 0 on desktop 1440×900, send wave 1, screenshot the ring mid-countdown and in warn; LOOK at it (Read the PNG). Ring must not overlap the label; label must not wrap.
- [ ] **Step 5: Commit** `feat(hud): Send Wave countdown ring (#51)`.

### Task 8: Harness determinism and auto-send proof  (model: opus)

**Files:**
- Modify: `src/systems/debugCapture.js:27-64` (+ its test), `scripts/capture.mjs` (`gotoLevel` `:734-742`, screens run list `:588-601`, matrix step `send-wave` `:1868-1876`)

**Interfaces:**
- Consumes: `window.__capture.countdownMs`, `_autoSendOverride` (Task 6); `countdownMsFor`, `lastSpawnMs` (Task 1).
- Produces: `parseDebugParams(...).autoSend` (`params.get('autosend') === '1'`); `gotoLevel(page, base, mapId, save, wave = 1, extraParams = {})`; screens run `auto-send`.

- [ ] **Step 1:** debugCapture test: absent → `autoSend: false`; `autosend=1` → `true`; `autosend=0` → `false`. Prove it fails with default `true`. Implement.
- [ ] **Step 2:** `gotoLevel` gains `extraParams` appended to the URL.
- [ ] **Step 3:** New `captureAutoSend(browser, base, deviceName, dir)` via `screensRun(…, 'auto-send', {}, …)`, pushed onto `runs` for every device. Each sub-run is a fresh `gotoLevel` with save `{ version: 4, maps: noStars(), seenStoryBeats: ALL_BEATS_SEEN }` (no story dialog in the way). Neither map 0 wave 1 nor map 9 wave 17 has a between-wave banner (`STORY_PANELS`: map 0 waves 3,7; map 9 waves 6,12), so no hold can stall the waits:
  - (a) map 0, `wave=1`, `{ autosend: '1' }`: wait (`page.waitForFunction`, timeout derived from data: `(lastSpawnMs(MAP_WAVES[0][0]) + countdownMsFor(MAPS[0])) × 2 + STEP_TIMEOUT`) until `__capture.countdownMs !== null && __capture.countdownMs <= 1000`; assert `#stat-wave` = `1/10` (derive from `MAP_WAVES[0].length`), `#wave-btn` has `.cd-on` and text matches `/^▶ Send Wave 2/`; then `expectText('#stat-wave', '2/10')` with the default step timeout.
  - (b) control, `{ autosend: '0' }`: wait until `__capture.countdownMs === 0`, `page.waitForTimeout(2000)`, assert `#stat-wave` still `1/10`, text `▶ Send Wave 2`, no `.cd-on`.
  - (c) longest label (Review Focus 3): map 9 (`FINAL_MAP`), `wave=17`, `{ autosend: '0' }`: wait (timeout `lastSpawnMs(MAP_WAVES[FINAL_MAP][16]) × 2 + STEP_TIMEOUT`) until `countdownMs` is non-null and > `warnSec×1000`; shoot `auto-send-longest.png`; run the existing in-game `audit` on `#wave-btn`; then wait until `.cd-warn`, shoot `auto-send-warn.png`, audit again.
  - Record in the PR: with `_updateCountdown`'s send stubbed out, (a) fails at `2/10`.
- [ ] **Step 4:** Matrix `send-wave` step: first line `await expectText(page, '#stat-wave', exp.waveBefore)` (`exp.waveBefore` already exists; step 5 uses it at `capture.mjs:1752`). Prove it fails once by forcing an auto-start of wave 1 (temporary hack, reverted).
- [ ] **Step 5:** `npm run build` then `npm run capture -- --screens --devices desktop,iphone` → 0 problems; then `npm run matrix` (check `uptime` first; under load compare against the base before reading a failure). Look at the `auto-send-*` PNGs yourself.
- [ ] **Step 6: Commit** `test(capture): prove auto-send fires and keep debug levels deterministic (#51)`.

### Task 9: Gates, live verification, docs  (controller, not a subagent)

- [ ] `npx vitest run` (report the count), `npm run build`, `npm run matrix`, `npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad` → zero problems.
- [ ] Live check on the production build (`npm run build && npm run preview`, scratchpad `playwright-core` + cached chromium-1248) at desktop 1440×900 and iPhone 14 with real `page.mouse`/`touchscreen`: every bullet of the spec's "Live verification"; frozen-frame probe of the ring; LOOK at every capture.
- [ ] Captures as JPEG q90 in `docs/captures/51-auto-send/`.
- [ ] `.claude/notes.md`: status line, calibration table, backlog #51 ✅, follow-ups (per-wave clear bonus; merged-wave story beats) as new backlog items; session file `.claude/sessions/2026-10-27-auto-send.md`. Commit on the branch, then PR into `visual/integration`.
