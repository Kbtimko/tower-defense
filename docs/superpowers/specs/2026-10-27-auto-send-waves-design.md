# Waves auto-send after a countdown (backlog #51)

**Branch:** `visual/51-auto-send` (off `origin/visual/integration` e74371f). PR targets `visual/integration`.

## Intent

The original ask (`.claude/notes.md:281`): *"Today a wave starts only when the player
presses Send Wave (`GameScene._startWave`); the send-early bonus applies mid-wave only.
Add an inter-wave countdown (duration a tunable in `src/data/`, shown on the Send Wave
button). It auto-starts the next wave at zero, and pressing earlier still pays the early
bonus. Decide what happens while paused and before wave 1. Teach `src/sim/` the timing if
it changes balance."*

Why: with no time pressure between waves, a level's pace depends entirely on the player,
and the early-send bonus is a side feature. A Kingdom-Rush countdown makes the pace part
of the level. A countdown that runs out sends the next wave. Calling it early pays for
the seconds you skip. Per-map lengths let some levels offer more time and a bigger
possible bonus.

**Fidelity note.** The ask says pressing early "still pays the early bonus". That
element changed during design. The time-based bonus **replaces** today's alive-enemy
bonus (Claude's call, below). The user saw that call and did not object.

### Today (verified)

- `_startWave` (`src/scenes/GameScene.js:731-748`) pays `_computeEarlyBonus()` only when
  `waveMgr.isEarlyEligible` is true, and returns early while a wave is spawning.
- `_computeEarlyBonus` (`GameScene.js:1844-1851`) is `floor(0.5 × Σ live-enemy def.reward × rewardMult)`.
- `isEarlyEligible` is `active && spawnQ empty` (`src/systems/WaveManager.js:28-30`).
- Spawn delays add up across groups, so a wave's groups play one after another
  (`WaveManager.js:39-46`). Map 0 wave 1 is six drones at 1200 ms, so its last enemy
  spawns at 6000 ms.
- A wave clears only when the whole board is empty (`_checkWaveComplete`,
  `GameScene.js:769-785`). That sets `active = false`, pays `round(38 × rewardMult)`, then
  wins or shows the between-wave story banner. So sending early today already merges two
  waves into one clear bonus, and shows the banner keyed to the later wave.
- `_runMs` grows by speed-scaled `dtMs` while `currentWave > 0` (`GameScene.js:701-704`).
  It stops when the game is over (`:689-692`) and during hit-stop (`:694-698`).

## Decisions (the user's)

1. **Countdown start.** The countdown for wave N+1 starts on the frame wave N's last
   enemy spawns, i.e. the first frame the spawn queue is empty (`!waveMgr.hasQueuedEnemies`), even if the board cleared that same frame (ruling during Task 3; `isEarlyEligible` also needs `active`, which `_checkWaveComplete` clears first). It keeps
   running whether or not wave N has cleared. At zero the next wave sends itself. Waves
   may overlap. This deliberately changes difficulty.
2. **Length.** Set per map in `src/data/maps.js`, defaulting to **20 s** when a map leaves
   it out. It is counted in **game time**, so it runs twice as fast at 2x. Some maps get
   more than 20 s, for a bigger possible reward.
3. **Before wave 1:** no auto-start, so wave 1 is always manual. **After the final wave's
   spawns:** no countdown. **Paused, story dialog, codex:** the countdown freezes.
   **Between-wave story banner:** the countdown **holds** while the banner is visible and
   resumes when it is dismissed.
4. **Early bonus:** `floor(secondsLeft × goldPerSecond × map.rewardMult)`. The button
   shows it as `(+Ng)`, and it shrinks as the ring drains.
5. **Button, option B "ring badge":** a conic ring (same look as the ability cooldown
   rings, CSS conic driven by `--cd`) with the whole seconds left in its centre. It sits
   left of the label `▶ Send Wave N (+Ng)`. The ring is amber normally. In the last 5 s it
   turns red and ticks: a small scale pulse each second. Under reduced motion there is no
   pulse, only the colour change. After an auto-send, and while a wave is spawning, the
   button reads as it does today (`Wave N in progress...`, disabled).
6. **Off switch:** a Settings checkbox "Auto-send waves", **default ON**, saved through
   SaveManager settings.
7. **Balance:** if the simulator shows a map got harder because of overlap, **stretch that
   map's countdown** until its sim difficulty matches today's. Never ship harder numbers.
8. **Overlap is the normal case, and its costs are accepted** (user, after the builder
   check). Today's sim clears a board 20–101 s after the last spawn, and 50–87 % of waves
   per map take longer than 20 s (probe at e74371f, hindsight-best strategy). The user
   was shown the alternative, "never auto-send into a busy board", and chose the pure
   Kingdom-Rush send instead. Accepted consequences:
   - Most maps will calibrate to long countdowns (expect about 40–100+ s), so the 20 s
     default applies only where the sim allows it. A full skip on a long map pays
     proportionally more.
   - A between-wave story beat is skipped when its wave merges into the next one
     (`_checkWaveComplete` shows the panel for `currentWave` only). No queued or
     re-timed beats in this PR.
   - Merged waves pay one clear bonus per board-clear, not one per wave. No per-wave
     clear bonus in this PR.

## Claude's calls (the user saw these and did not object)

- C1. The time bonus **replaces** `_computeEarlyBonus`. The button shows one number, not
  two added together. Size `goldPerSecond` so that skipping a full 20 s pays about what
  today's bonus typically pays. The method is in "Calibration" below.
- C2. With auto-send **OFF**, only the send at zero stops. The ring and the shrinking
  bonus still run. At zero the button waits, with a bonus of 0.
- C3. Per-map lengths come from the simulator, not by eye.

## Spec-author calls (made here so a plan needs no further questions; vetoable, see Open questions)

- S1. **A manual send while the banner is visible also hides the banner.** Hold is defined
  as "banner visible". If the banner stayed up after a send, it would silently hold the
  *next* countdown too, possibly forever. Its text is about the wave that just cleared,
  so it is stale once the next wave launches.
- S2. **At zero with auto-send OFF, the ring is removed.** The button then reads exactly
  like today's between-waves `▶ Send Wave N+1`.
- S3. **Debug/capture levels default auto-send OFF.** A `?autosend=1` debug parameter
  turns it on. Normal levels, including a RETRY started from a debug level, use the real
  setting.
- S4. Ring colours: amber = `--ui-currency`, red = `--ui-danger`. These are the closest
  published tokens (`src/data/theme.js:4-17`). The palette has no "amber".
- S5. Calibration rules (match definition, 1-life tolerance, 3-second stability window,
  120 s cap, raised from a first draft's 90 s because map 6's slowest wave clears 101 s
  after its last spawn) as specified in "Calibration".
- S6. **Match must hold for two strategy readings** (Claude's call, after the builder
  check): replaying the strategy that won `before`, AND re-picking the best of the five.
  Re-picking alone could hide a map that got harder for the strategy a real player uses.

## Goals (testable)

- R1. A pure module `src/systems/waveCountdown.js` holds all countdown logic: trigger,
  start, tick, hold/resume, cancel, remaining, display seconds, warning, bonus, and
  auto-send decision. It has no Phaser import and is unit-tested under Vitest + jsdom.
- R2. Tunables live in `src/data/waveCountdown.js`: `defaultSec` (20), `goldPerSecond`
  (calibrated), `warnSec` (5), `ringQuantum`. The per-map field `waveCountdownSec` lives in
  `src/data/maps.js`. No countdown number appears in scene or entity logic.
- R3. The countdown for wave N+1 starts on the frame wave N's spawn queue empties, unless
  N is the final wave. It is never started for wave 1, and never twice for the same wave.
- R4. It ticks by the same speed-scaled `dtMs` that `_runMs` uses, and in the same frames.
  It does not tick when the scene is paused, during hit-stop, or once the game is over or
  won. It does not tick while held.
- R5. At zero, with auto-send on and the game not over, the next wave sends through the
  same `_startWave` path as a manual send: same `wave-start` SFX, wave banner, HUD, and
  preview refresh. It pays no bonus and shows no toast.
- R6. A manual send while the countdown is running pays `bonusFor(remainingMs)`. It toasts
  `+Ng` only when N > 0. The alive-enemy bonus (`_computeEarlyBonus`) is deleted.
- R7. The between-wave banner holds the countdown while visible. Dismiss resumes it. A
  manual send while it is visible hides it (S1).
- R8. Button: ring + seconds + `▶ Send Wave N+1 (+Bg)` while counting; red with a
  per-second pulse when `remaining ≤ warnSec`; no pulse when reduced motion is on.
  DOM writes are throttled to changes only.
- R9. Settings "Auto-send waves" checkbox, default ON. Saved as `settings.autoSend` and
  mirrored in the registry key `autoSend`. OFF behaves as C2/S2.
- R10. `_runMs` and the results time are unchanged in meaning. Countdown and hold seconds
  are game time, so they count toward the results time.
- R11. The sim models the new timing. Each next wave sends at `spawnsDone(previous) +
  countdown`, waves can overlap, builds happen at each send, and the clear bonus is paid
  per board-clear. A legacy `waveTiming: 'onClear'` mode reproduces today's results
  exactly.
- R12. Every map's countdown is calibrated so its sim difficulty is not harder than
  legacy (method below). Results go in the PR and in `.claude/notes.md`.
- R13. The harness stays deterministic. Debug levels default auto-send OFF. One new
  `--screens` check proves auto-send fires, and its control proves the check can fail.
  The matrix send-wave step proves wave 1 did not start on its own.

## Non-goals

- No per-wave lengths and no change to wave composition, spawn intervals, HP scaling,
  `startGold`, `rewardMult` or the clear bonus.
- No countdown before wave 1. No in-level Settings access, which stays world-map only
  (`MapSelectScene.js:629-630`).
- No audio tick and no new SFX. No hint or peek copy for the ring.
- No per-wave clear-bonus accounting under overlap. Today's "one bonus per board-clear"
  rule (`GameScene.js:769-773`) stays, and the sim models it.
- No sim modelling of early calls. The modelled player never presses early, so the sim
  still omits the early bonus.

## Anti-goals (must not happen)

- **Harness nondeterminism:** a capture or matrix run whose outcome depends on whether a
  wave sent itself.
- **Results-time drift:** the countdown and `_runMs` disagreeing about elapsed game time.
  The countdown must never use the scene Clock (`this.time`). That clock stops during
  hit-stop (`GameScene.js:585`) but does not follow `this.speed`.
- **A map silently harder:** shipping a countdown the calibration did not clear.

## Behaviour: state table

`cw` = `waveMgr.currentWave` (count of waves sent). `B` = `bonusFor(remainingMs)`.

| State | Entered when | Countdown | Button (`#wave-btn`) | Wave preview |
|---|---|---|---|---|
| **pre-wave-1** | level create, `cw = 0` | idle | enabled, `▶ Send Wave 1`, no ring | wave 1 |
| **spawning** | `_startWave` (manual or auto) | idle | disabled, `Wave cw in progress...`, no ring | wave cw+1 |
| **countdown** | queue empties, `!waveMgr.done` | running, ticks | enabled, ring (amber) + digits, `▶ Send Wave cw+1 (+Bg)` (no `(+…)` when B = 0) | wave cw+1 |
| **countdown-warn** | `0 < remaining ≤ warnSec·1000` | running | as countdown, ring red, pulse on each whole-second change (none under reduced motion) | wave cw+1 |
| **held-by-banner** | `_checkWaveComplete` shows a panel while counting | held (frozen) | as countdown, frozen digits and bonus, still enabled | wave cw+1 |
| **waiting-at-zero** | remaining hits 0 and auto-send OFF | expired (0) | enabled, `▶ Send Wave cw+1`, no ring (S2) | wave cw+1 |
| **paused** | `scene.pause()`: user pause, exit-confirm, codex, auto-pause | frozen (no `update`) | unchanged | unchanged |
| **final-wave** | final wave sent (`waveMgr.done`) | idle forever | disabled, `All Waves Done` (unchanged, `:1811-1813`) | none |
| **game over / won** | `_onDefeat` / `_onVictory` | frozen; never sends | results screen | hidden |

Transitions out of countdown: a manual press goes to spawning (pays B, cancels, hides the
banner). Zero with auto ON goes to spawning (no bonus). Zero with auto OFF goes to
waiting-at-zero. Waiting-at-zero goes to spawning on a press (no bonus), or on the first
frame auto-send is switched ON.

Freezing, verified per source:
- *User pause, exit-confirm, codex, visibility/portrait auto-pause.* All call
  `this.scene.pause()` (`GameScene.js:483, 499, 517, 453→491`), so `update` stops. That
  call is queued (memory: `scene.pause()` runs after the current step), so at most one
  more frame ticks. That is acceptable.
- *Story dialog.* `StoryDialogOverlay` does **not** pause the scene. It is only played for
  the briefing (`:342`, which is pre-wave-1, so no countdown exists) and the victory
  epilogue (`:1878`, game won, so `update` returns at `:689`). So it freezes by
  construction. Any future mid-level dialog must pause, or the countdown keeps running.
- *Hit-stop.* `update` returns before `dt` is computed (`:694-698`) for 50 ms real time
  (`HIT_STOP.duration`, `src/data/fx.js:186`). The countdown freezes with `_runMs`. That is
  correct: the freeze is a feel effect, not game time.
- *Between-wave banner.* `StoryManager.showBanner` is non-blocking DOM
  (`src/systems/StoryManager.js:19-24`), so the hold is explicit (R7).

### Frame order (GameScene.update, and mirrored by the sim)

After `_checkWaveComplete()` (`:718`), add one call, `_updateCountdown(dtMs)`:
1. If the trigger fires (R3), start the countdown with `countdownMsFor(map)`, and **do not
   tick it this frame**. The full length is then counted from the last-spawn frame.
2. Otherwise tick it by `dtMs`. Hold makes the tick a no-op.
3. If `shouldAutoSend` and `!this.over && !this.won`, call `_startWave({ auto: true })`.
   The `over` check matters: a leak earlier in the same frame can call `_onDefeat`, and
   `update` does not re-check `over` partway through.
4. Render the button (throttled).

Running after `_checkWaveComplete` settles the "zero on the same frame the wave clears"
case. The clear bonus is paid first, and a banner shown by that clear holds the countdown
before it can send.

## Edge cases

| # | Case | Required behaviour | Test |
|---|---|---|---|
| E1 | 2x speed | ticks by `delta × speed`; 10 s real = 20 s countdown; digits run twice as fast | scene |
| E2 | Pause mid-countdown | no `update`, no tick; resumes from the same ms | scene (paused scene → `update` not called; assert unchanged after resume) |
| E3 | Banner during countdown | hold on show, resume on dismiss; frozen bonus is what a press pays | scene |
| E4 | Zero on the same frame the board clears | clear bonus paid, then send (no banner), or hold (banner) and no send | scene |
| E5 | Final wave | no countdown after its spawns; button `All Waves Done` | pure + scene |
| E6 | Defeat during countdown / on the zero frame | never auto-sends after `over`; results unaffected | scene |
| E7 | Victory during countdown | impossible (victory needs `done`, and no countdown exists then); guarded anyway | pure |
| E8 | RETRY / leave to map mid-countdown | `create` makes a fresh countdown and clears the render cache. The cloned `#wave-btn` (`:644-647`) keeps classes, `data-secs` and inline `--cd`, so the first render must clear them all (same trap as `_resetPauseButton`, `:523-532`). | liveScene |
| E9 | Setting toggled mid-countdown | can't happen in-level today (Settings opens only from the world map). Read live anyway: OFF→ON while waiting-at-zero sends next frame; ON→OFF stops only the send | scene |
| E10 | Early press at 0.x s | `floor(0.x × gps × rm)` = 0 → no gold, no toast | pure |
| E11 | Press during hold | pays `bonusFor(frozen remaining)`, hides banner (S1) | scene |
| E12 | Hit-stop frame | no tick; `_runMs` unchanged too | scene |
| E13 | Huge `delta` (tab return, slow device) | remaining clamps at 0, never negative; at most one auto-send per frame (the new wave is spawning) | pure + scene |
| E14 | Map field missing / 0 / negative / NaN | `countdownMsFor` falls back to `defaultSec` | pure + data test |
| E15 | Single-enemy or zero-interval wave | queue empties on the first `waveMgr.update`; countdown starts that frame | pure |
| E16 | Debug `?wave=W` start (`applyDebugCapture`, `:118-121`) | countdown idle at start; `_startWave` pays 0 | debugCapture test |
| E17 | Press while scene paused (DOM is live under the overlay) | same as today, the wave sends; pays `B` for frozen remaining | note only |
| E18 | Manual press in waiting-at-zero | sends, bonus 0, no toast | pure + scene |
| E19 | Popover open at auto-send | hidden, as on a manual send (`:746`); content always = wave `cw+1` | scene |
| E20 | Display seconds | `ceil(remainingMs/1000)`: 20000→20, 19001→20, 1→1, 0 → ring hidden | pure |

## Design

### Tunables: `src/data/waveCountdown.js` (new)

```js
export const WAVE_COUNTDOWN = Object.freeze({
  defaultSec: 20,       // a map without waveCountdownSec
  goldPerSecond: /* calibrated, see Calibration; 2 decimals */,
  warnSec: 5,           // ring turns red and ticks at or below this
  ringQuantum: 0.005,   // --cd is written only when round(frac/q) changes (≤200 writes per countdown)
});
```
The pulse's scale and duration live in CSS keyframes, like `life-lost-pulse` (`index.html:243-264`).

### Per-map field: `src/data/maps.js`

`waveCountdownSec: <int>` only on maps calibrated above 20, with a one-line *why* comment
in the style of the existing `startGold`/`rewardMult` comments (e.g. `maps.js:112-118`).

### Pure module: `src/systems/waveCountdown.js` (new)

Plain state, no Phaser, mirrors the `WaveManager` style:

```js
export function countdownMsFor(map)                // positive finite map.waveCountdownSec*1000, else defaultSec*1000
export function shouldStartCountdown({ spawnsDone, done, currentWave, startedFor }) // spawnsDone && !done && currentWave>0 && startedFor !== currentWave
export class WaveCountdown {
  start(totalMs, forWave)   // running, remaining = total, held = false, startedFor = forWave
  tick(dtMs)                // no-op unless running && !held; clamps at 0
  hold() / resume()
  cancel()                  // idle; keeps startedFor so the same wave never re-arms
  get running()             // started and not cancelled (true at 0 while waiting)
  get remainingMs() / get totalMs() / get held()
  get displaySeconds()      // ceil(remainingMs/1000)
  get fraction()            // cooldownFraction(remaining, total), reuse src/systems/juiceMath.js:32
  isWarning(warnMs)         // 0 < remaining <= warnMs
  bonus({ goldPerSecond, rewardMult })  // running ? floor(remaining/1000 * gps * rm) : 0
  shouldAutoSend(enabled)   // enabled && running && !held && remaining === 0
}
export function lastSpawnMs(wave)  // same accumulation as WaveManager.startWave: harness + calibration
```
The sim imports `countdownMsFor` and `shouldStartCountdown`, keeping the fidelity contract
(`src/sim/simulate.js:7-17`).

### Button view: `src/systems/waveButtonView.js` (new, pure)

`waveButtonView({ done, active, spawning, currentWave, countdown, bonus, warnMs })` returns
`{ disabled, label, ring: null | { secs, frac, warn } }`. It covers the five states above
and replaces the branching in `_updateWaveButtonText` (`GameScene.js:1808-1828`). The labels
match today's literals exactly. The harness depends on `▶ Send Wave 1` (notes #47e;
`scripts/capture.mjs:1288, 1753, 1770`).

