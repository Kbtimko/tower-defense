# Barracks Rally Flag + Soldier Walk (#48) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new ⚑ Rally ring item lets the player plant a flag on the road inside a barracks' range; the squad walks there along the road (and after a Move, to the new pad's road point), fighting what it meets, disengaging from a fight it was ordered out of.

**Architecture:** Pure modules carry every rule — target snap/validation (`rallyTarget.js`), road-walk stepping with sub-stepped contact halts and the disengage window (`soldierMarch.js`), render-only formation offsets (`soldierFormation.js`) and one shared block predicate (`soldierCanBlock`). `Barracks`/`Soldier` hold per-soldier `pathProgress` against the shared target `soldierPathProgress`; "marching" is derived (`pathProgress !== target`), never stored. `GameScene` adds a rally input mode next to reposition, draws mockup B (range ring + ghost flag, dotted route, fading flag), and exposes `__capture.rally` for a new `--screens` run.

**Tech Stack:** Phaser 3, Vite 5, Vitest 2 + jsdom, vanilla ES modules, Playwright (harness).

**Spec:** `docs/superpowers/specs/2026-10-29-rally-flag-soldier-walk-design.md` — read it. This plan does not repeat its reasoning or edge-case table; tests cite its IDs (R6, C15, E14b…).

## Global Constraints

