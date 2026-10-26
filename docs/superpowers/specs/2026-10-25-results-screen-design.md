# Roadmap 3.6: results screen and stars (design)

**Branch:** `visual/3.6-results-stars` (off `origin/visual/integration` at `a2eeed1`, which includes 3.4 world map and 3.5 story dialogs) · **Date:** 2026-10-25, updated 2026-10-26 (user decisions 6–7, builder-check correction); updated 2026-10-26: §8.2 container tiers · **PR targets** `visual/integration`, not `main`.
**Approved mockup:** `.superpowers/brainstorm/18926-1792977250/content/results-directions-v2.html`, option **B · Action-comic finale**. Its CSS (`.B …`, `@keyframes slam/stamp/chip/shake`) is the seed for the choreography in §6. It is a rough sketch, not a pixel spec.

**Prerequisite (user decision 7):** the stale-`SaveManager` write fix (§4.4) ships first as its own hotfix PR to `main`, and is then forward-ported into `visual/integration`. 3.6 implementation starts only once that forward-port is in `origin/visual/integration`. Rebase this branch onto it before the first task.

Tags used below: **[User]** = decided by the user, not reopened here. **[Claude]** = Claude's call; the user may override it. **[Builder]** = left to the implementer, within the stated constraints.

## 1. Intent

### The literal ask
- Roadmap 3.6: *"Victory/defeat screens with stats, 3-star rating (lives remaining thresholds in `src/data/`), `SaveManager` extended + tests."*
- From the brainstorm, the user picked direction **B** and made decisions 1–7 in §2.

### Where this departs from the mockup
- **Defeat speaker.** The mockup shows Rael on a loss. The user chose **the Veth taunting** instead [User, decision 5]. Rael does not appear on the results screen.
- **Compact layout.** The mockup's absolute layout (vertical button stack in the bottom-right, chips at 57 % height) does not fit the smallest map area (≈ 588×331 CSS px on iPhone 14 landscape). On compact screens the button stack moves into a right-hand column (§8.2) [Claude]. Tall screens keep the mockup composition.
- **Kicker tab.** Option B has no mission name on screen. A small ink tab on the banner reads `MISSION 3 · THE CRATER` [Claude], so a screenshot or a retry loop still says where you are.
- **Caption colour.** The mockup's caption is cream (`#fff6d8`), which is not a token. The caption uses the speaker's own 3.5 caption colour from `STORY_SPEAKERS`: Command gold, Veth pale violet and jagged. This keeps one look per speaker across the game [Claude].

### Why
Today a win or loss ends on the small `#game-msg` kit panel ("🏆 Victory! ★★☆ — 214 kills", one button). It doesn't celebrate the win, doesn't explain the stars, and offers no retry. A player chasing 3★ has to go back to the world map and re-launch. The 3.5 comic look gives the end of a level the same voice as the story.