### GameScene (`src/scenes/GameScene.js`)

- `create()` (`:161-347`): `this._countdown = new WaveCountdown()`,
  `this._autoSendOverride = null`, `this._waveBtnCache = null`. All before
  `_updateWaveButton()` at `:320` and `applyDebugCapture` at `:346`.
- `_autoSendOn()`: `this._autoSendOverride ?? (this.game.registry.get('autoSend') !== false)`.
  It reads the registry live (E9).
- `_updateCountdown(dtMs)`: the frame order above, called after `:718`.
- `_startWave({ auto = false } = {})` (`:731-748`): return if spawning
  (`waveMgr.active && waveMgr.hasQueuedEnemies`) or `done`. If `!auto`, pay
  `this._countdown.bonus(...)` and toast when > 0. Then `_countdown.cancel()`, and if
  held, `storyMgr.hideBanner()`. The rest is unchanged: SFX, `startWave`, HUD, popover
  hide, `_updateWaveButton`. The DOM click at `:410` passes no args, so it is manual.
- `_checkWaveComplete` (`:769-785`): when a panel shows, call `this._countdown.hold()`
  first. `onDismiss` becomes `() => { this._countdown.resume(); this._updateWaveButton(); }`.
- `_updateWaveButtonText` becomes `_renderWaveButton(waveButtonView(...))`, which compares
  against `_waveBtnCache` and writes only what changed:
  - `textContent` + `disabled` when the label changes **or ring visibility changes**.
    Rewriting text on a ring toggle forces a `fitLabels` refit, because the observer
    watches text and `[hidden]` only, not class (`src/ui/fitLabels.js:82-89`).
  - class `cd-on` (ring visible), `cd-warn`; attribute `data-secs` when secs changes.
  - `style --cd` when `round(frac / ringQuantum)` changes.
  - `pulseClass(btn, 'cd-tick')` (`src/ui/pulse.js:5-10`) when secs changes while warn,
    unless `registry.get('ambientMotion') === false`.
  Each render clears everything it doesn't set, so the shutdown-clone residue is cleared
  (E8).