- Worktree `/Users/keithtimko/projects/tower-defense/.claude/worktrees/soldier-walk-48`, branch `visual/48-soldier-walk`. Run every command from there. Stage explicit paths only (never `git add -A`/`.`). Conventional Commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tunables live in `src/data/soldiers.js` (R19, verbatim values): `SOLDIER_MARCH = { speed: 60, substepPx: 15, disengagePx: 60 }`, `SOLDIER_FORMATION = { spacingFrac: 0.55, fallbackSpacingPx: 9, flankBackFrac: 0.4 }`, `WALK_BOB = { amplitudePx: 1.5, hz: 4 }`, `RALLY_FLAG = { fadeMs: 900, ghostAlpha: 0.6, routeDotSpacingPx: 10, routeDotRadius: 2, poleHeight: 18, pennant: { w: 10, h: 7 }, depth: 10.6, ok: PALETTE.accent, bad: PALETTE.danger }`, all frozen. `RING_ANGLES.rally = 0` in `src/data/radial.js`. No hex or tunable literal in scene/entity code for this feature.
- Range is always `barracks.range` (includes meta `towerRangeMult`), never the literal 130.
- Exact copy: item label `Rally`, icon `⚑`, aria `Rally ${def.name} soldiers`; toasts `Tap the road inside the ring to rally the squad` (enter), `Rally on the road` (off road), `Too far — rally inside the ring` (out of range); ring peek header `Rally`, line `Then tap the road inside the ring to send the squad there.`
- **No `move` entry in `src/data/sprites.js`** (C11) — only the comment at `:247-248` changes. `setState('move')` is a no-op until art exists.
- **No diff under `src/sim/`.** `npm run balance` stdout must be byte-identical to the b0adeed baseline (R18).
- No new event listeners on `this.events`/`this.game.events`; if one becomes unavoidable, wire and unwire as a pair (memory: scene listener leak).
- Every new test is first run against deliberately broken code and must fail for the specific reason (spec "Test strategy" table "Break it by" column, plus each task's listed sabotage). Record each break-and-fail in the task report.
- Never loosen an existing timeout. Never pipe test/build output through `head`/`tail`; check exit codes.
- Tests importing anything that transitively imports Phaser must `vi.mock('phaser', …)` like neighbouring tests (`src/entities/Soldier.test.js`, `src/scenes/GameScene.*.test.js`).
- Guards that must stay green: themeCss, kitRollout, noNativeTitles, railCss, typeFloor, storyDialogCss, resultsCss.

## Review Focus

1. **Disengage window never clears** when an engaged squad is ordered onto (or arrives at) its current point: it would stop blocking forever. Arrival (and `progress === target` at order time) must zero `disengageLeftPx`. → Task 5 test `an engaged squad rallied onto its own point keeps blocking`.
2. **Tier change on a mid-march upgrade** (tier 4B: 3 → 4 soldiers): the extra index has no old soldier and must spawn at the target, not at `undefined`/0. → Task 5 test `rebuild with more soldiers than before spawns the extras at the target`.
3. **RETRY / leave while in rally mode or mid-march:** no overlay, route or flag Graphics survive; the next level starts with `rallyMode === false`. → Task 6 liveScene test `RETRY in rally mode leaves no rally state`.
4. **Flag fade before wave 1:** `_runMs` only advances once a wave has started (`GameScene.js:719`), so a fade clocked off `_runMs` would hang on a pre-wave rally. The fade must count down by the speed-scaled frame `dtMs`. → Task 6 test `flag fades after arrival with no wave started`.
5. **Muzzle flash and repair heal positions:** flash spawns at the drawn soldier (logical + offset, R13); the heal radius test keeps using logical x/y. → Task 6 test `muzzle flash spawns at the drawn soldier position`.

---

### Task 1: Tunables, ring angle, shared block predicate, balance baseline  (model: sonnet)

**Files:**
- Create: `src/data/soldiers.js`, `src/data/soldiers.test.js`
- Modify: `src/data/radial.js:20`, `src/systems/soldierCombat.js:33-40`, `src/systems/soldierCombat.test.js`
- Scratch (not committed): `.superpowers/sdd/balance-baseline.txt` + its SHA-256

**Interfaces:**
- Produces: the four frozen constants (Global Constraints); `RING_ANGLES.rally === 0`; `export function soldierCanBlock(soldier, enemy) → boolean` = `!soldier.dead && !(soldier.disengageLeftPx > 0) && (!enemy.def?.flying || soldier.canBlockFlyers)`; `findBlockingSoldier(enemy, soldiers)` = first soldier with `soldierCanBlock && dist < MELEE_RANGE` (same order, same result as today for soldiers without `disengageLeftPx`).

- [ ] **Step 1: Baseline first.** Before editing anything, run `npm run balance > .superpowers/sdd/balance-baseline.txt; echo $?` twice and `shasum -a 256` both; they must match (if not, report BLOCKED — the R18 proof needs deterministic output). Record the SHA in the report.
- [ ] **Step 2: Failing tests.** `src/data/soldiers.test.js`: values equal the Global Constraints; `SOLDIER_MARCH.substepPx <= MELEE_RANGE / 2`; `speed > 0`; `disengagePx > 0`; `RALLY_FLAG.fadeMs >= 0`; `RALLY_FLAG.ok === PALETTE.accent`, `bad === PALETTE.danger`; all four `Object.isFrozen`; `RING_ANGLES.rally === 0` and distinct from every other ring angle. `soldierCombat.test.js` adds `soldierCanBlock` cases: dead → false; `disengageLeftPx: 10` → false; `disengageLeftPx: 0` → true; flyer vs `canBlockFlyers` false/true; and `findBlockingSoldier skips a disengaging soldier and returns the next one`.
- [ ] **Step 3:** `npx vitest run src/data/soldiers.test.js src/systems/soldierCombat.test.js` → FAIL.
- [ ] **Step 4:** Implement. `findBlockingSoldier` calls `soldierCanBlock`.
- [ ] **Step 5:** Same command → PASS; existing `soldierCombat` and `src/sim/` tests still pass (`npx vitest run src/systems src/sim`). Sabotage: invert the flyer rule; drop the `disengageLeftPx` check; set `substepPx: 40` — each named test fails; restore.
- [ ] **Step 6:** `npm run balance` → SHA equals the baseline.
- [ ] **Step 7: Commit** `feat(soldiers): rally tunables and shared soldierCanBlock predicate (#48)`.

### Task 2: Rally target snap/validation + formation offsets  (model: sonnet)

**Files:**
- Create: `src/systems/rallyTarget.js`, `src/systems/rallyTarget.test.js`, `src/systems/soldierFormation.js`, `src/systems/soldierFormation.test.js`

**Interfaces:**
- Consumes: `PathManager` (`getNearestPathProgress(x, y)`, `getPathPoints()`), `pointAtProgress` from `src/systems/pathGeometry.js`.
- Produces:
  - `resolveRallyTarget({ x, y, pathMgr, centre, range, tapRadius }) → { progress, point, onRoad, inRange, valid }` (R6: `onRoad = dist(pointer, point) < tapRadius`; `inRange = dist(point, centre) <= range`).
  - `formationOffsets(count, dir, spacing, flankBackFrac) → Array<{dx, dy}>` (R11): index 0 = `spacing` along `dir`; 1/2 = ±`spacing` along the normal, `flankBackFrac × spacing` behind; index ≥3 behind on alternating sides, each further row one `spacing` further back; `dir` normalised, zero/NaN vector → `{x: -1, y: 0}`.

- [ ] **Step 1: Failing tests.** Use a real `PathManager` on a hand-built straight path (`[{x:0,y:100},{x:400,y:100}]`) so numbers are exact. rallyTarget: E1 snapped point exactly `range` away → `valid`; E2 `range + 0.01` → `inRange false, valid false`; E3 pointer exactly `tapRadius` off the road → `onRoad false`; `range` comes from the argument (pass 50 and 200, results differ); `point` equals `pointAtProgress(path, progress)`; E7 pointer beyond the path end clamps to progress 1. formation: E32 counts 1/3/4 give that many distinct offsets; index 0 has positive dot product with `dir`, flanks are mirror images about `dir`; deterministic (two calls deep-equal); E33 `dir {0,0}` and `{NaN,NaN}` → no NaN, index 0 points to −x; rotating `dir` 90° rotates every offset 90°.
- [ ] **Step 2:** `npx vitest run src/systems/rallyTarget.test.js src/systems/soldierFormation.test.js` → FAIL.
- [ ] **Step 3:** Implement both.
- [ ] **Step 4:** PASS. Sabotage: `<` for range, `<=` for road, swap ahead/behind, drop the zero-vector fallback — each named test fails; restore.
- [ ] **Step 5: Commit** `feat(soldiers): pure rally target and formation offsets (#48)`.

### Task 3: Road march stepping  (model: sonnet)

**Files:**
- Create: `src/systems/soldierMarch.js`, `src/systems/soldierMarch.test.js`

**Interfaces:**
- Consumes: `soldierCanBlock`, `MELEE_RANGE` (Task 1), `pointAtProgress`, `pathLength` (`pathGeometry.js`).
- Produces:
  - `marchStep({ progress, target, dt, speed, totalLength, substepPx, path, blocked }) → { progress, arrived, halted, walkedPx }` (R7 + spec C15 addendum). Order: no-op guards (`dt <= 0`, `progress === target`, `totalLength <= 0` → unchanged, `arrived = progress === target`, `halted false`, `walkedPx 0`); then `blocked(pointAtProgress(path, progress))` first → `halted true`, no move; else advance toward `target` by ≤ `speed·dt` px of arc in sub-steps of ≤ `substepPx`, stopping (halted) at the first sub-step point where `blocked` is true; land exactly on `target` (`arrived true`); clamp to [0, 1].
  - `contactTest(soldier, enemies) → (point) => boolean` — some `e` with `!e.dead`, `soldierCanBlock(soldier, e)`, `dist(point, e) < MELEE_RANGE` (R8).
  - `isMarching(soldier, target) → boolean` — `!soldier.dead && soldier.pathProgress !== target`.
  - `routeDots(path, from, to, spacingPx) → Array<{x,y}>` — first at `from`, last at `to`, consecutive arc spacing within ±1 px of `spacingPx`, order follows `from → to` (reversed when `to < from`); `from === to` → one point.
  - `travelDir(path, progress, target) → {x, y}` — unit road tangent toward `target`; when equal, the upstream tangent (toward lower progress); degenerate → `{x: -1, y: 0}`.

- [ ] **Step 1: Failing tests** on a straight 400-px path and an L-shaped path: distance walked = `speed·dt` measured in arc length (L path, across the corner); E5 target within one step → exact landing, no overshoot; E6 target behind → progress decreases; E7 clamp; E13 a `dt = 0.4`, `speed 60` step toward an enemy 20 px ahead halts with the end point `< MELEE_RANGE` from it and never past it, and with `substepPx` honoured (assert ≥ 2 `blocked` calls); E14 enemy already in range → no move, `halted true`; `walkedPx` equals the arc moved; a `blocked` that always returns false walks straight through (the disengage case, E14b at the pure level). contactTest: E15 flyer vs non-flyer squad → false; E16 flyer vs `canBlockFlyers` → true; E17 dead enemy ignored; disengaging soldier → false. routeDots and travelDir per Interfaces, both directions.
- [ ] **Step 2:** `npx vitest run src/systems/soldierMarch.test.js` → FAIL.
- [ ] **Step 3:** Implement. Progress ↔ px via `totalLength` (as `Hero.js:258-271`).
- [ ] **Step 4:** PASS. Sabotage: step in point-index space; drop the clamp; one full step with no sub-steps; test only the end point; drop `e.dead`; return straight-line route points — each named test fails; restore.
- [ ] **Step 5: Commit** `feat(soldiers): pure road march stepping with contact halts (#48)`.

### Task 4: Rally ring item + tap routing  (model: sonnet)

**Files:**
- Modify: `src/systems/radialItems.js:67-93` (+ `radialItems.test.js`), `src/systems/tapResolve.js` (+ `tapResolve.test.js`), `src/systems/radialLayout.test.js`

**Interfaces:**
- Produces: barracks `ringItems` contains `{ id: 'rally', slot: RING_ANGLES.rally, icon: '⚑', label: 'Rally', cost: null, variant: 'primary', state: 'ready', ariaLabel: 'Rally <def.name> soldiers' }`, pushed after the upgrade/branch items and before `sell` (R1). `resolveTap(state, hits)` returns `{ type: 'rally' }` when `state.rallying` is truthy, checked after `repositioning` and before `radial` (R3); `hasMode` counts `rallying`. Update the header comment's priority chain and caller contract (`state.rallying = rallyMode && rallyBarracks`).

- [ ] **Step 1: Failing tests.** radialItems: barracks at level 1, 3 (unbranched, 5 items), 4 → `rally` present with the exact fields, and its index is after upgrade/branch and before sell; archer/mage/sniper rings have no `rally`. tapResolve: `{ rallying: true }` → `rally`; `{ aimSlot: 0, rallying: true }` → `fireAim`; `{ repositioning: true, rallying: true }` → `reposition`; `{ rallying: true, radial: {...} }` → `rally`; E25 `{ rallying: true }` with `hits.tower` set → `rally` (not `openRing`); `hasMode({ rallying: true })` true. radialLayout: the 5-item level-3 barracks ring and the level-1 ring lay out with no overlap at both cell sizes the existing tests use.
- [ ] **Step 2:** Run the three test files → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** PASS; `npx vitest run src/systems src/ui` green. Sabotage: push `rally` before upgrade; check `rallying` after `radial` — named tests fail; restore.
- [ ] **Step 5: Commit** `feat(radial): barracks Rally item and rally tap routing (#48)`.

### Task 5: Barracks + Soldier march, disengage, respawn, render offset  (model: opus)

**Files:**
- Modify: `src/entities/Barracks.js`, `src/entities/Soldier.js`, `src/data/sprites.js:247-248` (comment only), `src/entities/Soldier.test.js`
- Create: `src/entities/Barracks.test.js` (absent today)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `Barracks.spawnSoldiers(scene, pathPoints, spawnProgress = null)` — stores `this.pathPoints`, `this.totalLength = pathLength(pathPoints)`; soldier *i* spawns at `spawnProgress?.[i] ?? this.soldierPathProgress`.
  - `Barracks.setRallyPoint(progress, enemies = [])` replaces `repositionSoldiers` (S9; delete the old method). It first marks every live soldier that is engaged (`contactTest(soldier, enemies)({x: soldier.x, y: soldier.y})` evaluated with its window at 0) with `disengageLeftPx = SOLDIER_MARCH.disengagePx` — **only if** `progress !== soldier.pathProgress`; then sets `soldierPathProgress = progress` and `rallyFlag = { progress, fadeLeftMs: null }` (null = not yet arrived; Task 6 drives the fade). No teleport.
  - `Barracks._rebuildSoldiers(scene, pathPoints)` (C9): captures old soldier *i*'s `pathProgress` when it was alive, else the target; extras beyond the old count get the target; rebuilds via `spawnSoldiers(..., spawnProgress)`.
  - `Soldier`: keeps `pathPoints`, `totalLength`, `disengageLeftPx = 0`; drawn children (body, sprite, shadow, HP bar) live in an inner container `this._view` (pass it to `EntitySprite`) so offsets move only the view (R12). `update(dt, enemies = [], { reducedMotion = false } = {})`: ticks combat as today; if `isMarching(this, barracks.soldierPathProgress)` runs `marchStep` with `blocked = this.disengageLeftPx > 0 ? () => false : contactTest(this, enemies)`, applies `setPathProgress`, subtracts `walkedPx` from `disengageLeftPx` (floor 0), zeroes it on `arrived`; sets `setState('move')` + `setFacing(facingDirX(travel dx))` + bob (`WALK_BOB`, 0 under reduced motion) while moving, `setState('idle')` + bob 0 on halt/arrival/rest; applies `formationOffsets(barracks.soldiers.length, dir, spacing, flankBackFrac)[index]` to `_view` (dir = `travelDir`; spacing = `spacingFrac × getDisplaySize().width` when the sprite is active else `fallbackSpacingPx`). At rest it faces upstream (S4). `drawnPosition() → {x, y}` = logical + current view offset (Task 6 uses it for the muzzle flash).
  - `Soldier.respawn()` first calls `setPathProgress(this.barracks.soldierPathProgress, this.pathPoints)` (R10). Death (`takeDamage` killing blow) zeroes `disengageLeftPx`.
  - Update the `sprites.js:247-248` comment: a `move` state is wired and falls back to `idle` until a sheet is registered.

- [ ] **Step 1: Failing tests** (Phaser mocked; soldiers on a real straight path). Barracks: `setRallyPoint` doesn't move anyone (x/y unchanged) and sets the target + `rallyFlag`; after N `update(dt)` frames soldiers reach the target exactly and `isMarching` is false; E14b engaged squad given an order gets `disengageLeftPx === 60` and walks off while an enemy sits in contact, and `findBlockingSoldier` skips it; E14d unengaged squad → 0; **Review Focus 1:** engaged squad rallied onto its own point keeps `disengageLeftPx === 0` and still blocks; window zeroes on arrival; E14c window runs out with an enemy in contact → halts; E12/R10 a soldier killed mid-march respawns at the target; E14e rebuild mid-march keeps live soldiers' progress and puts dead ones at the target; **Review Focus 2:** rebuild with 4 soldiers after 3 spawns the 4th at the target. Soldier: container x/y stays on the road while `_view` is offset (R12); `setState('move')` called while marching, `idle` at rest; bob 0 when `reducedMotion`; facing flips when walking back (E6, deadzoned); `drawnPosition()` = logical + offset.
- [ ] **Step 2:** `npx vitest run src/entities` → FAIL (new tests).
- [ ] **Step 3:** Implement. Keep the `Soldier.update(dt)` call shape working for callers that pass only `dt` (defaults).
- [ ] **Step 4:** `npx vitest run src/entities src/systems src/scenes` → PASS (scene tests unchanged). Sabotage: respawn in place; offset the container instead of `_view`; don't zero the window on arrival; rebuild at the target only; set the window regardless of `progress !== pathProgress` — each named test fails; restore.
- [ ] **Step 5: Commit** `feat(soldiers): squads march to the rally point, disengage on order (#48)`.

### Task 6: GameScene rally mode, Move hand-off, overlay/route/flag, harness hook  (model: opus)

**Files:**
- Modify: `src/scenes/GameScene.js` (`create` ~268-270, `shutdown` ~624/644, `update` draw block ~739-744 and debug block ~696-700, `_modeState` ~1383-1391, `_runTapAction`, `_repositionTo` ~1435-1451, `_cancelMode` ~1466-1477, `_onRadialActivate` ~1655-1667, `_fillRingPeek` ~1743-1779, `_updateEnemies` muzzle flash ~866, `_updateSoldiers` ~969-974)
- Create: `src/scenes/GameScene.rally.test.js`; modify `src/scenes/GameScene.inputModes.test.js`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `this.rallyMode`, `this.rallyBarracks`; `_startRally()`, `_rallyTo(mx, my)`, `_drawRallyOverlay()`, `_drawRallyRoutes(dtMs)`; two Graphics layers at `RALLY_FLAG.depth` (overlay, route+flag), destroyed in `shutdown`. `window.__capture.rally = [{ target, marching, soldiers: [{ progress, dead }] }]` per barracks (debug builds only, in the existing debug block).
- Behaviour, all per the spec: R2 (`_startRally` closes the ring, sets the mode, toasts, syncs Cancel, draws the overlay; `rally` is not in `CONFIRMABLE`); R3 (`_modeState` adds `rallying`; `_cancelMode` clears it and redraws the overlay); R4 (`_rallyTo`: tap within `TAP_TOWER_RADIUS` of the rally barracks → exit silently; missing barracks → cancel; else `resolveRallyTarget` with `centre` = barracks, `range = barracks.range`, `tapRadius = TAP_PATH_RADIUS` → off-road toast / out-of-range toast and stay, or `barracks.setRallyPoint(progress, this.enemies)` and exit); R5 (`_repositionTo` success → `setRallyPoint(pathMgr.getNearestPathProgress(slot.x, slot.y), this.enemies)`); R9 (`_updateSoldiers(dt)` passes `this.enemies` and `{ reducedMotion: registry.get('ambientMotion') === false }`, still after `_updateEnemies`); R13 (muzzle flash at `blocker.drawnPosition()`); R15 overlay (range circle `barracks.range` + ghost at `resolveRallyTarget(cursor)` — OK colour when valid, bad when on-road-out-of-range, un-snapped bad at the cursor when off road; ghost starts on the current rally point (S1); redrawn every `update` and on mode enter/exit (S5)); R16 route/flag (dotted `routeDots` from the squad's lead live soldier to the target while any soldier marches; flag at target; on the first frame every live soldier has arrived set `rallyFlag.fadeLeftMs = RALLY_FLAG.fadeMs` (0 under reduced motion), then count it down by the speed-scaled frame `dtMs` — **not** `_runMs` (Review Focus 4) — alpha ∝ remaining, delete `rallyFlag` at ≤ 0; S3: Move shows the same visuals); `_fillRingPeek` `rally` case with the exact copy.

- [ ] **Step 1: Failing tests** in `GameScene.rally.test.js`, using the existing scene-test harness pattern (`src/scenes/gameSceneHarness.js` / `GameScene.inputModes.test.js` setup): R2 activate `rally` → mode on, Cancel visible, toast text; E24 Escape / Cancel / tap on the same barracks → mode off, overlay cleared, no toast; R4 off-road tap → `Rally on the road`, mode stays; out-of-range tap (on the road, beyond `barracks.range`) → `Too far — rally inside the ring`, mode stays; valid tap → target set, soldiers not teleported, mode off; E36 barracks removed → cancelled; R5 after a Move the target is the new pad's nearest point and soldiers have not moved yet; frame order (Decision 2): a march into an enemy halts and the enemy is blocked on the next frame's `_updateEnemies`; E14b in-scene: engaged squad ordered away releases the enemy on the next frame; E8 re-rally mid-march retargets; E11 sell mid-march → next frame draws no route/flag; E21 2x doubles distance per real frame; E22 hit-stop/pause → no march; E23 entering rally from a ring left open under a user pause draws the overlay with no `update` call; E29 level end in rally mode hides Cancel; **Review Focus 3** RETRY in rally mode leaves no rally state (liveScene pattern from `GameScene.shutdown.test.js`); **Review Focus 4** flag fades after arrival with no wave started (`currentWave === 0`) and is gone after `fadeMs` of frames; reduced motion removes it on arrival; **Review Focus 5** muzzle flash spawns at `drawnPosition()`; E31 debug-built barracks are not marching at load; ring peek copy for `rally`.
- [ ] **Step 2:** `npx vitest run src/scenes/GameScene.rally.test.js src/scenes/GameScene.inputModes.test.js` → FAIL.
- [ ] **Step 3:** Implement. No new DOM, no CSS, no new event listeners. Colours/sizes only from `RALLY_FLAG`; `ok`/`bad` are PALETTE hex strings, converted for Graphics with `hexToInt` from `src/ui/theme.js` (as `src/ui/loadingBar.js:26-28` does).
- [ ] **Step 4:** `npm test` → full suite PASS (report the count); `npm run build` → exit 0; `npm run balance` SHA equals the Task 1 baseline. Sabotage: exit the mode on a miss; march before `_updateEnemies`; skip the halt; draw the overlay only in `update`; fade off `_runMs`; flash at `blocker.x/y` — each named test fails; restore.
- [ ] **Step 5: Commit** `feat(game-scene): barracks rally mode, march visuals and Move hand-off (#48)`.

### Task 7: Capture run `rally` + committed captures  (model: opus)

**Files:**
- Modify: `scripts/capture.mjs` (new `captureRally`, wired into the `--screens` per-device runs list ~593-605)
- Create: `docs/captures/48-rally-flag/*.jpg` (JPEG q90)

**Interfaces:**
- Consumes: `__capture.rally` (Task 6), `.radial-item[data-id="rally"]` (Task 4), existing helpers `gotoLevel`, `tap`, `tapGamePoint`, `pressPoint`, `untilGameTime`, `radialAudit`, `watchProblems`.
- Produces: R20 steps (a)–(e) on desktop, desktop1440, iphone, pixel, ipad: map 0, a `build=barracks@N:1` whose `barracks.range` covers road on both sides of its rally point (pick N in Node from `MAPS` + `PathManager`, which are pure), **no `wave` param**. (a) tap barracks → tap Rally → `#cancel-btn` visible; `radialAudit` on the ring first. (b) pointer (desktop move / touch hold) on an in-range road point → `rally-ghost` shot. (c) on an out-of-range road point → `rally-ghost-out` shot; release → toast text asserted, Cancel still visible. (d) tap an in-range road point far from the current one → wait in game time for `marching === true` → `rally-march` shot. (e) wait in game time for `marching === false`; every soldier's `progress === target`; Cancel hidden.

- [ ] **Step 1:** Implement `captureRally`. Game-time waits only via `untilGameTime` (memory: game-time waits need game-time budgets); no new or loosened timeouts.
- [ ] **Step 2: Prove it fails.** Temporarily make `setRallyPoint` teleport (call `setPathProgress` on every soldier) → step (d) fails; temporarily leave the mode armed after a valid tap → step (e) fails on `#cancel-btn`. Record both in the report; restore.
- [ ] **Step 3:** Check `uptime` (load < 6 before gating — memory: matrix load flakes), then `npm run build` and `npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad` → zero problems except the known desktop1440 #56(a) reduced-motion probe (report it if it appears; anything else is a failure). View every `rally-*` shot yourself on the dark board (memory: sprite pipeline / view captures yourself); report what each shows.
- [ ] **Step 4:** Convert the `rally-*` shots for every device to JPEG q90 into `docs/captures/48-rally-flag/` (`<device>-rally-ghost.jpg`, `-rally-ghost-out.jpg`, `-rally-march.jpg`).
- [ ] **Step 5: Commit** `test(capture): rally run on five devices; captures (#48)`.

---

## After the tasks (controller, not a subagent)

Final opus whole-branch review → ONE fix wave → scoped re-review. Then `npm run matrix` (unchanged, must pass), live check on the production build (`npm run build && npm run preview`) at desktop 1440×900 and iPhone 14 with real input per the spec's "Live verification" list, frozen-frame probes for formation/flag geometry. Report the per-map worst-case Move walk time (spec "Left to the builder"). Update `.claude/notes.md` (#48 ✅; new backlog: soldier move-sheet art; Move mode's stale rally drawing at `GameScene.js:2171-2181`), write `.claude/sessions/2026-10-29-rally-flag.md` with every ruling, commit both onto the branch, then `gh pr create --base visual/integration` with both balance SHAs and the suite count.