### Goals
1. Every level ends on a results screen in the 3.5 action-comic look: a banner, stars (victory only), stat chips, a one-line reaction in a caption box, and buttons.
2. The star rule lives in `src/data/` as tunables with a pure, tested `starsFor`. It is **byte-for-byte the same rule** as today (§4.2).
3. One tap or key finishes the reveal; a second action acts. A stray tap (the killing blow, the epilogue's closing tap, a double tap) never presses a button.
4. **RETRY** restarts the same map cleanly: no stacked listeners, no replayed story beats, and the first-clear flight is still owed.
5. **NEXT MISSION** goes to the world map. The 3.4 flight plays on a first clear, and the next map's briefing card opens with LAUNCH focused, on a first clear and on a replay alike.
6. Per-map **fewest lives lost** and **fastest time** are saved (save v5, migrated). The results screen stamps NEW BEST when a stat is beaten. A meta upgrade can't fake one.
7. It works inside the map area at 1440×900, 844×390, 932×430 and 750×340: buttons ≥ 44×44 CSS px on touch and compact, text ≥ 11 px, nothing clipped, with and without webfonts.

### Non-goals
- New story text in `STORY_SEQUENCES`, new portrait art, voice or SFX. The results lines are new data in `src/data/results.js`, not story beats, and they never appear in the Story Log.
- Score, difficulty modes or leaderboards (roadmap 5.3 "per-map best score" builds on the records added here).
- Changing the star thresholds, or how stars feed `getTotalStars()` and the Doctrine tree.
- Redesigning `#game-msg`. It stays as is for the Exit/abandon confirm.
- Changing the device-matrix step table (§12.3).
- The stale-save write fix itself, which is a prerequisite hotfix (§4.4).

### Anti-goals (it "works" but counts as a failure)
- **A stray tap that presses a button.** This covers the tap that killed the last enemy, the epilogue's closing tap, and the second tap of a double tap.
- **A reveal you can't skip,** or a skip that leaves something invisible (a chip stuck at opacity 0).
- **A retry that changes the game.** Enemies spawning twice (the listener-leak bug), a briefing replaying, the HUD showing the old run's gold, lives or wave, or a lost first-clear flight.
- **A held key that acts twice.** Enter held through NEXT MISSION must not also launch the next map or skip the flight. Space held through RETRY must not pause the new level.
- **NEW BEST on a stat that wasn't beaten.** That includes a first clear, the first clear after a save migration, and a lives record "beaten" only because the Garrison upgrade raised the starting lives.
- **A rule change hiding in the refactor.** Any map/lives pair that gets a different star count than today.
- **Hex, named colours or bare px borders** in the results CSS. Speaker colours hardcoded in UI code.
- **Results text or buttons spilling out of the map area,** or covered by a rail, on any listed device.

## 2. User decisions
Decisions 1–5 were made on 2026-10-25 and 6–7 on 2026-10-26.

1. **Direction B · Action-comic finale**, continuing the 3.5 look [User]:
   - a skewed full-width banner slams in from the left: gold "SECTOR HELD!" on victory, danger-red "THE LINE FELL" on defeat; italic Orbitron, ink stroke, hard drop shadow
   - a halftone dot wash
   - three stars stamp down in sequence (scale 3 → 1, about 250 ms apart); unearned stars are hollow, in the edge colour
   - stat chips pop in, slightly rotated (alternating ±2°)
   - then a caption box with a portrait (bottom-left) delivers a one-line reaction
   - then the button stack (bottom-right, vertical, comic offset shadow). The primary button is filled gold on victory, danger red on defeat.
   - **Victory chips:** Lives (n/start), Kills, Gold earned, Time. **Defeat chips:** Wave (reached/total), Kills, Gold earned, Time. No stars on defeat.
2. **The star rule is unchanged:** 3★ if lives/startLives ≥ 0.8, 2★ if ≥ 0.5, else 1★. It moves out of `GameScene._onVictory` into `src/data/` as tunables, with a pure, unit-tested `starsFor`. Stars feed `getTotalStars()` (meta upgrades), so behaviour must not change [User].
3. **NEXT MISSION** (the victory primary) goes to the world map through the existing `{ from }` return. The 3.4 flight plays on a first clear as today, and then the next map's briefing card opens with LAUNCH ready and focused. On a replay of a cleared map there is no flight, and it still lands on the next map's briefing [User].
4. **Per-map best record:** `SaveManager` stores a per-map best record (as refined by decision 6) and fastest time (stars already keep the max). The results screen stamps NEW BEST on a beaten stat. The save envelope version goes up, with a migration that preserves existing saves, plus tests [User].
5. **Speakers:** victory is Sol Command (`STORY_SPEAKERS.command`), with lines chosen by star count (a few variants per tier). Defeat is the Veth (`STORY_SPEAKERS.veth`: violet, jagged, glitch) taunting. Lines live in `src/data/` and are picked deterministically. Command calls the player "Commander" [User].
6. **Garrison and records** [User, 2026-10-26]:
   - The per-map record stores **fewest lives lost** (`startLivesOfRun − livesLeft`), not a raw lives count. Buying `log_garrison` (+2 starting lives) therefore can't fake a NEW BEST.
   - The Lives chip shows the honest run count, Garrison included (e.g. `17/22`).
   - The star rule is unchanged and still divides by `map.startLives`.
   - The briefing card's best line reads e.g. `★★☆ · Best: 0 lost · 9:42`.
7. **The stale-save write fix ships first** [User, 2026-10-26]:
   - It goes out as its own hotfix PR to `main`: a `fix/` branch off `origin/main`, with a failing test first.
   - It is then forward-ported into `visual/integration` before 3.6 implementation starts.
   - 3.6 builds on the fixed `SaveManager` (mutators re-read storage before patching). The v5 migration and the records use that same freshness path (§4.4).

## 3. Claude's calls
Calls 1–9 were made before this spec and are recorded here. Calls 10 onward were added while writing it. Each is a default the user may override. Calls 12, 14 and the record half of 16 are now settled by user decisions 6–7; the call text says so.

1. **Time** is in-game simulated time with pauses excluded: the sum of `delta × speed`. 2× speed does not shorten it, so a record rewards sending waves early, not fast-forwarding. Where it is accumulated, and from when, is in §5.3.
2. **Gold earned** is a new per-run income counter. Starting gold is **excluded**.
3. **Final map** (`MAPS.length - 1`) has no next mission. The kicker reads **CAMPAIGN COMPLETE** and WORLD MAP is the primary button.
4. **RETRY** is new, on both screens, and is the primary on defeat. Story beats already seen don't replay (`hasSeenBeat`). Retry goes through the same clean shutdown as leaving to the map, and emits no `from`/arrival state.
5. **Input:** a tap, click or key skips the reveal to its end state, and a second action then acts. A 250-ms guard covers double taps. Held-key repeats are swallowed. Focus is trapped, a live region announces the result, and reduced motion gives no slam or stamp, just a fade.
6. **The victory story dialog** (`victorySequenceId`) still plays **before** the results screen.
7. **The results screen replaces** the victory/defeat use of `#game-msg`. `#game-msg` stays for the Exit confirm (`_showConfirmExit`).
8. Exit and Pause stay disabled at game end, as today.
9. `_commitStats` is unchanged.
10. **The clock starts at Send Wave 1** and stops at the end of the level. Planning before wave 1 and reading the briefing don't count; that time is free already, since you can pause at will. Hit-stop frames don't count either: the simulation is frozen for them.
11. **Sell refunds are not income.** `EconomyManager` gains `refund()`, which `TowerPlacementManager.sellTower` uses, so "Gold earned" is kills + wave-clear bonus + send-early bonus.
12. **Lives chip vs star rule (settled by user decision 6).** The chip shows `lives / run start lives`, Garrison included, which is the number the HUD showed at wave 1. The star rule keeps dividing by `map.startLives`, as today. The record stores lives lost, so the mismatch can't produce a fake NEW BEST.
13. **Bug fix found while researching: a defeat and a victory can both fire in the same frame** (§5.4).
    - What happens: the last enemy of the last wave leaks and costs the last life. `_onDefeat` runs, and then `_checkWaveComplete` in the same `update()` calls `_onVictory`.
    - Result today: a victory overlay over the loss, 1★ saved at 0 lives, and `_commitStats` run twice.
    - Root cause: `_onVictory` checks `won` but not `over`.
    - Builder check confirmed this call ("defeat wins").
14. **Stale `SaveManager` writes (settled by user decision 7).** This was found while researching and is now a prerequisite hotfix, not 3.6 work (§4.4).
15. **The retry chain carries `entryStars`** (the map's saved stars when the chain began). If you first-clear a map, RETRY, then leave, the flight still plays. Without this, `_returnToMap` reports the retried run's `prevStars` (already ≥ 1) and the first-clear flight is lost for good.
16. **Records:**
    - They are written on **victory only**.
    - The two stats are kept independently: **fewest lives lost** (decision 6) and **fastest time**. Lower is better for both.
    - Ties are not a new best, and invalid values are ignored.
    - **NEW BEST needs a previous record.** There is no stamp on a first clear, or on the first clear after a v4 → v5 migration (nothing was beaten).
17. **Keys:**
    - Enter or Space activates the focused button, which is the primary by default.
    - **Escape = WORLD MAP** once the screen is ready. During the reveal, Escape, like any action, only skips.
    - Tab cycles the visible buttons.
    - Other keys are swallowed so no game shortcut fires.
18. **The 250-ms guard is a new `RESULTS.actGuardMs`.** It is not `CONFIRM_WINDOW_MS`, which is the 2.5-s touch two-step-confirm window in `src/data/input.js`. The value matches `STORY_DIALOG.advanceGuardMs`.
19. **The results buttons are comic surfaces, not kit `.ui-btn`s,** because the mockup's filled gold/danger buttons with ink offset shadows aren't a kit variant. This differs from 3.5, where Skip/Next stayed kit buttons.
20. **The backdrop covers the whole `#game`** (the rails are dimmed and inert, as under the story dialog). The composition lays out in the **map rect** (`--map-*`). z-index is 26 (§8.3).
21. **All three star slots stamp,** so the rhythm is the same for every count. Unearned stars land hollow, with no glow.
22. **Line picks:**
    - victory: index = `mapId`
    - defeat: index = `mapId + wave reached`, so retrying a map you keep losing on varies the taunt with where you fell
    - the final map has its own one-line-per-tier Command pool
23. **The portrait's outline is the speaker's colour,** not the result hue (the 3.5 identity rule). The Veth keeps its jagged caption and glitch, reusing 3.5's `sd-glitch` keyframes.
24. **The briefing card shows the best run** on its stars line, worded as in user decision 6: `★★☆ · Best: 0 lost · 9:42`. There is no new row, so the card's height and layout are unchanged.
25. **Game end hides lingering peeks:** the tower tooltip, inspector peek and panel, and wave preview, which sit above z 26.
26. **The defeat Wave chip** is `waveMgr.currentWave / waveMgr.waves.length` (the wave that broke the line), not clamped.
27. **RETRY uses `this.scene.restart({ mapId, heroId, entryStars })`.** No `debug` is carried, so in the capture build a retried level is a normal level.
28. **After any results action, a module-level gesture-tail swallow** (taps for `actGuardMs`, the closing key's repeats and keyup) outlives the scene switch. `MapSelectScene._skipArrival` ignores events already `defaultPrevented`.
29. **Device matrix (`npm run matrix`) step table unchanged.** The results screen is covered by `--screens` runs with real input (§12).
30. **`window.__capture.end(result, overrides)`** gains capture-only overrides, so the harness can lay out worst-case content (§12.2).

## 4. Data model

### 4.1 `src/data/results.js` (new): tunables, copy and lines
```js
// The star rule (roadmap 3.6). Ordered best-first; a win always earns at least `floor`.
export const STAR_RULE = Object.freeze({
  thresholds: Object.freeze([
    Object.freeze({ stars: 3, minRatio: 0.8 }),
    Object.freeze({ stars: 2, minRatio: 0.5 }),
  ]),
  floor: 1,
});

// Reveal timings (ms) and look (§6). Seeded from the approved mockup.
export const RESULTS = Object.freeze({
  fadeMs: 200,              // root dim fade; the only animation under reduced motion
  bannerMs: 400, skewDeg: 5, compactSkewDeg: 3,
  shakeAtMs: 400, shakeMs: 400,                       // defeat banner text
  starsAtMs: 500, starEachMs: 250, starMs: 350, starFromScale: 3,
  defeatChipsAtMs: 500, chipEachMs: 100, chipMs: 300, chipTiltDeg: 2,
  newBestDelayMs: 50, newBestMs: 250,
  captionOverlapMs: 50, captionMs: 350,
  actionsGapMs: 50, actionsMs: 300,
  actGuardMs: 250,
  maxLineChars: 64,
});

export const RESULTS_COPY = Object.freeze({
  banner: { victory: 'SECTOR HELD!', defeat: 'THE LINE FELL' },
  kicker: (missionNo, name) => `MISSION ${missionNo} · ${name.toUpperCase()}`,
  campaignComplete: 'CAMPAIGN COMPLETE',
  chips: { lives: 'LIVES', wave: 'WAVE', kills: 'KILLS', gold: 'GOLD', time: 'TIME' },
  newBest: 'NEW BEST',
  actions: { next: 'NEXT MISSION ▸', retry: '↻ RETRY', map: 'WORLD MAP' },
  actionNames: { next: 'Next mission', retry: 'Retry', map: 'World map' },   // aria-label
});

export const RESULT_SPEAKERS = Object.freeze({ victory: 'command', defeat: 'veth' });
```

**Lines** (`RESULT_LINES`, same file) [Claude, writing per decision 5]. Every line is ≤ `maxLineChars`, which a test enforces.

```js
export const RESULT_LINES = Object.freeze({
  victory: Object.freeze({
    3: ['Not a scratch on the line. Textbook, Commander.',
        'Clean sweep. Command is putting that one in the manuals.',
        'Barely touched. That is how it is done, Commander.',
        'Flawless hold. The convoys owe you an hour, Commander.'],
    2: ['Sector held. A few got through. Tighten it up, Commander.',
        'The line bent, but it held. Good work, Commander.',
        'Held, with losses. Earth will take it. Patch the gaps.'],
    1: ['Held, by a thread. Too close, Commander.',
        'We kept the sector. Barely. Rebuild and do better.',
        'A win is a win. That one nearly cost us everything.'],
  }),
  // The last map: campaign_ending has just played, so these close the war, not a sector.
  final: Object.freeze({
    3: ['Every line held, Commander. History will remember this one.'],
    2: ['It is over. Earth stands because you did, Commander.'],
    1: ['We kept the last light burning. Only just. Rest now, Commander.'],
  }),
  defeat: Object.freeze([
    'Your light goes out so easily.',
    'Another wall of yours, broken. We are patient.',
    'You built your towers. We built a tide.',
    'Run home, little commander. We will follow.',
    'This world tastes of iron and fear. We will finish it.',
  ]),
});
```
- "little commander" echoes the Veth's line in `brief_last_light`.
- [Builder] may use typographic apostrophes (`’`). The lines above avoid contractions so the source stays ASCII-quote-safe.

### 4.2 Star rule: unchanged behaviour
- `starsFor(lives, startLives, rule = STAR_RULE)` (§5.1) returns the first `thresholds[i].stars` whose `lives / startLives >= minRatio`, else `floor`. It's the same expression as today's `pct >= 0.8 ? 3 : pct >= 0.5 ? 2 : 1`, with the same `>=`, in the same order. `GameScene` still calls it with `this.economy.lives` and **`MAPS[mapId].startLives`**, not the Garrison-inclusive run start (decisions 2 and 6).
- **Float boundaries:** a division whose true value is exactly 0.8 (16/20, 12/15) rounds to the same double as the literal `0.8`, so `>=` holds exactly as it does today. The test is an **oracle equivalence** over real data (§12.1-1), not hand-picked numbers.
- **Inputs today's code never sees** are pinned by tests, with no behaviour invented beyond today's: a NaN ratio falls through to `floor` (as today); `startLives <= 0` or non-finite also returns `floor`. The unreachable "lives 0 on a win" case is removed at its source, the same-frame defeat/victory (§5.4), not inside `starsFor`.

### 4.3 Save schema v5 [User decisions 4 and 6; shape: Claude]
The current envelope is **v4** (`VERSION = 4` in `src/systems/SaveManager.js`, verified). v5 adds one field:

```js
records: [ null | { livesLost: number|null, timeMs: number|null }, ... ]   // length MAP_COUNT (10), indexed by mapId
```
- `livesLost`: the **fewest lives lost** on a win, `startLivesOfRun − livesLeft`. It's an integer ≥ 0, and **lower is better**.
  - `startLivesOfRun` is `map.startLives + mods.startLivesBonus` (`GameScene._startLives`), so Garrison's +2 cancels out. A 20/20 clear and a 22/22 clear both lose 0.
- `timeMs`: the fastest winning run time in integer ms (lower is better).
- The fields are independent: a run can set one without the other. `null` means no record.

**Migration `migrateV4toV5(env)`:** `{ ...env, version: 5, records: Array(MAP_COUNT).fill(null) }`.
- The loader's accepted set becomes versions 1–5. The v1/v2/v3 branches chain through `migrateV3toV4` and then `migrateV4toV5`.
- A migrated save is written back at once, as the existing branches do.
- Every other field (maps, upgrades, stats, settings, selectedHeroId, seenStoryBeats) is preserved byte-for-byte.

**`_normalize`** also carries `records`:
- an array of length `MAP_COUNT` is mapped through `sanitizeRecord` (§5.1)
- anything else becomes `Array(MAP_COUNT).fill(null)`
- a future version (> 5) keeps its records, sanitized, as the existing future-version branch does
- Because the prerequisite fix's storage re-read goes through `_normalize` (§4.4), extending `_normalize` is what makes every mutator's refresh carry `records`. No mutator may bypass it.

**New API:**
- `getRecord(mapId)`: a **copy** `{ livesLost, timeMs }`, or `null`.
- `recordRun(mapId, { livesLost, timeMs })`: returns `{ newBest: { livesLost: boolean, time: boolean } }`.
  - Like every other mutator, it first re-reads storage through the prerequisite's refresh helper.
  - It then merges with `mergeRecord` (§5.1) and saves only if something changed.

**Downgrade note** (no action): if an older v4 build ever read a v5 save, it would load it through the future-version branch and drop `records` on its next write. Preview and production are separate origins, so this only matters for a rollback of `main` after this ships.

### 4.4 Save write freshness: a prerequisite, landed via hotfix and forward-port [User decision 7]
- **Defect, for the record:** each `SaveManager` instance wrote its full `_data` snapshot on every setter.
  - BootScene's instance (`registry 'save'`) is shared by `AudioManager` (debounced `setSettings`) and `SettingsOverlay` (`ambientMotion`, `mapGrade`).
  - GameScene and MapSelectScene each create their own instance.
  - So a volume or motion change on the world map after a win wrote the boot-time `maps` back. Stars, upgrades and seen beats earned since boot were lost on reload.
- **Shipped separately, before 3.6:**
  - It ships as a `fix/` branch off `origin/main`, with a failing two-instance test first and a hotfix PR to `main`.
  - It is then forward-ported into `visual/integration`.
  - The fix: every mutator re-reads storage (parse + `_normalize`; on a parse failure it keeps the in-memory copy) before applying its patch and writing.
- **What 3.6 relies on and must keep:**
  - The new `recordRun` and the v5 migration use **the same freshness path**: the hotfix's refresh helper, called `_refresh()` here (use whatever name actually landed).
  - `_normalize` (which the refresh calls) carries `records` (§4.3), so a refresh never drops them.
  - No 3.6 code writes `this._data` without refreshing first.
- **Before task 1, the plan must verify** that the forward-port is in `origin/visual/integration`. Grep `SaveManager.js` for the helper, and check that its two-instance test exists.

### 4.5 `src/data/campaign.js`
`CARD_COPY` gains `best: 'Best: '`, `lostWord: 'lost'` and `bestSep: ' · '` for the briefing-card line (decision 6, Claude's call 24).

## 5. Module breakdown (one concern per module)

### 5.1 Pure modules (Vitest, no DOM, no Phaser)
| Module | Exports (signatures) | Notes |
|---|---|---|
| `src/systems/starRating.js` (new) | `starsFor(lives, startLives, rule = STAR_RULE) → 1..3` | §4.2. No other export. |
| `src/systems/runRecord.js` (new) | `livesLostFor(startLivesOfRun, livesLeft) → integer ≥ 0 \| null`; `sanitizeRecord(raw) → record \| null`; `mergeRecord(prev, run) → { record, newBest: { livesLost, time } }` | `livesLostFor` is `max(0, start − left)` for finite integers, else `null`. Valid `livesLost`: finite integer ≥ 0. Valid `timeMs`: finite > 0, rounded to an integer. **Both are lower-is-better.** An invalid run field is ignored, keeping prev. `newBest.x` is true only if `prev?.x` was a valid number and the run is **strictly lower**; ties aren't a new best. A record whose fields are both null sanitizes to `null`. |
| `src/systems/resultsTimeline.js` (new) | `resultsTimeline(result, cfg = RESULTS) → { banner, shake, stars[], chips[], newBest[], caption, actions, endMs }` (each `{ at, ms }`; `shake` null on victory; `stars` empty on defeat) | The pure schedule of §6.1. `newBest[i]` is the stamp slot for chip `i`. |
| `src/systems/resultsFlow.js` (new) | `openFlow(now, { motion, endMs }) → state`; `tickFlow(state, now) → state`; `pressFlow(state, now, cfg) → { state, act }` | State `{ phase: 'revealing'\|'ready', openedAt, readyAt, endMs }`. See §7.2. Returns new objects, never mutates. |
| `src/systems/resultsModel.js` (new) | `resultsModel(run, { maps, lines, copy, speakers }) → model`; `pickResultLine({ result, stars, final, mapId, wave }, lines) → string`; `longestResultLine(lines) → string` | §5.2 shape. `run = { result, mapId, lives, startLives, stars, kills, goldEarned, timeMs, wave, waveCount, newBest }`. |
| `src/systems/missionExit.js` (new) | `exitPayload({ mapId, result, entryStars, savedStars, runStars, next }) → from` | §9.1. Replaces the inline maths in `_returnToMap`. |
| `src/systems/arrivalPlan.js` (extended) | `+ nextMissionId({ from, plan, stars }) → mapId \| null` | §9.2. `planArrival`/`arrivalFrame` unchanged. |
| `src/systems/resultsLayout.js` (new) | `resultsProblems(m) → string[]`; `bannerLowerEdge(box, skewDeg) → (x) => y` | §8.4. Harness verdicts, unit-tested on synthetic rects. |
| `src/utils/display.js` (extended) | `+ formatDuration(ms) → 'm:ss' \| 'h:mm:ss'`; `+ formatCount(n) → '3,480'` | Next to `starsDisplay`. `formatDuration`: floors to whole seconds; NaN, negative or non-finite → `'0:00'`. `formatCount`: `Math.round(n).toLocaleString('en-US')` (the existing InspectController/UIScene convention); a non-finite n → `'0'`. |

**Data access rule:** pure modules take data as default parameters (`rule = STAR_RULE`, `lines = RESULT_LINES`, `maps = MAPS`) so tests can inject edge cases, and the defaults keep call sites short.

### 5.2 The results model (what the DOM renders)
```js
{
  result: 'victory' | 'defeat',
  final: boolean,                      // mapId === maps.length - 1
  kicker: 'MISSION 3 · THE CRATER' | 'CAMPAIGN COMPLETE',   // CAMPAIGN COMPLETE on a final-map victory only
  bannerText: 'SECTOR HELD!' | 'THE LINE FELL',
  stars: 0..3,                         // 0 on defeat (no star row)
  starsLabel: '2 of 3 stars' | '',
  chips: [ { id, value, label, newBest } ],   // victory: lives, kills, gold, time; defeat: wave, kills, gold, time
  speaker: 'command' | 'veth',
  line: string,
  actions: [ { id: 'next'|'retry'|'map', label, name, primary } ],  // primary first
  announcement: string,                // §7.5
}
```
- **Chip values:**
  - `lives`: `${lives}/${startLives}` (run start, Garrison included; decision 6)
  - `wave`: `${wave}/${waveCount}`
  - `kills` and `gold`: `formatCount`
  - `time`: `formatDuration`
- **`newBest`:** victory only.
  - The `lives` chip's flag comes from `newBest.livesLost`: the stamp means fewest lives lost, while the chip value stays the honest `n/start`.
  - The `time` chip's flag comes from `newBest.time`.
- **Announcement wording:** "New best: fewest lives lost" and "New best time".
- **Actions:**
  - victory, not final: `next` (primary), `retry`, `map`
  - victory, final: `map` (primary), `retry`
  - defeat: `retry` (primary), `map`
- **No field named `title`.** `noNativeTitles.test.js` greps non-test source for `.title =`, which would flag an assignment such as `model.title = …`.

### 5.3 GameScene changes (`src/scenes/GameScene.js`)
- **`init(data)`:** `this._carriedEntryStars = Number.isInteger(data?.entryStars) ? data.entryStars : null`.
- **`create()`** adds:
  - `this._entryStars = this._carriedEntryStars ?? this.saveMgr.getStars(this.mapId)`
  - `this._runMs = 0`
  - `this._startLives = map.startLives + mods.startLivesBonus` (the value already passed to `EconomyManager`)
  - `this._results = new ResultsScreen({ motion: () => this.game.registry.get('ambientMotion') !== false })` (the 3.5 motion source)
  - `this._results.close()`, so a level never opens with a stale screen
- **`update()`:** right after `const dtMs = delta * this.speed;` (after the hit-stop early return and the `over || won` return), add `if (this.waveMgr.currentWave > 0) this._runMs += dtMs;`.
  - `currentWave` increments in `WaveManager.startWave`, so this starts the clock at Send Wave 1 with no new state.
  - Paused scenes don't call `update()`. Hit-stop returns earlier. Game over returns earlier.
- **`_onVictory()`:**
  - first line becomes `if (this.won || this.over) return;` (§5.4)
  - the inline star expression becomes `starsFor(this.economy.lives, map.startLives)`
  - after `setStars`, call `this._newBest = this.saveMgr.recordRun(this.mapId, { livesLost: livesLostFor(this._startLives, this.economy.lives), timeMs: this._runMs }).newBest`. It is written **before** the story dialog, like `setStars`, so it survives a tab closed mid-epilogue.
  - the dialog's `onComplete` and the no-dialog branch both call `this._showResults('victory')`
- **`_onDefeat()`:**
  - keeps its sfx, `over`, `_closeRadial`, `_syncCancelButton` and `_commitStats(false)`
  - its `#game-msg` writes are replaced by `this._showResults('defeat')`
  - no record is written
- **`_showResults(result)`** (new; replaces `_showVictoryOverlay`, which is deleted):
  1. adds `.disabled` to `#exit-btn` and `#pause-btn` (as today)
  2. hides `this._hideTowerTooltip()`, `this.inspector?.dismiss()`, `this.inspector?.hidePeek()` and `this._wavePreview?.hide()` (Claude's call 25)
  3. builds `resultsModel(...)` from `this.economy.lives`, `this._startLives`, `this._runStars`, `this.kills`, `this.economy.earned`, `this._runMs`, `this.waveMgr.currentWave`, `this.waveMgr.waves.length` and `this._newBest`
  4. calls `this._results.open(model, (id) => this._onResultsAction(id))`
- **`_onResultsAction(id)`:** `'next'` → `this._returnToMap({ next: true })`; `'map'` → `this._returnToMap()`; `'retry'` → `this._retry()`.
- **`_returnToMap(opts = {})`:** keeps the `_leftToMap` guard. The payload comes from `exitPayload({ mapId, result, entryStars: this._entryStars, savedStars: this.saveMgr.getStars(this.mapId), runStars: this._runStars, next: !!opts.next })`. `#msg-btn` (Abandon) keeps calling it with no options.
- **`_retry()`** (new): `if (this._leftToMap) return; this._leftToMap = true; this.scene.restart({ mapId: this.mapId, heroId: this.heroId, entryStars: this._entryStars });`.
  - `ScenePlugin.restart` queues `stop` + `start`, the same `shutdown` event as leaving to the map.
  - `shutdown()` already unwires `this.events` (`_unwireSceneEvents`), the `game.events` trio, the shell listeners and the DOM clones.
  - `UIScene` stays active (never stopped) and re-inits from `hero:hud-init`, exactly as on a second LAUNCH.
- **`shutdown()`:** add `this._results?.close()` next to `this._storyDialog?.close()`. Don't add results buttons to the clone list: `ResultsScreen` owns its listeners as add/remove pairs (one owner per element, memory "HUD DOM ownership").
- **Capture hook** (`applyDebugCapture`): `end: (result, overrides) => …` applies `overrides` (`{ lives, kills, goldEarned, timeMs, line }`) to the scene/economy/model before ending. Capture/dev builds only, like the existing hook, so the production build drops it.
- **`_commitStats`** is unchanged (Claude's call 9). It now runs exactly once per level (§5.4).

### 5.4 Same-frame defeat then victory (Claude's call 13; builder check confirmed)
- **Reproduction** (inside one `update()`):
  1. `_updateEnemies` moves the last enemy of the last wave onto the base.
  2. `economy.loseLife()` → lives 0 → `game:defeat` → `_onDefeat()` sets `over`.
  3. Later in the same frame, `_checkWaveComplete()` sees the wave active, nothing queued, no enemies (the corpse was swept) and `waveMgr.done`, and calls `_onVictory()`, which only checks `won`.
- **Today's result:** the victory overlay over the defeat, `setStars(mapId, 1)` at 0 lives, and both `_commitStats` calls.
- **Fix:** `_onVictory` returns early when `this.over`. Defeat wins the tie, because the base did fall.
- **Test first:** a scene stub at the final wave with 1 life. Run the leak path; expect `won === false`, `setStars` and `recordRun` not called, `_commitStats` called once with `false`, and the defeat results model. Mutation check: remove `|| this.over` and the test fails.

### 5.5 Economy (`src/systems/EconomyManager.js`, `src/systems/TowerPlacementManager.js`)
- `EconomyManager` gains `this.earned = 0`, incremented in `earn(amount)`, and `refund(amount)`: the same as `earn` (gold, `economy:update`) without counting.
- The starting gold, debug `FREE_GOLD` assignments (`debugCapture.js` writes `economy.gold` directly) and `spend` never touch `earned`.
- `TowerPlacementManager.sellTower` calls `this.economy.refund(refund)`. Its test's economy mock gains `refund`.
- Income sites (unchanged calls to `earn`): `_startWave` send-early bonus, `_checkWaveComplete` wave-clear bonus, `_updateHero` and `_dealDamage` kill rewards.

### 5.6 MapSelectScene changes (`src/scenes/MapSelectScene.js`)
- **In `create`:** call `_prepareArrival(data?.from)` **before** `_defaultSelection` (it doesn't depend on the selection), then `this._nextId = nextMissionId({ from: data?.from, plan: this._plan, stars: this._stars })`.
- **`_defaultSelection(from)`:** if `this._nextId !== null && !this._frame` (no arrival plays), return `this._nextId`. Otherwise, today's rule.
- **`_applyFrame`:** the card target becomes `this._nextId ?? this._plan.toId ?? this._plan.mapId`. For an `advance` plan these are equal. For a `stamp` plan (a replay that improved stars), the won node's stars stamp, and then the card opens on the next map.
- **Focus LAUNCH** (`#featured-play`, `focus({ preventScroll: true })`) when `this._nextId !== null`:
  - in `_finishArrival` (natural end, skip, reduced motion), after `_renderProgress`
  - in `create` after `_bindPlay()` when no arrival plays (`_bindPlay` clones the button, so the focus must come after it)
  - if `campaign_intro` plays first (fresh context), the dialog's focus restore returns to LAUNCH
- **`_skipArrival(e)`:** also return early when `e.defaultPrevented`. A held key's repeat, swallowed by the results' key tail (§7.4), must not skip the flight. That's the same rule the story dialog already follows.
- **`_renderFeatured(mapId)`** passes `this._records` (read once in `create`: `MAPS.map((_, i) => this._saveMgr.getRecord(i))`) to `briefingCardModel`.

### 5.7 Briefing card (decision 6, Claude's call 24)
- `briefingCardModel(mapId, stars, records = [])` adds `record: records[mapId] ?? null`.
- `renderBriefingCard` appends, inside `#featured-stars`, a `<span class="fs-best">` reading ` · Best: 0 lost · 9:42`.
  - Partial records show what exists (`Best: 2 lost`, or `Best: 9:42`).
  - No record, no span.
- There's no new row, so the card's height is unchanged. The world-map audit (`worldMapProblems`) must still pass with a record present (§12.2).

### 5.8 DOM module: `src/ui/ResultsScreen.js` (new, thin, no rules)
```js
new ResultsScreen({ motion = () => true, now = () => performance.now(),
                    raf = cb => requestAnimationFrame(cb), caf = id => cancelAnimationFrame(id),
                    root = document.getElementById('results') })
open(model, onAction)   // onAction(id) runs at most once per open
close()                 // idempotent, silent: never calls onAction
```
- **Owns:** one delegated `click` listener on `#results`, one `keydown` listener on `document` (capture), and one rAF loop that runs only while `revealing` (§7.2).
- **`open`:**
  1. remembers nothing for focus (the level is over, so there's nothing to return to)
  2. renders the model: texts, chip order, `hidden` on unused actions, primary first in DOM order, data attributes (§8.1), speaker colour vars via `speakerLook(model.speaker)`, the portrait or its initial-letter fallback with the `img` `error` → fallback rule from 3.5
  3. publishes `--rs-*-ms` vars from `RESULTS` (the 3.5 `publishTimings` pattern) and per-element `--rs-at` delays from `resultsTimeline`
  4. toggles `.motion-off` from `motion()`
  5. shows the root, focuses it (`tabindex="-1"`), and starts the flow
  6. announces `model.announcement` in `#results-live` **one frame later** (3.5: a live region that enters already filled is often not read)
- **At `ready`:** adds `.rs-done` and `data-phase="ready"`, and focuses the primary button.
- **On an action:**
  1. `close()`
  2. `armGestureTail({ now, windowMs: RESULTS.actGuardMs, key: e.type === 'keydown' })` (§7.4)
  3. `onAction(id)`
- **`close()`:** removes both listeners, cancels the rAF and any pending live-region frame, clears `.rs-done`/`.motion-off`/data attributes, empties the live region, and hides the root.
- **Reuse:** `speakerLook` and `portraitPath` (3.5), `isBrowserShortcut` (`src/ui/browserShortcut.js`), `formatDuration`/`formatCount`.

### 5.9 DOM module: `src/ui/gestureTail.js` (new)
- `armGestureTail({ now, windowMs, key })` and `disarmGestureTail()` (for tests and teardown). Module-level state, so it **outlives the scene that armed it**.
- **Tap tail:** `pointerdown`, `pointerup`, `touchstart`, `touchend` and `click` on `document`, with `{ capture: true, passive: false }`. Phaser reads touch events, so touchstart/touchend must be swallowed too, and a passive listener can't `preventDefault`. Events within `windowMs` of arming are swallowed (`preventDefault` + `stopPropagation`). The first event at or after the window passes and removes the tail.
- **Key tail** (when `key`): swallows the next `keyup` once, and every `keydown` with `e.repeat` until a non-repeat `keydown`, which passes and removes it. This is the same rule as `StoryDialogOverlay._finishFromKey`/`_endKeyupSwallow`.
- [Builder] may later migrate `StoryDialogOverlay`'s private swallows onto this helper. It's not required, and 3.5's behaviour must not change.

## 6. Visual spec and animation timeline

### 6.1 Timeline [User: the choreography; Claude: the numbers, from the mockup]
All times are ms from `open()`, computed by `resultsTimeline` from `RESULTS`.

| Beat | Victory | Defeat | What |
|---|---|---|---|
| Dim + halftone | 0 → 200 | 0 → 200 | The root fades in (`rs-fade`, opacity). The halftone wash is static under the stage. |
| Banner slam | 0 → 400 | 0 → 400 | The banner's `translate` goes from −110 % to 0, `cubic-bezier(.2,1.5,.4,1)`. The skew stays on `transform`. |
| Banner shake | none | 400 → 800 | The banner text's `translate` goes ±0.08em (the mockup's `shake`). |
| Kicker tab | with banner | with banner | Rides the banner (child of it). |
| Stars ×3 | 500, 750, 1000 (each 350) → 1350 | none | `scale` 3 → 1 and opacity 0 → 1, `cubic-bezier(.2,1.8,.4,1)`. All three slots stamp; unearned ones land hollow. |
| Chips ×4 | 1350, 1450, 1550, 1650 (each 300) → 1950 | 500, 600, 700, 800 → 1100 | `scale` .5 → 1, opacity 0 → 1, `rotate` −8° → resting ±2°. |
| NEW BEST stamp | chip end + 50 (lives 1700, time 2000; each 250) | none | `scale` 2 → 1 and opacity, on a −8°-rotated ink tag at the chip's top-right corner. |
| Caption | 1900 (350) → 2250 | 1050 → 1400 | Opacity fade (the mockup's `fade`, opacity only). |
| Actions | 2300 (300) → **2600 = endMs** | 1450 → **1750 = endMs** | Opacity only. They never move, so a real tap lands where the button is drawn. |
| Veth glitch | none | loops from the caption beat | 3.5's `sd-glitch` on the portrait inner and caption inner, `--rs-glitch-period-ms` = `STORY_DIALOG.glitchPeriodMs`. It's below 3 flashes/s (WCAG 2.3.1), as in 3.5. |

The victory numbers reproduce the mockup's delays exactly (banner .4s, stars .5/.75/1s, chips 1.35–1.65s, caption 1.9s, buttons 2.3s). A test pins `endMs` for victory at 2600 and defeat at 1750 from the data.

**Implementation constraints** (the 3.5 lessons):
- **Animate the individual `translate`, `scale`, `rotate` and `opacity` properties, never `transform`.** The banner's skew and the chips' tilt live on `transform`/`rotate` resting values, and animating `transform` would wipe the skew mid-slam.
- **Resting styles are the end state.** Keyframes describe only the *from* side, with `animation-fill-mode: both`, so the delay holds the from-state.
  - Skipping is `#results.rs-done .rs-reveal { animation: none !important }`, which shows the end state at once.
  - So no reveal element may rest at `opacity: 0` or `visibility: hidden`; a guard enforces this (§12.1-17).
- Every revealed element carries `.rs-reveal` and gets its delay from an inline `--rs-at`. Loops (the Veth glitch) are **not** `.rs-reveal`; they sit on nested inner elements (outer = fade, inner = glitch), so `.rs-done` doesn't stop them and reduced motion does.
- The banner and button labels are set at `open()` and never relabelled mid-reveal.

### 6.2 Composition
**Tall** (the mockup, inside the map rect):
- the banner across the full width near the top (a full-bleed band at −4 %/+4 %, clipped by the stage)
- the kicker tab on its top-left
- three stars centred below it
- four chips centred below the stars
- the caption box with its portrait bottom-left
- the vertical button stack bottom-right

**Compact:** §8.2.

| Element | Look (tokens only; "ink" = `var(--ui-bevel-lo)`, as in 3.5) |
|---|---|
| Overlay | `rgba(0,0,0,.66)` over all of `#game`. `cursor:pointer; user-select:none; -webkit-touch-callout:none; touch-action:manipulation` (the 3.5 overlay rules). |
| Halftone | `radial-gradient(circle, var(--rs-hue) 22%, transparent 24%)`, dot pitch `calc(18 * var(--ui-u))` (compact 12), `opacity:.16`, `mix-blend-mode:screen`. `--rs-hue` is `var(--ui-currency)` on victory and `var(--ui-danger)` on defeat. |
| Banner | Background `var(--rs-hue)`, `transform: skewY(calc(-1 * var(--rs-skew)))` (5° tall, 3° compact), hard shadow `0 calc(10 * var(--ui-u)) 0` ink. |
| Banner text | Orbitron 700, `font-style: italic` (Orbitron ships no italic face; the browser's synthetic oblique is accepted, as in the mockup). Colour ink, `-webkit-text-stroke: calc(1 * var(--ui-u))` ink, counter-skewed, `white-space: nowrap`. Size `clamp(24px, min(7cqw, 14cqh), 88px)`. |
| Kicker | An ink tab with `var(--rs-hue)` text and a 3u border in `--rs-hue`. Orbitron 700 at ≥ 16 px on tall, Rajdhani 700 uppercase `--ui-fs-sm` on compact (the art bible's "Orbitron ≥ 16 px only"). |
| Stars | Wrapper `.rs-star` carries the `filter: drop-shadow(calc(4 * var(--ui-u)) calc(4 * var(--ui-u)) 0 ink)` (plus `drop-shadow(0 0 calc(6 * var(--ui-u)) var(--ui-currency))` when earned). The inner `::before` carries the star `clip-path` polygon and the fill: `var(--ui-currency)` earned, `var(--ui-panel-edge)` unearned. It's layered because a `clip-path` on the same element would clip the shadow (3.5 jagged-caption lesson). Size `clamp(32px, 12cqh, 96px)`. |
| Chips | Background `--ui-panel`, a 4u ink border, a 1u `--ui-panel-edge` outline, resting `rotate: ∓var(--rs-tilt)` alternating. Value: Orbitron 700 ≥ 16 px in `--rs-hue`. Label: Rajdhani 700 `--ui-fs-xs`–`sm`, `--ui-text-muted`, letter-spaced. |
| NEW BEST | An ink tab, `--ui-currency` text, a 2u `--ui-currency` border, Rajdhani 700 uppercase `--ui-fs-xs`, rotated −8°, pinned to the chip's top-right corner, inside the chip's box plus its overhang. |
| Portrait | Square, a 4u ink border, a 2u outline in `var(--rs-frame)` (speaker colour), a hard 6u ink shadow, no skew. The image is `object-fit: cover`. The fallback is the initial on a `--rs-frame` block, as in 3.5. |
| Caption box | Name tab (ink, name in `--rs-frame`, uppercase), then the line on `var(--rs-caption)` with ink text, a 4u ink border and a 7u hard shadow. **Veth:** `data-shape="jagged"` uses the same three-layer jagged build as 3.5 (`clip-path` polygon on ink and fill layers, `filter: drop-shadow` on the unclipped parent). Rajdhani 700, `--ui-fs-md`–`lg`, line-height 1.25, two lines max. |
| Buttons `.rs-btn` | A 3u ink border and a hard `calc(4 * var(--ui-u))` offset ink shadow; pressed (`:active`) translates by the shadow and drops it. Primary: `--rs-hue` fill, ink text. Secondary: `--ui-panel` fill, `--ui-text` text, a 1u `--ui-panel-edge` outline. `:focus-visible`: a 3u `--ui-accent` outline with offset. Label: Orbitron 700 at 16 px on tall, Rajdhani 700 uppercase `--ui-fs-md` on compact. Equal widths within the stack. |

**Contrast floor** (each tested with `contrastRatio`, colours derived from `PALETTE`/`deriveShades`, never literals; ≥ 4.5:1):
- ink on `currency` ≈ 14:1
- ink on `danger` ≈ 7.4:1
- `currency`/`danger` chip values on `panel` ≈ 13:1 / 6.8:1
- `text-muted` on `panel`
- `text` on `panel`
- `currency` on ink (NEW BEST)
- speaker name and caption pairs (already covered by `story.test.js`)

## 7. Input and accessibility

### 7.1 Inputs [User: skip then act; Claude: the mapping]
| Input | Revealing | Ready |
|---|---|---|
| Tap or click anywhere on `#results` (including an invisible button) | Finishes the reveal (→ ready, `readyAt = now`) | On a visible button: acts, after the guard. Elsewhere: nothing. |
| Enter / Space | Finish | Activates the focused button. Focus on the root or nowhere means primary. After the guard. |
| Escape | Finish | **WORLD MAP**, after the guard |
| Tab / Shift+Tab | `preventDefault`, no action | Cycles the visible buttons only (focus trap, `aria-modal`) |
| `e.repeat` keydown | Swallowed, no action | Swallowed, no action |
| An event already `defaultPrevented` (e.g. the story dialog's keyup tail, an entry guard) | Ignored | Ignored |
| Ctrl/Cmd/Alt combos (`isBrowserShortcut`) | Untouched | Untouched |
| Any other key | `stopPropagation` only, so no game shortcut (UIScene Space/Q/W/E/Escape, InspectController) fires | Same |

- **Plumbing:**
  - one delegated `click` (the **last** event of a tap, so nothing of the gesture remains to land below; 3.4/3.5 rule)
  - one document-capture `keydown`, which runs before UIScene's document-bubble listener; `preventDefault` on keys it handles, so a focused button's native activation can't fire twice
- **Space** acts on `keydown` with `preventDefault`. The native button keyup activation never happens, and the key tail swallows the keyup (§7.4).

### 7.2 Flow (pure, `resultsFlow.js`)
```
open ──(motion on)──► revealing ──now ≥ openedAt+endMs──► ready(readyAt = openedAt+endMs)
  │                       └──press──► ready(readyAt = now)            (no action)
  └──(motion off)──► ready(readyAt = openedAt)
ready ──press, now − readyAt < actGuardMs──► ready (ignored)
ready ──press, now − readyAt ≥ actGuardMs──► act
```
- The guard is a timestamp compare. There's no `setTimeout`/`setInterval` anywhere.
- `readyAt` on a natural end is `openedAt + endMs` (the scheduled end), not the tick time, so the guard is measured from when the buttons actually finished appearing (the 3.5 `completeAt = typeEnd` rule).
- The guard covers four cases:
  1. **The killing blow:** with no epilogue, results open in the frame the last enemy dies, under a player who is still tapping. The first tap only finishes.
  2. **The epilogue's closing tap:** the dialog's own 250-ms tap swallow plus the results' first-tap-finishes rule.
  3. **Double tap:** finish then act within 250 ms; the second tap is dropped.
  4. **Reduced motion:** ready on open, but `readyAt = openedAt`, so a tap in flight is dropped.

### 7.3 Focus
- On `open`, the root `#results` (`tabindex="-1"`) gets focus. The story dialog's focus restore runs inside its own `close()`, before the results open.
- At `ready`, focus moves to the primary button. Programmatic focus after a pointer gesture shows no ring (`:focus-visible`).
- Hidden actions carry `hidden`, so they're neither focusable nor counted in the trap.

### 7.4 Leaving the screen: gesture tails
On any action, `ResultsScreen` arms `armGestureTail` before calling `onAction` (§5.9).
- **RETRY by tap:** a double tap's second tap lands on the new level's canvas within 250 ms. It is swallowed (touchstart/touchend included), so it can't open a pad's build radial.
- **RETRY by Space held:** repeats are swallowed until the key is released and pressed again, so `UIScene` never toggles pause.
- **NEXT MISSION / WORLD MAP by Enter held:** `MapSelectScene`'s 250-ms entry guard covers the first window. After that, the key tail swallows repeats.
  - `_skipArrival` ignores them (`defaultPrevented`, §5.6), so the flight isn't skipped.
  - The focused LAUNCH isn't clicked by a repeat.

### 7.5 Accessibility
- `#results`: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="results-banner-text"`.
- `#results-live` (`.sr-only`, `aria-live="polite"`, `aria-atomic="true"`) receives `model.announcement` once, a frame after `open`. Example: *"Sector held! 2 of 3 stars. Lives 17 of 22, kills 214, gold 3,480, time 9:42. New best time. Sol Command: The line bent, but it held. Good work, Commander."*
- The stars row is `role="img"` with `aria-label` = `starsLabel`. Chip and caption text stays in the accessibility tree; it's static text, not typed.
- Buttons get `aria-label` from `actionNames`, so "▸" and "↻" aren't read out. The portrait `img` has `alt=""`.
- Every control is ≥ 44×44 on coarse pointers and on compact for any pointer, ≥ 40 px on tall fine pointers (the 3.5 rule).

## 8. Layout

### 8.1 DOM (`index.html`, a sibling after `#story-log-overlay`, before `#game-msg`)
```html
<div id="results" class="rs-overlay" role="dialog" aria-modal="true" aria-labelledby="results-banner-text" tabindex="-1" hidden>
  <div class="rs-stage">                                   <!-- the map rect; container-type: size; overflow: hidden -->
    <div class="rs-halftone" aria-hidden="true"></div>
    <div class="rs-banner rs-reveal">
      <div id="results-kicker" class="rs-kicker"></div>
      <h2 id="results-banner-text" class="rs-banner-text"></h2>
    </div>
    <div id="results-stars" class="rs-stars" role="img">
      <span class="rs-star rs-reveal"></span><span class="rs-star rs-reveal"></span><span class="rs-star rs-reveal"></span>
    </div>
    <ul id="results-chips" class="rs-chips">              <!-- 4 × li.rs-chip.rs-reveal > b.rs-chip-val + span.rs-chip-lbl + span.rs-new-best.rs-reveal[hidden] -->
    </ul>
    <div id="results-caption" class="rs-caption rs-reveal">
      <div class="rs-portrait-outer"><div id="results-portrait" class="rs-portrait" aria-hidden="true"></div></div>
      <div class="rs-caption-col">
        <div id="results-speaker" class="rs-caption-name"></div>
        <div class="rs-caption-box"><p id="results-line" class="rs-caption-text"></p></div>
      </div>
    </div>
    <div id="results-actions" class="rs-actions rs-reveal">
      <button id="results-next"  class="rs-btn" type="button"></button>
      <button id="results-retry" class="rs-btn" type="button"></button>
      <button id="results-map"   class="rs-btn" type="button"></button>
    </div>
  </div>
  <div id="results-live" class="sr-only" aria-live="polite" aria-atomic="true"></div>
</div>
```
- **Root data attributes:**
  - `data-result="victory|defeat"`
  - `data-final="0|1"`
  - `data-phase="revealing|ready"`
  - `data-stars="0..3"`
  - `data-speaker`, `data-shape`, `data-glitch` (from `speakerLook`)
- **Root CSS vars:** `--rs-frame`, `--rs-caption` (speaker), `--rs-*-ms` (timings).
- **Earned state:** `data-earned="1"` per `.rs-star`. The primary button gets `.rs-btn--primary`.
- The ids are fixed so the harness and tests can address them. No `title=` attributes.
- `#results[hidden] { display: none }` is explicit, because the author `display` rule would otherwise beat the UA `[hidden]`.

### 8.2 Grid (map rect; two `@container` tiers on `.rs-stage`, not a viewport query)
```css
.rs-stage { position:absolute; left:var(--map-left,0px); top:var(--map-top,0px);
  width:var(--map-width,100%); height:var(--map-height,100%); container-type:size; overflow:hidden;
  display:grid; grid-template-columns:1fr auto; grid-template-rows:auto auto auto 1fr;
  grid-template-areas: "banner banner" "stars stars" "chips chips" "caption actions"; }
/* Short stage: actions get their own right-hand column; banner drops to the 3° skew. */
@container (max-height: 680px) {
  .rs-banner  { --rs-skew: var(--rs-compact-skew-deg, 3deg); /* … */ }
  .rs-stars   { grid-column:1; grid-row:2; }
  .rs-chips   { grid-column:1; grid-row:3; }
  .rs-caption { grid-column:1; grid-row:4; }
  .rs-actions { grid-column:2; grid-row:2 / 5; }
}
/* Compact stage: phone sizes (40-px stars, 16-px chip values, 64-px portrait, 44-px buttons,
   body font instead of Orbitron). Layout is inherited from the tier above. */
@container (max-height: 500px) { /* sizes only */ }
```
- **Why the map rect decides:** the stage is the map rect, not the viewport. A 1280×720 window gives a ~620-px map, which a viewport query called tall, yet the tall stack (banner, stars, chips, then the caption beside three stacked buttons) needs ~690 px, so the 3-button stack clipped on 720p and iPad (fixed in `bd04dc0`). A ~697-px desktop map stays tall.
- **Defeat:** `.rs-stars` is `display:none`, and the row collapses.
- **Compact budget** (smallest map, iPhone 14 at 750×340 → map ≈ 588×331; 844×390 → 662×372; 932×430 → 731×411):

  | Row | px (588×331) |
  |---|---|
  | Top padding | 8 |
  | Banner band: 56 tall + skew bleed at the stars' x-span (3°) | ~ 86 |
  | Gap | 6 |
  | Stars (40 each) | 40 |
  | Gap | 8 |
  | Chips (value 16 + label 11 + padding) | 46 |
  | Gap | 6 |
  | Caption (64-px portrait; 2 lines at 15 px) | 72 |
  | Bottom padding | 8 |
  | **Left column total** | **≈ 280 ≤ 331** |
  | Actions column: 3 × 44 + 2 × 6 gaps, bottom-aligned, ~150 wide | 144 |

  The left column is ≈ 588 − 150 − 24 = 414 px wide, which holds four ~92-px chips plus 3 × 6 gaps.
- **Tall** (1440×900 → map ≈ 1239×697): the mockup's proportions.
- **Skew bleed:**
  - The banner's lower edge drops by `tan(skew) × (cx − x)` toward the left end (`skewY(−θ)`).
  - The grid gap below the banner must hold that drop at the stars'/chips' left x.
  - The audit checks it with the parallelogram edge, not the bounding box (§8.4).
- **Fonts off:** the fallback stacks (Bahnschrift/Segoe/system-ui heading, condensed body) are narrower than Orbitron/Rajdhani, so lines only get shorter. Still audited.
- **Phones in portrait:** `#rotate-prompt` (z 1000) covers everything, as on every screen.
- **Resize or rotation mid-reveal:** CSS only (`--map-*` re-published by `fitHudLayer`, `cq*` units). The flow is timestamp-driven and continues.
- [Builder] may tune paddings and sizes, within the audit.

### 8.3 Z-order
`#results` is z **26**:
- above: `#story-banner` 25, `.ability-card`/`#hint-peek` 21, `#game-msg` 20, `#story-dialog` 18 (never shown together), the rails (`#hud-layer` 6) and the frame (7)
- below: the toast (30, `pointer-events:none`), and `#inspect-peek` 45 / `#tower-tooltip` 50, which `_showResults` hides (Claude's call 25)

### 8.4 Pure layout audit: `resultsProblems` (`src/systems/resultsLayout.js`)
**Input** (measured in a real browser **after `.rs-done`**):
```js
{ mapRect, bannerBox /* untransformed offset box */, skewDeg, bannerText, bannerTextScroll,
  stars /* null on defeat */, chips: [], newBest: [], caption, captionScroll, actions,
  buttons: [{ name, rect, visible }], fonts: [{ name, px }], minTouchPx }
```
**Problems reported** (each unit-tested on synthetic rects, with a passing fixture and one failing fixture per rule):
- any of banner text, stars, each chip, each NEW BEST tag, caption, actions or each visible button outside `mapRect` (1-px tolerance)
- banner text overflow (`scrollWidth > clientWidth + 1`)
- caption overflow (`scrollHeight > clientHeight + 1`)
- an overlap between stars/chips, chips/caption, chips/actions, caption/actions, stars/actions, or two chips
- **banner collision:** a rect whose top is above `bannerLowerEdge(bannerBox, skewDeg)` at either of its x-edges (the parallelogram, so the skew bleed counts and the empty bounding-box corners don't)
- a visible button under `minTouchPx` (via the existing `targetSizeProblems`)
- any computed font size under 11 px

## 9. World-map hand-off

### 9.1 `exitPayload` (`missionExit.js`)
```
improved  = savedStars > entryStars
result'   = improved ? 'victory' : result                     // the chain won, so the flight is owed
prevStars = entryStars
stars     = improved ? savedStars : (result === 'victory' ? runStars : savedStars)
from      = { mapId, result: result', prevStars, stars, ...(next ? { next: true } : {}) }
```
- **Without a retry chain,** `entryStars` equals the stars at level entry, which is exactly today's `_prevStars` on a victory and `saved` otherwise. All five return-payload cases in `GameScene.returnToMap.test.js` therefore produce identical objects; that's the regression oracle.
- **Changes to that test file:**
  - **Kept exactly:** the five oracle assertions (fresh victory, `prevStars` read before `setStars`, worse replay, defeat, abandon) and the double-click case.
  - **Updated fixture:** `makeScene` gains `scene._entryStars` (= `saved`, the stars at level entry) and `saveMgr.recordRun` (returning `{ newBest: { livesLost: false, time: false } }`). It also needs whatever `_onVictory`/`_onDefeat` now reach through `_showResults`. [Builder] can stub `scene._showResults` in the fixture, or give it a `_results` stub plus the fields of §5.3.
  - **Rewritten case:** "label reads World Map on victory and defeat" calls the deleted `_showVictoryOverlay`. It becomes: after `_onVictory()` and after `_onDefeat()`, the results model's `map` action is labelled `WORLD MAP` (or `#results-map` reads it when the real `ResultsScreen` is used).
- **With a chain** (first clear 1★, RETRY, defeat, WORLD MAP), `from = { result: 'victory', prevStars: 0, stars: 1 }`. `planArrival` yields an `advance` and the ship flies.

### 9.2 `nextMissionId({ from, plan, stars })` (`arrivalPlan.js`)
| Case | Returns |
|---|---|
| `from?.next !== true` | `null` (WORLD MAP and Abandon keep today's behaviour) |
| `plan.kind === 'advance'` | `plan.toId` (the flight's destination; on a gap save that's the post-win frontier) |
| `plan.kind === 'complete'` | `null` (the final map; NEXT MISSION is never offered there anyway) |
| otherwise (`stamp`, `none`) | `from.mapId + 1` if it's ≤ last and open (`stars[from.mapId] > 0`), else `null` |

### 9.3 The resulting journeys
| Journey | World map |
|---|---|
| First clear, NEXT MISSION | campaign_intro (only if unseen) → flight → card on the next map → **LAUNCH focused** |
| First clear, WORLD MAP | Flight → card on the next map (as today), nothing focused |
| Replay, same or fewer stars, NEXT MISSION | No arrival. Card on `mapId + 1`, LAUNCH focused. |
| Replay, more stars, NEXT MISSION | Stamp arrival on the won node, then the card on `mapId + 1`, LAUNCH focused |
| Replay, WORLD MAP | The played map's card (as today) |
| Defeat, WORLD MAP / Abandon | The played map's card (as today), unless a retry chain earned the flight (§9.1) |
| RETRY | No world map; the same level restarts |

## 10. Reduced motion
- The source is the registry flag `ambientMotion` (the saved setting wins, else `prefers-reduced-motion`), read live through the injected `motion()` at `open()`, and applied as `.motion-off` (a class, not a media query: the 3.4/3.5 rule).
- **Under `.motion-off`:**
  - `#results.motion-off *, ::before, ::after { animation: none !important }`
  - the root keeps its single `rs-fade` (opacity, `fadeMs` 200), so the screen fades in rather than popping
  - no slam, stamp, pop, shake or glitch
  - the flow starts `ready` (`readyAt = openedAt`), so the 250-ms guard still holds
- After `fadeMs`, `#results.getAnimations({ subtree: true })` is empty (the harness checks this, §12.2).

## 11. CSS guards (how the new CSS satisfies each)
| Guard | How it stays green |
|---|---|
| `themeCss` | Every `font-family` is `var(--ui-font-heading)` or `var(--ui-font-body)`. Every `var(--ui-*)` used is one `themeCssVars()` publishes; the ink is `--ui-bevel-lo` and no new token name is invented. No `.ui-` selector, so the kit px/hex/paint rules don't apply. |
| `kitRollout` | `.rs-btn` is not a kit class and no results element wears `ui-btn`/`ui-panel`, so `kitOnly()` never matches a results rule. No `className = '…ui-btn…'` string is added in JS. `#game-msg`/`#msg-btn` stay in markup for Exit. |
| `noNativeTitles` | No `title=` in markup. No `.title =` / `setAttribute('title')` in JS (the model field is `bannerText`). |
| `railCss` | `#results` is outside `#hud-layer`, so `matchesRail` never selects its rules and px is allowed. |
| `typeFloor` | Every `font-size` is a token (≥ 11) or a `clamp()` whose px/token arms are all ≥ 11. `cqw`/`cqh` arms aren't px, and the floor arm guarantees the minimum. |
| `storyDialogCss` | No results selector names `#story-dialog`, `.story-dialog` or `.sd-`, so its rule set is unchanged. Reusing `sd-glitch` by name from a `#results` rule is outside its filter, and `sd-glitch` animates `translate`/`filter`, never `transform`. |
| **New `src/ui/resultsCss.test.js`** (mirrors `storyDialogCss`) | Rules naming `#results` or `.rs-` must: exist (more than 15; vacuous-filter guard); hold no hex, no named colour, and no colour function except `rgba(0,0,0,a)`; use `calc(N * var(--ui-u))` (or a `--rs-*` var built on it) for every `border`/`outline`/`box-shadow`/`filter`/`text-shadow`/`-webkit-text-stroke` length. Every `rs-` keyframes named is defined, and no keyframes a results rule plays animates `transform`. `#results.motion-off *` sets `animation: none !important`. `#results.rs-done .rs-reveal` sets `animation: none !important`. No rule resting a `.rs-reveal` element sets `opacity: 0` or `visibility: hidden`. `.rs-actions`/`.rs-btn` animate opacity only (keyframes with no `translate`/`scale`/`rotate`). The coarse-pointer and compact blocks size `.rs-btn` to `min-height: 44px; min-width: 44px`. The overlay has `cursor:pointer`, `user-select:none`, `-webkit-touch-callout:none`, `touch-action:manipulation`. |

## 12. Testing strategy
Every new test is **mutation-checked**: break the code on purpose and watch *that* test fail (memory "prove the test fails"). A failing test is written first for the same-frame bug (§5.4). The stale-save bug's failing test belongs to the prerequisite hotfix (§4.4).

### 12.1 Unit (Vitest)
1. **`starRating`:**
   - **Oracle equivalence:** for every map in `MAPS` (startLives derived, never typed), for every `lives` in `0 … 2 × startLives`, `starsFor(lives, startLives)` equals the old inline expression `p >= 0.8 ? 3 : p >= 0.5 ? 2 : 1`.
   - Named boundaries: 16/20 → 3, 15/20 → 2, 10/20 → 2, 9/20 → 1, and 12/15 → 3.
   - Data validation: `STAR_RULE` thresholds are best-first, `minRatio` in (0, 1], `stars` 1–3, `floor` 1.
   - Non-finite inputs → `floor`.
   - Mutation: `>=` → `>`, or swapping the thresholds, must fail.
2. **`runRecord`:**
   - `livesLostFor`: 20/20 → 0, 22/17 → 5, left > start → 0, NaN → null.
   - `mergeRecord`:
     - null prev → record set, no NEW BEST
     - fewer lives lost only, faster time only, both
     - ties → no NEW BEST
     - worse → record kept
   - Invalid run fields (NaN, negative, non-integer `livesLost`, 0 ms) are ignored.
   - `sanitizeRecord` on garbage (strings, arrays, `{}`, negative); an old-shaped `{ lives: 18 }` sanitizes to `null`.
   - **The Garrison fixture (decision 6):**
     - prev `{ livesLost: 0 }` (a 20/20 clear); run `livesLostFor(22, 22) = 0` (a 22/22 clear with `log_garrison`) → `newBest.livesLost === false`, record unchanged
     - and `livesLostFor(22, 21) = 1` → worse, record kept at 0
     - Mutation: store raw lives (higher-is-better) → this test fails.
3. **`SaveManager`** (built on the forward-ported freshness fix):
   - v4 fixture → v5 written back, records all null, every other field identical
   - v1/v2/v3 → v5
   - v5 round trip
   - wrong-length or garbage `records` sanitized
   - a future v6 keeps sanitized records
   - `recordRun` persists, returns its flags, and doesn't write when nothing improved
   - `getRecord` returns a copy
   - `getTotalStars` unchanged
   - **Records under the freshness path:**
     - instance B (constructed earlier) calls `recordRun` after instance A wrote stars → the stars survive
     - B calls `setSettings` after A's `recordRun` → the record survives
     - Mutation: make `recordRun` skip the refresh, or drop `records` from `_normalize` → fail
   - The hotfix's own two-instance test stays green.
4. **`EconomyManager`:** `earned` counts `earn` only; `refund` adds gold and emits but doesn't count; `spend` doesn't change it; start gold excluded. **`TowerPlacementManager`:** `sellTower` calls `refund`.
5. **`resultsTimeline`:**
   - the victory and defeat schedules equal the §6.1 table, derived from `RESULTS` (victory `endMs` 2600, defeat 1750)
   - beats are monotonic
   - NEW BEST slots land after their chip and before `actions.at`
   - no stars on defeat
6. **`resultsFlow`:**
   - natural end → ready with `readyAt = openedAt + endMs`
   - press while revealing → ready, no act
   - press within the guard → no act; at or after the guard → act
   - motion off → ready at open, and the guard still holds
   - the state is never mutated
7. **`resultsModel`:**
   - victory and defeat chip order, values and labels (`17/22` from the run start, Garrison included; `3,480`; `9:42`; defeat `1/10` on wave 1)
   - stars 0 and empty label on defeat
   - final kicker and actions (`map` primary, no `next`)
   - NEW BEST on the lives chip from `newBest.livesLost` and on the time chip from `newBest.time`, victory only
   - announcement contents
   - `pickResultLine` is deterministic: victory by `mapId % n` per star tier, defeat by `(mapId + wave) % n`, final pool used on the last map
8. **`RESULT_LINES` data:**
   - every tier (3/2/1) of `victory` and `final` is non-empty, and `defeat` is non-empty
   - every line ≤ `RESULTS.maxLineChars`, with no duplicates
   - `RESULT_SPEAKERS` ids exist in `STORY_SPEAKERS`
   - `longestResultLine` is derived, not hardcoded
9. **`formatDuration` / `formatCount`:** 0 → `0:00`, 59 999 → `0:59`, 60 000 → `1:00`, 3 599 999 → `59:59`, 3 600 000 → `1:00:00`; NaN, −1 and Infinity → `0:00`; 3480 → `3,480`.
10. **`missionExit`:**
    - the five return-payload cases from `GameScene.returnToMap.test.js` as an oracle (identical objects)
    - chain cases: first clear + retry + defeat, first clear 3★ + retry 1★, first clear + retry + abandon
    - `next: true` only when asked
11. **`nextMissionId`:** every row of §9.2, including a gap save and the last map.
12. **`ResultsScreen`** (jsdom, injected `now`/`raf`/`caf`/`motion`):
    - renders the model (texts, `data-*`, hidden actions, primary first, `--rs-frame`/`--rs-caption`, the Veth `data-shape="jagged"` and `data-glitch="1"`)
    - click while revealing → `data-phase="ready"` and no `onAction`
    - click on `#results-next` within the guard → nothing; after it → `onAction('next')` exactly once, root hidden
    - Enter/Space act on the focused button, Escape → `'map'`
    - Enter/Space/Escape are `defaultPrevented` and **not propagated** (a document-bubble spy standing in for UIScene sees nothing); Q is not propagated; Ctrl+R is propagated
    - `e.repeat` ignored; a `defaultPrevented` event ignored
    - Tab wraps over visible buttons only
    - focus is on the root at open and on the primary at ready
    - the live region is filled once, a frame after open
    - motion off → ready at once, no `.rs-reveal` animation class
    - portrait fallback, and `img` `error` → fallback
    - **listener pairing:** open → close ×3 leaves no document or root listeners (count add/remove pairs, the 2026-08-17 leak-test pattern)
    - `close()` twice is safe; `close()` mid-reveal cancels the rAF and never calls `onAction`
13. **`gestureTail`:**
    - pointer/touch/click events within the window are `defaultPrevented` and stopped
    - the first event after the window passes and removes every listener
    - the touch listeners are registered non-passive
    - key tail: keyup swallowed once, repeats swallowed until a fresh keydown, which passes
    - it survives the arming module being torn down
14. **GameScene:**
    - **(failing first)** a same-frame leak at 1 life on the final wave ends in defeat only (§5.4)
    - `_onVictory` calls `recordRun` with `livesLost = _startLives − economy.lives` and `_runMs` before the story dialog, and opens the results after the dialog's `onComplete`
    - a Garrison run (`_startLives` 22, lives 22) records `livesLost: 0`
    - defeat writes no record
    - `_runMs`: no accumulation before wave 1; `speed = 2` accumulates `delta × 2`; a hit-stop frame and an over/won frame add nothing
    - `_retry` → `scene.restart` with `{ mapId, heroId, entryStars }`; a second `_retry` or `_returnToMap` is ignored
    - `init` → `create` honours a carried `entryStars`
    - `shutdown` closes the results
    - Exit/Pause `.disabled` at game end; `#game-msg` stays hidden at game end
    - `_showConfirmExit` still works (existing `GameScene.exit.test.js` cases)
    - the existing `_showVictoryOverlay`/`_onDefeat` "modal reset" cases in `GameScene.exit.test.js` are **rewritten** against `#results`
    - `GameScene.returnToMap.test.js`: oracle assertions unchanged; fixture and the label case updated as in §9.1
    - **retry ×3:** extend `GameScene scene-event wiring survives a replay` (`GameScene.shutdown.test.js`) to the restart path; after three create/shutdown cycles, each scene event has exactly one listener, and one `enemy:spawn` emits one enemy. Mutation: drop `_unwireSceneEvents()` from `shutdown`.
15. **MapSelectScene** (`MapSelectScene.arrival.test.js` / `.worldMap.test.js`):
    - `from.next` on a replay → card on `mapId + 1` and `document.activeElement === #featured-play`
    - on a first clear → card on `toId` with LAUNCH focused after `_finishArrival` (skip and reduced motion too)
    - without `next`, today's behaviour, with the existing tests unchanged
    - `_skipArrival` ignores a `defaultPrevented` keydown
16. **Briefing card:** the record line renders `Best: 0 lost · 9:42` (full), `Best: 2 lost` (lives-lost only), `Best: 9:42` (time only), and nothing when there's no record; the model's `record` field.
17. **CSS:** the existing guards stay green and the new `resultsCss.test.js` (§11) passes. Contrast pairs (§6.2) are tested with `contrastRatio` over `deriveShades(PALETTE, MIX)`.

### 12.2 Screens (`npm run capture -- --screens --devices desktop1440,phone844,phone932,iphone,ipad`)
Today's victory/defeat shots and the post-win arrival live in `scripts/capture.mjs` (`captureScreens`, `winMapZero`, `returnToMap`, `capturePostWin`, `captureHeldSkip`, `captureReducedMotion`). `deviceFlow.js` `FLOW_STEPS` has no victory or defeat step.

**Changes:**
- **`winMapZero`** waits for `#results[data-result="victory"]` (not `#game-msg`), still skipping the epilogue on the way. It asserts `#game-msg` hidden and `#results-next` reading `NEXT MISSION ▸`.
- **`returnToMap(page, device, onStory, via = '#results-map')`:**
  1. tap the stage once
  2. assert `data-phase="ready"` within `FINISH_BOUND_MS` (250)
  3. wait `actGuardMs + 100`
  4. tap `via`
  
  `capturePostWin` passes `'#results-next'` and adds `document.activeElement.id === 'featured-play'` to `expectArrivalDone`. `captureHeldSkip` and `captureReducedMotion` use the default.
- **Shots:**
  - `05-defeat.png` at ready (after `__capture.end('defeat')`)
  - `05a-defeat-reveal.png` at ~900 ms (chips mid-pop)
  - `07-victory.png` at ready
  - `07a-victory-reveal.png` at ~1100 ms (stars stamping)
  - `07e-victory-final.png` (map 9, `CAMPAIGN COMPLETE`)
- **Layout:** `RESULTS_TARGETS = ['#results-next', '#results-retry', '#results-map']`, audited (hidden ones skipped) with `targetSizeProblems` at `MIN_TOUCH_PX` on touch or compact. A `resultsAudit(page, device, label)` feeds `resultsProblems`. Worst-case content is forced with `__capture.end(result, overrides)`:
  - the derived `longestResultLine`
  - kills 9 999, gold 99 999, time 9:59:59
  - a seeded worse record (`{ livesLost: 99, timeMs: 99_999_999 }`), so both NEW BEST tags show
  - 1★ and 2★ via `lives`
  - final map
  
  Audited on every device, and again in `captureNoFonts`.
- **New run `captureResultsGuard`:**
  - open victory results
  - with ≥ 2 × `FINISH_BOUND_MS` of reveal left (asserted, the `leftMs` pattern), double-tap the centre of `#results-next` with real input, asserting the two taps fell within `actGuardMs`
  - expect `data-phase="ready"` and `#results` still visible after 1 s
  - then one tap after the guard → `#map-select` visible
  - *Proof:* set `actGuardMs` to 0 → the second tap leaves the screen; remove the click-finish → phase stays `revealing` past 250 ms
- **New run `captureRetry`** (seed `seenStoryBeats.brief_outpost_sigma`):
  1. `__capture.end('defeat')` → ready → tap `#results-retry`
  2. expect `#results` hidden, `#story-dialog` **not** shown, `#wave-btn` = `▶ Send Wave 1`, `#stat-lives` = map start lives, `#stat-wave` = `0/N`, `#paused-overlay` not shown
  3. Send Wave → `#stat-wave` = `1/N`
  
  *Proof:* passing `debug` through restart, or not resetting the HUD, fails the reads; un-seeding the beat shows the briefing. The enemy-count half of the leak is proven by unit 12.1-14: the retried level is non-debug, so `window.__capture` is stale and is never read after RETRY.
- **New run `captureNextMissionReplay`:**
  1. seed map 0 = 3★ and `campaign_intro` seen; win map 0 (`lives` override 3★ → no improvement)
  2. tap `#results-next`
  3. expect `data-arrival` never `playing` (MutationObserver log), `#featured-name` = `MAPS[1].name`, LAUNCH focused
  4. the same seed with `#results-map` → `MAPS[0].name`, and `#featured-stars .fs-best` reads the seeded or just-set record
  
  *Proof:* dropping `next` from the payload shows map 0.
- **Desktop-only `captureHeldEnter`:**
  1. first-clear victory → ready
  2. `keyboard.down('Enter')` on NEXT MISSION
  3. on the map, `keyboard.down('Enter')` ×3 (Playwright sends `repeat: true` for a held key)
  4. `keyboard.up`
  5. expect `data-arrival="playing"` still, read within 300 ms of the repeats and with ≥ 2 × 300 ms of flight left (asserted)
  6. `#hud-layer` hidden (no level started)
  
  *Proof:* remove the `defaultPrevented` check in `_skipArrival` → `done` early; remove the key tail → LAUNCH clicks.
- **`captureReducedMotion`:** results open with `data-phase="ready"` on the first frame. `getAnimations({ subtree: true })` holds only the root `rs-fade`, then is empty after `fadeMs + 100`. A tap within `actGuardMs` of open does nothing.
- **Seeds:** the existing seeds stay `version: 4` (they now also exercise the v4 → v5 migration). New seeds that carry records use `version: 5`.
- **Bounds:** every "expect X" wait is shorter than the natural animation it could otherwise ride (memory "harness waits can be vacuous"). Skip checks are bounded at 250 ms against a 1750–2600 ms reveal, and the action is performed before the wait.

### 12.3 Device matrix (`npm run matrix`)
- `FLOW_STEPS` is unchanged (desktop 17/17, touch 18/18), and `deviceFlow.test.js` is untouched.
- The matrix is the fresh-first-run build/upgrade journey and never reaches a win. Results use the same devices with real input in §12.2.
- The matrix must still pass, because nothing it drives changes.

### 12.4 Live smoke on the production build
Run `npm run build && npm run preview` at 1440×900 and 844×390 (iPhone emulation, real input via the worktree's own Playwright; the MCP browser may be locked). Production has no `?debug`, so seed `lastlight_save` (a `version: 4` seed, which exercises the migration live):
- **(a) Win map 0 for real** on a fresh save (the shortest map; play it out):
  - epilogue → results
  - the banner slams, the stars stamp, NEW BEST does **not** show (first clear)
  - NEXT MISSION → flight → Lunar Gate card, LAUNCH focused
- **(b) Replay map 0 faster:**
  - NEW BEST on Time
  - NEXT MISSION → Lunar Gate with no flight
  - reload: map 0's briefing card reads `Best: N lost · m:ss`
- **(c) Buy Garrison (Doctrine), replay map 0 with no leaks:**
  - the Lives chip reads `27/27`
  - no NEW BEST on Lives if the record is already 0 lost
- **(d) Lose on purpose:**
  - THE LINE FELL, Veth jagged and glitching
  - RETRY → a clean wave-1 level with no briefing; send a wave, and wave 1 enemy count matches the table (watch the board)
- **(e) Change the volume on the world map after (a), reload:** the stars and record are still there (the prerequisite fix plus `recordRun`'s use of it).
- **(f) Settings → ambient motion off:** the results fade only.

Victory on the final map needs nine clears, so verify it in the capture build (§12.2) and say so in the PR rather than claiming a production check.

## 13. Edge cases (each covered by a test or an acceptance item)
| Case | Expected | Covered by |
|---|---|---|
| Lives exactly at 0.8 (16/20, 12/15, 20/25) | 3★; one fewer → 2★ | 12.1-1 |
| Lives exactly at 0.5 (10/20) | 2★ | 12.1-1 |
| Garrison bonus (lives > `map.startLives`, e.g. 22 of 22 on a 20-life map) | 3★ by today's rule. Chip `22/22`. Lives lost 0. | 12.1-1, 12.1-7, 12.1-14 |
| Garrison run ties a pre-Garrison record (0 lost then 0 lost) | No NEW BEST on Lives; record unchanged | 12.1-2 (Garrison fixture), 12.4 (c) |
| Garrison run with more lives left but more lost (22 → 19 lost 3 vs a record of 2) | Not a new best (3 > 2) | 12.1-2 |
| Last enemy leaks for the last life on the final wave (0 lives) | Defeat only, no stars, no record, one `_commitStats` | 12.1-14 (failing first) |
| Defeat on wave 1 | Wave chip `1/N`, RETRY primary | 12.1-7, 12.2 `captureRetry` |
| `__capture.end('defeat')` before any wave (debug only) | Wave `0/N`, time `0:00`, no crash | 12.1-7 |
| Final map victory | `CAMPAIGN COMPLETE` kicker; WORLD MAP primary; RETRY; no NEXT; final Command line | 12.1-7, 12.2 `07e` |
| Final map defeat | THE LINE FELL, RETRY primary, WORLD MAP | 12.1-7 |
| First-ever clear of a map | Record written silently, no NEW BEST | 12.1-2/3, 12.4 (a) |
| First clear after v4 → v5 (cleared map, null record) | Record written silently, no NEW BEST | 12.1-2/3 |
| Tie with the record (lives lost or time) | No NEW BEST | 12.1-2 |
| Faster time, more lives lost | NEW BEST on Time only; lives-lost record kept | 12.1-2/7 |
| v4 save with no record fields | Loads; records all null; written back as v5; stars/upgrades/beats intact | 12.1-3, 12.4 seeds |
| Garbage or old-shaped `records` in storage | Sanitized to null, no crash | 12.1-2/3 |
| A stale SaveManager instance writes after `recordRun` (or vice versa) | Stars and records both survive (freshness path) | 12.1-3, 12.4 (e) |
| 2× speed | Time = simulated time (`delta × 2` per frame); a 2× run of the same waves shows the same time | 12.1-14 |
| Paused (button, codex, exit confirm, auto-pause on hidden or portrait) | Time doesn't advance | 12.1-14 (no `update`) |
| Hit-stop frames | Excluded | 12.1-14 |
| Planning before wave 1, reading the briefing | Excluded (clock starts at Send Wave 1) | 12.1-14 |
| Run longer than an hour | `1:02:03`; chip still fits | 12.1-9, 12.2 worst case |
| Selling a tower | Gold earned unchanged | 12.1-4 |
| Victory with no epilogue (replay) while the player is tapping | The first tap only finishes the reveal | 12.1-6/12, 12.2 guard |
| Epilogue closed by a double tap | The dialog's swallow plus first-tap-finishes; no button pressed | 12.1-12, 12.2 |
| Double tap on a button | Finish, then the second tap is ignored within 250 ms | 12.2 `captureResultsGuard` |
| Reduced motion | Fade only; ready at once; guard holds | 12.1-6, 12.2 |
| Held Enter through NEXT MISSION (first clear) | Flight not skipped, LAUNCH not clicked | 12.2 `captureHeldEnter` |
| Held Space through RETRY | New level not paused | 12.1-13 (key tail), acceptance 9 |
| RETRY double tap over a pad | Second tap swallowed (touch events too) | 12.1-13 |
| RETRY after victory | Same map, records/stars kept, epilogue not replayed, the flight still owed on the next return | 12.1-10/14 |
| Retry chain then Abandon (Exit) | `from.result = 'victory'` and the flight plays | 12.1-10 |
| Retry ×3 then a wave | One enemy per spawn (no listener stacking) | 12.1-14 |
| Briefing seen before retry | Not replayed | 12.2 `captureRetry` |
| Briefing never seen (e.g. capture build) | Plays on the retried level, which is correct for a normal level | 12.2 note |
| Replay with no star gain, NEXT MISSION | No arrival; `mapId + 1` card; LAUNCH focused | 12.1-15, 12.2 |
| Replay with a star gain, NEXT MISSION | Stamp arrival, then the next card | 12.1-15 |
| Gap save (later map already starred) | NEXT = the flight's `toId` on a first clear, else `mapId + 1` | 12.1-11 |
| Missing Command/Veth portrait art | Initial letter in the same frame | 12.1-12 |
| Unknown speaker id in `RESULT_SPEAKERS` | Prevented by a data test; the default look if it ever ships | 12.1-8 |
| Inspector/tooltip/wave preview open at the end | Hidden by `_showResults` | 12.1-14 |
| Tab hidden mid-reveal | rAF stalls; on return the next tick is ≥ `endMs` → ready | 12.1-6 (timestamp-driven) |
| Rotation or resize mid-reveal | CSS re-flow inside the new map rect; no clipping | 12.2 rotation audit, acceptance 10 |
| Webfonts blocked | Layout clean | 12.2 `captureNoFonts` |
| jsdom (no layout, no `animate`) | The screen works; animation is class-only | 12.1-12 |

## 14. Acceptance list (for the browser-acceptance agent)
Production build unless noted, at 1440×900 and 844×390. Also capture build at 932×430 and 750×340.
1. Winning a level shows the epilogue (first win only), then a screen where:
   - a **gold slanted banner** "SECTOR HELD!" slams in from the left
   - three stars stamp down one after another (earned gold, unearned hollow)
   - four tilted chips (LIVES, KILLS, GOLD, TIME) pop in
   - Sol Command's portrait and a gold caption line appear bottom-left
   - the buttons NEXT MISSION ▸ (filled gold), ↻ RETRY and WORLD MAP stack bottom-right
2. Losing shows a **red** banner "THE LINE FELL" with a shake, no stars, chips WAVE n/N, KILLS, GOLD and TIME, and **the Veth** in violet with a jagged, flickering caption. RETRY is the filled red primary.
3. Everything sits inside the map area, between the rails, and the rails are dimmed and can't be used. Nothing is clipped at 750×340, and every button is at least 44 px tall on the phone.
4. One tap anywhere during the animation shows the finished screen at once. A tap a moment later on a button acts. A quick double tap on NEXT MISSION finishes the animation but doesn't leave.
5. Keyboard: Enter skips, then Enter presses the focused (primary) button; Tab cycles only the screen's buttons; Escape (once finished) goes to the world map; Space never pauses the game behind it.
6. NEXT MISSION after a first clear: the ship flies to the next mission, its card opens, and LAUNCH is focused (Enter launches it). After a replay of a cleared map: no flight, and the next mission's card opens with LAUNCH focused.
7. RETRY: the same map restarts at wave 1 with full lives and starting gold, and with no briefing if it was seen. Sending wave 1 spawns the normal number of enemies.
8. Records:
   - Beating your best time on a replay shows a **NEW BEST** stamp on the TIME chip.
   - Losing fewer lives than your best shows one on the LIVES chip.
   - The briefing card then reads "Best: N lost · m:ss".
   - A first-ever clear shows no NEW BEST, and neither does a Garrison run that only ties your fewest-lost record.
9. Holding Space while tapping RETRY doesn't pause the new level. Holding Enter on NEXT MISSION doesn't skip the flight or launch.
10. Rotating a phone mid-animation keeps the screen laid out inside the map area.
11. Settings → ambient motion off: the screen fades in finished, and nothing slams, stamps, shakes or flickers.
12. Final map win (capture build): kicker "CAMPAIGN COMPLETE", WORLD MAP primary, no NEXT MISSION.
13. After winning, changing the volume on the world map, and reloading, the stars and the best record are still there.
14. VoiceOver spot check (or an assertion on `#results-live`): the result is announced once, as a sentence, including the stars and the speaker's line.

## 15. Out of scope
- Score, difficulty modes, per-map best wave on defeat (5.3).
- SFX for the stamps, and music stingers (there's no UI-click SFX key in `SFX_KEYS`, as noted in 3.5).
- Rael on the results screen; new portrait art.
- Migrating `StoryDialogOverlay` onto `gestureTail.js` (allowed, not required).
- The stale-save write fix itself: a prerequisite hotfix to `main` plus a forward-port (§4.4, decision 7).
- Fixing stale *reads* across `SaveManager` instances (for example the codex's encounter gating after a win).
- A share or screenshot button.

## 16. Open questions
None open.

**Resolved on 2026-10-26:**
1. **The Garrison bonus vs the star rule** was answered by **user decision 6**:
   - records store fewest lives lost
   - the chip shows the honest run count (`17/22`)
   - the star rule is unchanged
   - the briefing reads `Best: 0 lost · 9:42`
2. **The stale-save clobber** was answered by **user decision 7**: it ships first as a hotfix PR to `main` (a `fix/` branch off `origin/main`, failing test first), is forward-ported into `visual/integration`, and 3.6 builds on it (§4.4).