- The per-frame countdown path calls only the render, **never `_refreshWavePreview`**.
  `setWave` rebuilds the popover DOM (`src/ui/WavePreviewPopover.js:63-69`). The preview
  already describes `summarizeWave(mapId, currentWave)` (`:1834-1838`), which is the wave
  the button would send during a countdown.
- Delete `_computeEarlyBonus` (`:1844-1851`). Its only callers are `:733` and `:1816`.
- `applyDebugCapture` (`:104-139`): `scene._autoSendOverride = scene._debug.autoSend`
  before `_startWave`. Add `countdownMs` to `window.__capture`, updated in the debug block
  at `:682-685`: `this._countdown.running ? remainingMs : null`.

### Button CSS (`index.html`)

The ring is a **`#wave-btn::before` pseudo-element**, not a child element. Reasons:
- `fitLabels` treats a button with no element children as a plain label measured by
  text range (`fitLabels.js:59-62, 26-32`). A child `<span>` would make `button > span`
  labels get fitted against the whole button (`:7-8`).
- Playwright `textContent` skips pseudo content, so every `#wave-btn` text assertion
  stays valid.
- `kitRollout` exempts `::` selectors from its "no paint on kit elements" rule
  (`src/ui/kitRollout.test.js:141`), so the ring may set `background`.

Geometry, in game px relative to `#wave-btn`. The wrap is `2 × --hud-cell` by `--hud-cell`
(`index.html:996-997`), the button has a 3-px border (`:164`), so the face is about 82 tall
at the touch cell. The mockup's 40-in-64 ratio gives:
- ring: `calc(52px * var(--hud-k))` diameter, stroke about `calc(6px * var(--hud-k))`,
  absolutely positioned, vertically centred, left inset `calc(6px * var(--hud-k))`.
  `#wave-btn` gains `position: relative`.
- label clearance: `#wave-btn.cd-on { padding-left: calc(64px * var(--hud-k)); }`.
  `fitLabels` subtracts real padding (`fitLabels.js:17-20, 50`).
- digits: `content: attr(data-secs)`, bold, **`font-size: calc(24px * var(--hud-k))`**.
- arc: `conic-gradient(var(--wave-ring) calc(var(--cd, 0) * 360deg), <track> 0)`, masked
  to a donut. `--wave-ring: var(--ui-currency)`, and `#wave-btn.cd-warn` sets
  `--wave-ring: var(--ui-danger)`. Using a custom property keeps paint off the kit
  element (`kitRollout.test.js:150-151`).
- tick: `#wave-btn.cd-tick::before { animation: wave-cd-tick <~250ms>; }`, a scale pulse.
  Under `@media (prefers-reduced-motion: reduce)` the animation is `none`. Don't use an
  `sd-` or `rs-` keyframe prefix, which the story and results guards own.

Guards the ring touches:
- **typeFloor** (`src/ui/typeFloor.test.js:57, 69-75`). The digit size **must** be
  `calc(Npx * var(--hud-k))`. Written as `calc(N * var(--ui-u))` it fails: the guard
  resolves `--ui-u` to `1px`, below the 11-px floor (`:52-53`). Keep N ≥ 24 (the rail
  caption floor, `index.html:306-307`).
- **railCss** (`src/ui/railCss.test.js:77-89`): `#wave-btn::before` counts as a rail rule,
  so no bare px; `calc(Npx * var(--hud-k))` or `calc(N * var(--ui-u))` only.
- **themeCss** (`src/ui/themeCss.test.js:105-109`): only published `--ui-*` vars, no hex.
- **kitRollout**: as above. `#wave-btn` keeps exactly `ui-btn ui-btn--danger` (`:68`).
- **noNativeTitles**: no `title=` for the ring.
- **storyDialogCss / resultsCss**: untouched (their selectors are dialog/results-scoped).

### Settings

- `src/systems/SaveManager.js:9-11`: `defaultSettings()` gains `autoSend: true`. Old saves
  merge onto the defaults (`:125-127`), so they read `true` without a version bump.
  Writes use `setSettings`, which already calls `_refresh()` before patching (`:220-224`).
- `src/scenes/BootScene.js:39-47`: `registry.set('autoSend', sm.getSettings().autoSend !== false)`.
- `index.html:1409-1417`: a new `.settings-mute` row
  `<label><input id="auto-send" type="checkbox" /> Auto-send waves</label>`.
- `src/ui/SettingsOverlay.js:41-64`: the same shape as ambient motion. The checked state
  comes from the registry, and on change it sets the registry and calls
  `save.setSettings({ autoSend })`.

### Sim restructure (`src/sim/simulate.js`)

Today the loop is `for each wave { build; startWave; combat until board empty or 240 s;
pay clear bonus }` (`:184-423`). With no delay between waves, that is "send on clear".

New option `waveTiming: 'countdown' | 'onClear'`, default `'countdown'`. That is the
shipped game, so `npm run balance`'s headline reflects it. Restructure as one continuous
tick loop over the existing combat body (`:239-391`, unchanged):

```
build(); send(wave 1)                                   // build = existing :186-227, then recompute soldiers (:230)
each tick:
  waveMgr.update; combat body (unchanged)
  if waveMgr.active && !queued && enemies.length === 0:  // mirror _checkWaveComplete
      waveMgr.active = false; gold += round(38 × rewardMult)
      if waveMgr.done → won
      if 'onClear' → build(); send(next)
  if 'countdown':
      if shouldStartCountdown(...) → countdown.start(countdownMsFor(map), cw)   // no tick this frame
      else countdown.tick(dt*1000)
      if countdown.shouldAutoSend(true) → build(); send(next)
  on lives <= 0 → lost; on elapsed-since-last-send > maxSecondsPerWave → whatever the
  legacy loop does today (it moves on to the next wave rather than stopping; the
  parity gate below pins this)
```

- `soldiers` must be recomputed after every build, because it is currently computed once
  per wave (`:230`).
- **Legacy parity is a hard gate.** Under `'onClear'`, `simulateMap` must return a
  deep-equal result to the pre-change code for all 10 maps × 5 strategies. That includes
  today's quirks: the clear bonus is paid when `lives > 0` even after a timeout (`:398`),
  and a timed-out final wave still returns `won: true`. Capture the golden values from
  e74371f **before** refactoring.
- `waveLog` entries gain `sentAtMs`, `spawnsDoneAtMs`, `rewardAliveAtSpawnsDone` (Σ `def.reward`
  of live enemies on the spawns-done tick, before `rewardMult`) and `overlapped` (enemies
  alive at send). The result gains `overlapSends`. `livesLost` per entry becomes "lost
  between this send and the next".
- `findWinMultiplier` (`src/sim/deficit.js:12`) and `bestStrategy` (`src/sim/strategy.js:50`)
  forward `waveTiming`.
- Update the file header's simplifications (`:19-39`). The early bonus is still omitted
  because the modelled player never calls early. In `'countdown'` mode, waiting through
  the countdown on an empty board gives soldiers and hero extra regen and respawn time.
  That is slightly optimistic, and should be stated.

### Calibration (how lengths and `goldPerSecond` are picked)

A new `scripts/calibrateAutoSend.mjs` (`npm run calibrate:autosend`). It only reports and
never edits data, like `scripts/balance.mjs:4-5`. It runs locally on CPU at no API cost.
It is slow: about 10 maps × up to 70 lengths × `bestStrategy`, which is 5 runs plus a
bisection each. Expect minutes, and it is never part of `npm test`.

**goldPerSecond.** In `'onClear'` mode, under each map's hindsight-best strategy,
collect `0.5 × rewardAliveAtSpawnsDone` for every wave of every map. That is what today's
bonus pays at its best moment, the instant the countdown would start, before
`rewardMult`. Take the **median** M across all waves of all maps. Then
`goldPerSecond = round(M / defaultSec, 2)`, so a full 20-s skip pays about
`floor(M × rewardMult)`. Print M, p25 and p75. Rough check: map 0 wave 1 has about 5
drones alive × 14 × 0.5 ≈ 35, which gives about 1.75/s.

**Per-map length.**
- `before` = `bestStrategy(map, waves, { waveTiming: 'onClear' }).best`.
- `after(L)` = the same with `{ ...map, waveCountdownSec: L }` in countdown mode, computed
  twice (S6): `afterBest(L)` re-picks the best of the five strategies; `afterSame(L)`
  replays `before`'s winning strategy (via `findWinMultiplier` with that strategy's plan).
- **Match(L)** holds only when the three conditions below hold for BOTH `afterBest(L)`
  and `afterSame(L)` against `before`. "Difficulty matches today" means all three hold:
  1. `rank(after.multiplier) ≤ rank(before.multiplier)`, with null treated as ∞. This is
     the report's "needs Nx damage", `balance.mjs:93`.
  2. If both win at 1x: `after.run.livesRemaining ≥ before.run.livesRemaining − 1`. One
     life of tolerance covers sim noise; the 2026-10-21 spec saw ±15-pp swings from small
     inputs.
  3. The `verdict` tag (`balance.mjs:25-31`) is not a harder band. Order, hardest first:
     UNWINNABLE, PUNISHING, OK, TOO EASY.
- Scan whole seconds L = 20…120. Pick the smallest L where Match holds at L, L+1 and L+2.
  The sim isn't monotone, and this rules out a lucky single point. (A coarse 5-s scan
  followed by a 1-s refine is fine if the full scan is too slow; the L/L+1/L+2 check is
  still done at 1-s resolution.)
- L = 20 means the field is omitted. If no L ≤ 120 matches, **stop and ask the user**.
  Don't ship it, and don't raise the cap.

`npm run balance` gains a cheap section: per map, L, before (multiplier, lives kept %,
tag), after, and match. The regression stays visible on every run. Update its header text
(`balance.mjs:66-71`) to say waves auto-send.

### Harness

- `src/systems/debugCapture.js:27-64`: `parseDebugParams` returns
  `autoSend: params.get('autosend') === '1'`, default false. So every existing `?debug=1`
  capture keeps today's behaviour: the ring runs, nothing sends itself. A debug level's
  RETRY is a normal level (`GameScene.js:471-477`), so `_autoSendOverride` resets to null
  and it uses the seeded save's setting, defaulting to ON. Only wave 1 is pressed there
  (`capture.mjs:1296`), so it is unaffected.
- **New `--screens` run `auto-send`** (map 0, `wave=1`, capture build):
  - (a) `autosend=1`: wait until `__capture.countdownMs` is non-null and ≤ 1000. Assert
    `#stat-wave` = `1/10`, `#wave-btn` has `.cd-on` and its text matches `/^▶ Send Wave 2/`.
    Audit `#wave-btn` while `.cd-warn` with the existing in-game audit. Then
    `expectText('#stat-wave', '2/10')` with the default step timeout.
  - (b) control, `autosend=0`: wait until `__capture.countdownMs === 0`, wait 2 s, then
    assert `#stat-wave` is still `1/10`, `#wave-btn` reads `▶ Send Wave 2` and lacks
    `.cd-on`.
  - (b) proves (a)'s `2/10` comes from the countdown. Waits are keyed on game-time
    `countdownMs`, not on `simMs`, because `simMs` grows during hit-stop (`:682-685`)
    while the countdown doesn't.
  - Prove-it-fails, recorded in the PR: with `_updateCountdown`'s send stubbed out, (a)
    must fail at `2/10`.
- **Matrix step 17 `send-wave`** (`capture.mjs:1868-1876`). As its first action, assert
  `#stat-wave` = `exp.waveBefore`. Today that is checked only in step 5 (`:1752`), about
  ten steps earlier. Then a wave that started on its own can't make the step's "map
  changed within 5 s" check (`:1875`) pass without the tap. Prove it fails once by
  forcing an auto-start of wave 1. The matrix is a true first run (empty storage), so
  auto-send is ON. That is safe: map 0 wave 1's last spawn is at 6 s, plus 20 s, and step
  18 pauses within seconds of the tap. No timeout changes.

## Files that change

| File | Change |
|---|---|
| `src/data/waveCountdown.js` | new: tunables |
| `src/data/maps.js` | `waveCountdownSec` on calibrated maps only |
| `src/systems/waveCountdown.js` (+ test) | new: pure state machine |
| `src/systems/waveButtonView.js` (+ test) | new: pure button view |
| `src/scenes/GameScene.js` | create init, `_autoSendOn`, `_updateCountdown`, `_startWave`, `_checkWaveComplete`, render, delete `_computeEarlyBonus`, `applyDebugCapture` |
| `src/systems/debugCapture.js` (+ test) | `autosend` param |
| `src/systems/SaveManager.js` (+ test) | `autoSend: true` default |
| `src/scenes/BootScene.js` | registry `autoSend` |
| `src/ui/SettingsOverlay.js` (+ test) | checkbox wiring |
| `index.html` | ring CSS, settings row |
| `src/sim/simulate.js`, `deficit.js`, `strategy.js` (+ tests) | timing option, restructure |
| `scripts/balance.mjs`, `scripts/calibrateAutoSend.mjs`, `package.json` | report section, calibration script, npm script |
| `scripts/capture.mjs` | `auto-send` screens run, step-17 precondition |
| `GameScene.startWave.test.js`, `GameScene.updateWaveButton.test.js`, `GameScene.wavePreview.test.js` | rewrite the alive-enemy-bonus cases. The behaviour is deliberately removed (C1), not a loosened test. |

## Test strategy

Every new test is first run against deliberately broken code and must fail for the
specific reason (memory: "prove the test fails"). The "break" column is the planned
sabotage.

| Test | Asserts | Break it by |
|---|---|---|
| waveCountdown: start/tick/clamp | remaining = total − Σdt, floors at 0 | drop the clamp |
| hold/resume | held tick is a no-op | ignore `held` in tick |
| cancel / no re-arm | `shouldStartCountdown` false for `startedFor === currentWave` | drop the guard |
| final wave / pre-wave-1 | no trigger when `done` or `currentWave === 0` | drop `!done` |
| displaySeconds / isWarning | E20 table; 5000 warn, 5001 not, 0 not | `Math.floor` |
| bonus | full, fractional, 0.4 s → 0, rewardMult applied | `Math.round` |
| shouldAutoSend | enabled/held/zero matrix | ignore `enabled` |
| countdownMsFor | E14 fallbacks | return raw field |
| lastSpawnMs | map 0 wave 1 = 6000; multi-group sequential | per-group max |
| waveButtonView | the 5 states, exact labels (`▶ Send Wave 1`, `Wave 3 in progress...`, `All Waves Done`) | swap a label |
| GameScene frame (frameScene pattern, `GameScene.results.test.js:55-101`) | starts on spawns-done; sends at zero; SFX `wave-start` once; no toast; `_runMs` delta == countdown delta over a run incl. 2x and hit-stop frames | tick with real `delta` |
| defeat same frame | no `startWave` after `over` | drop the `over` check |
| clear + zero same frame | bonus then send; banner → hold, no send | tick before `_checkWaveComplete` |
| banner | hold/resume; press while held pays frozen B and hides banner | skip `hold()` |
| manual press | pays B, toasts; B=0 → no toast; live enemies alone pay nothing | keep `_computeEarlyBonus` |
| auto OFF | waits at zero, ring removed, press pays 0; turning ON sends next frame | send regardless of flag |
| throttle | over N frames inside one displayed second, `textContent` written once (MutationObserver count); `--cd` writes ≤ 1/quantum | write every frame |
| popover | per-frame render never calls `setWave`; content = wave `cw+1` | call `_updateWaveButton` per frame |
| RETRY (liveScene, `gameSceneHarness.js:56-83`) | residue (`cd-on`, `cd-warn`, `data-secs`, `--cd`) gone; idle; `▶ Send Wave 1` | skip clearing in render |
| SaveManager | default true; old save → true; `setSettings({autoSend:false})` keeps other keys | omit default |
| SettingsOverlay | checkbox ↔ registry ↔ save | forget the save write |
| debugCapture | `autosend` absent → false, `=1` → true | default true |
| sim legacy golden | deep-equal to e74371f for 10 maps × 5 strategies | change the tick order |
| sim countdown | `sentAtMs(n+1) = spawnsDoneAtMs(n) + L` within one tick; overlap is possible; clear bonus per board-clear | send on clear |
| maps data | every `waveCountdownSec` absent or an integer in (20, 120] | — |
| CSS guards | typeFloor/railCss/themeCss/kitRollout green | write the digit size in `--ui-u` (typeFloor must fail) |

Report the full suite count in the PR.

## Live verification (before PR)

`npm run build && npm run preview`, then in a real browser:
- the ring drains, with the `(+Ng)` bonus shrinking;
- red and pulsing at ≤5 s, with no pulse under the Ambient motion OFF setting;
- auto-send at zero, with SFX and banner;
- 2x halves the wall time;
- pause freezes it;
- a map 0 wave 3 clear shows the banner and holds; dismiss resumes;
- auto-send OFF waits at zero;
- the results time looks sane.

Also run the `--screens auto-send` run and the full matrix. Use frozen-frame probes for
the ring (memory), and check legibility on a phone-size device.

## Left to the builder

- The exact ring and donut CSS technique (mask vs stacked gradients), track colour, pulse
  scale and duration. Geometry within ±4 game px of the above if screenshots demand it,
  confirmed by the in-game audit on desktop + iPhone.
- The exact `goldPerSecond` and per-map `waveCountdownSec` values, produced by the
  calibration method. Record the full before/after table and the M/p25/p75 figures in the
  PR and in `.claude/notes.md`.
- Whether `waveButtonView` takes the countdown object or plain fields.
- Backlog update in `.claude/notes.md` after shipping.

## Resolved questions

- Q1 (S1): a manual send while the banner is up dismisses it. Spec-author call, kept.
- Q2: cap raised to 120 s (S5). If a map still can't match, the builder stops and asks.
- Q3: one clear bonus per board-clear is accepted by the user (Decision 8). Per-wave
  clear bonuses and re-timed story beats are follow-up backlog candidates, not this PR.
- Builder check: `after(L)` is checked under both strategy readings (S6).

## Follow-ups to log in the backlog after shipping

- Per-wave clear bonus under overlap.
- Story beats lost when their wave merges into the next (queue them for the next clear).
