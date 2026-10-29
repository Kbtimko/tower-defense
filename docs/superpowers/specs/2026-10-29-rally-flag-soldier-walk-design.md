# Barracks rally flag + soldiers walk to it (backlog #48)

**Branch:** `visual/48-soldier-walk` (off `origin/visual/integration` b0adeed). PR targets `visual/integration`.

## Intent

The original ask (`.claude/notes.md:287`, user, 2026-10-23): *"Soldiers should visibly walk to a
new rally point when repositioned."* The backlog text adds: walk them along the path using the
soldier move animation, keep blocking and timing rules sensible while they travel, and mirror
the travel time in `src/sim/` if it affects balance.

Why: a barracks squad can't be pointed at a chokepoint today. The rally flow that used to do it
was replaced by moving the building itself. Even then, a move left the squad standing where it
was. A squad that walks to a flag the player plants, and fights whatever it meets on the way,
puts soldier placement back in the player's hands and makes it readable.

**Fidelity notes. The ask names three things this spec handles differently. Please confirm each:**
- *"the soldier move animation"*: there is none. The soldier has `idle` and `attack` sheets
  only (`src/data/sprites.js:249-259`). Its comment, `:247-248`, says the soldier deliberately
  gets no `move` state. This spec wires a `move` state that falls back to `idle` plus a small
  walk bob (R14). The real gait appears when a move sheet is drawn. Until then the squad
  slides along with a bob, and **no walk cycle is visible**.
- *"Mirror travel time in src/sim/"*: not done. The user's Decision 3 keeps respawn at the
  rally point, and the sim never repositions a squad (`src/sim/simulate.js:27-30`), so
  balance doesn't change. R18 proves it.
- *"when repositioned"*: per Decision 1, this means a new **Rally** radial item. The existing
  **Move** item still relocates the building.

### Today (verified)

- The barracks ring's **Move** item (`src/systems/radialItems.js:71-73`: id `reposition`, slot
  `RING_ANGLES.reposition` = 180°, icon `↻`) enters reposition mode (`GameScene._startReposition`,
  `src/scenes/GameScene.js:1825-1835`). The next tap goes to `_repositionTo` (`:1435-1451`). That
  snaps to a free pad within `REPOSITION_SNAP_RADIUS` (60, `src/data/input.js:25`) and moves the
  **building**. On a miss it exits silently (`:1440-1443`). It **never touches
  `soldierPathProgress`**, so the squad stays on the old road point. An upgrade's
  `_rebuildSoldiers` (`src/entities/Barracks.js:39-43`, called at `GameScene.js:1791-1793`)
  respawns the squad at that same old point.
- `Barracks.repositionSoldiers` (`Barracks.js:26-31`) is the teleport: it calls
  `Soldier.setPathProgress` (`src/entities/Soldier.js:62-67`), which sets x/y directly. It has
  **no caller** anywhere in `src/` (grep). The tap-a-road-point-in-range rally flow it served is
  documented in `docs/superpowers/specs/2026-05-13-barracks-soldier-rebuild.md:148`.
- The whole squad stands on **one identical point** (`Barracks.spawnSoldiers`, `:14-24`,
  `pointAtProgress(path, soldierPathProgress)`). The sim relies on this. Because
  `findBlockingSoldier` returns the first live match, only one soldier blocks at a time and the
  others wait as queued replacements (`src/sim/simulate.js:96-98`, `src/systems/soldierCombat.js:33-40`).
- Blocking: an enemy is held when it is `< MELEE_RANGE` (30 px, `soldierCombat.js:17`) from a live
  soldier. Flyers are held only when `canBlockFlyers` is true (`:36`). The check runs in
  `_updateEnemies` (`GameScene.js:859-870`) against the enemy's **pre-move** position, before
  `_updateSoldiers` (`:728`, `:969-974`).
- Respawn happens **in place**: `tickSoldier` (`soldierCombat.js:55-64`) then `Soldier.respawn`
  (`Soldier.js:80-87`) leaves x/y wherever the soldier died.
- The hero is the walking precedent. It steps in progress space,
  `deltaProgress = speed·dt / totalPathLength` (`src/entities/Hero.js:258-271`), and calls
  `setState('move')` and `setFacing` while moving.
- Sprite fallback: `EntitySprite.setState(name)` does nothing when `name` isn't registered
  (`src/systems/EntitySprite.js:99-100`). `move` is already a looping state (`:10`), and a
  one-shot attack reverts to `idle` (`:168-173`).
- **Canvas input is dropped while the scene is paused** (`src/scenes/InputController.js:47-49`),
  and `update()` doesn't run, so the per-frame `gfx` layer (`GameScene.js:293-295`) is not
  redrawn. A user pause doesn't close an open radial (`_onPauseToggle`, `:505-523`). Only
  exit-confirm does (`:495-496`). The DOM radial therefore stays clickable under the PAUSED
  overlay, which has `pointer-events: none` (`index.html:379-380`).
- Phaser caps a frame's delta at 200 ms (`scripts/capture.mjs:1326-1328`), so at 2x the most
  game time one frame can carry is 0.4 s.

## Decisions (the user's)

1. **"Repositioned" means a restored rally flag**, as a new radial item. The building stays
   put. The existing **Move** still relocates the building. After a Move, the squad **walks**
   to the road point nearest the new pad, which becomes the new default rally point.
2. **Fight on contact** while marching. The squad blocks and fights anything it bumps into on
   the way, then carries on to the flag. Nothing slips past a moving squad.
3. **Respawn at the rally point**, as today. Balance is unchanged and the sim needs no change.
4. **Route: along the road**, between the two path progresses, not in a straight line.
5. **Flag placement: a road point within the barracks' range.** Outside the range, the tap is
   refused with a toast.
6. **Look: mockup B, "Range ring + ghost flag".** In rally mode the barracks' range circle
   shows. A ghost flag follows the pointer, snapped to the road, and turns red outside the
   range. On a tap, a dotted route along the road from the squad to the flag shows while the
   squad marches. The squad walks as a **cluster**: one ahead, two flanking. The planted flag
   fades about 0.9 s after they arrive.
7. **An order disengages** (builder-check round). If the squad is already fighting when a
   flag is planted or the barracks is Moved, the order wins: they walk away from the fight,
   releasing what they held, and only stop for enemies they meet further along the road (see
   C15).
8. **Walk speed 60 px/s for both Rally and Move** (builder-check round). The PR reports the
   per-map worst-case Move walk; the speed stays a one-number tunable.

## Controller's calls (each with its cost if wrong)

- **C1. Item:** id `rally`, `RING_ANGLES.rally = 0` (east, the one free slot), icon `⚑`, label
  `Rally`, variant `primary`, cost `null`, state `ready`, aria `Rally ${def.name} soldiers`.
  Rally mode is a new input mode, cancelled by the Cancel button or Escape like reposition.
  *Cost if wrong:* a slot or glyph change is a one-line data edit. `⚑` (U+2691) isn't in the
  webfonts, so it relies on a system symbol font (see Risks).
- **C2. A miss stays in the mode.** An out-of-range or off-road tap toasts and stays in rally
  mode for an easy retry. Cancel, Escape, or tapping the same barracks again exits. Reposition
  exits silently on a miss today. *Cost if wrong:* a player who expects a miss to cancel has
  to press Cancel once.
- **C3. Road snap:** the candidate is the nearest road point to the pointer
  (`PathManager.getNearestPathProgress`, `src/systems/PathManager.js:35-63`). It counts as on
  the road when within `TAP_PATH_RADIUS` (40, `input.js:23`). The in-range test measures the
  **snapped** point from the barracks centre. *Cost if wrong:* near the ring's edge, a pointer
  inside the ring can snap to a road point just outside it and read red.
- **C4. Touch has no hover.** On touch the ghost sits under the finger during press and drag,
  and the release plants it. On desktop the ghost follows `pointermove`. This follows today's
  tap model: `InputController` resolves on release, and a drag resolves at the release point
  (`InputController.js:7-12`). *Cost if wrong:* none beyond feel.
- **C5. Walk speed** is a tunable in `src/data/` (new `src/data/soldiers.js`), starting at
  **60 px/s** of road arc length. For comparison, enemies move at 50 (drone), 90 (skitter) and
  38 (brute) (`src/data/enemies.js:8-10`), and heroes at 110-150 (`src/data/heroes.js`).
  *Cost if wrong:* a too-slow squad leaves its lane open for long stretches after a Move
  (see Risk R-2).
- **C6. Per-soldier engagement.** A marching soldier with a blockable enemy inside
  `MELEE_RANGE` stops and fights, the others keep going, and it resumes when free. *Spec
  author's note:* the formation is render-only (C7) and every live marching soldier starts on
  the same logical point at the same speed. So the whole live squad always halts together, and
  "the others keep going" can never be seen (see Open question 2). The per-soldier code is
  still the simplest to write, and it stays correct if offsets ever become logical.
- **C7. The cluster formation is a render-only offset** around the logical road point, and it
  holds at rest too. The logical x/y used by blocking, the repair heal (`GameScene.js:1111-1119`)
  and muzzle flashes stays on the road, so blocking geometry and the sim's queued-replacement
  model (`simulate.js:96-98`) don't change. *Cost if wrong:* the drawn and logical positions
  differ by up to about one formation spacing (≤ 12 px).
- **C8.** A soldier that dies mid-march respawns at the new rally point.
- **C9. (revised after the builder check)** Re-rallying mid-march retargets from the current
  position. **Upgrading mid-march keeps the march visible:** `_rebuildSoldiers` rebuilds soldier
  *i* at old soldier *i*'s current `pathProgress` if it was alive, else at the target
  (`soldierPathProgress`), and the rebuilt squad keeps walking. A spawn-progress list (or
  per-index override) is passed into `spawnSoldiers`; with none given it spawns at
  `soldierPathProgress` exactly as today. *Cost if wrong:* a few lines in `Barracks`; the
  old behaviour (snap to the flag) is what the original ask ("visibly walk") ruled out.
- **C15. Disengage window (implements Decision 7).** When an order (Rally or Move) is given,
  every live soldier that is **engaged** — some live enemy it could block is within
  `MELEE_RANGE` of it — gets `disengageLeftPx = SOLDIER_MARCH.disengagePx` (default 60 =
  2 × `MELEE_RANGE`). While `disengageLeftPx > 0` the soldier **neither halts nor blocks**:
  `soldierCanBlock` returns false for it, so `findBlockingSoldier` skips it and the held enemy
  walks on; the march's contact test skips it too. Each frame it subtracts the arc distance it
  actually walked; at ≤ 0 it is a normal marching soldier again and stops for whatever it
  meets further on. A soldier that was **not** engaged at order time gets no window, so a
  fresh march still stops for the first enemy it touches (Decision 2). The sim never sets the
  field, so `soldierCanBlock` is unchanged for every sim soldier (R18). A soldier that dies
  clears its window; respawned soldiers have none. *Cost if wrong:* a fast enemy (skitter 90
  > 60 px/s) chasing the squad can be picked up again once the window ends — that is "fights
  what it meets on the way", accepted.
- **C10. Rally while paused.** The brief said the mode "works on a paused board", and **the code
  contradicts that**: canvas taps are dropped while paused. The call is reinterpreted (S5) as:
  the mode can be entered from a ring left open under a user pause, but no flag can be planted
  until resume. The march then runs in game time, so 2x speeds it up and pause and hit-stop
  freeze it.
- **C11. Deferred asset.** A soldier `move` state falls back to `idle`, plus a walk bob while
  moving. The sprite flips to face the direction of travel (`EntitySprite.setFacing`, `:162-166`,
  deadzoned with `facingDirX`, `src/systems/facing.js:17`). **Corrected mechanism (the code
  contradicts the brief):** don't add a manifest `move` entry until the PNG exists. BootScene
  loads every manifest state (`src/scenes/BootScene.js:79-88`), so a missing file logs
  `Failed to load resource`, and `watchProblems` (`capture.mjs:208-218`) counts that as a
  problem. The fallback is already free: `setState('move')` does nothing while `move` is
  unregistered. Adding the art later means one PNG plus one manifest entry, the documented
  path (`sprites.js:10-12`).
- **C12. Sim: no change.** See R18 for the proof. The brief cited "the existing golden/parity
  fixture" as proof, but that fixture (`src/sim/__fixtures__/legacyGolden.json`, used by
  `src/sim/waveTiming.test.js`) pins only the legacy `'onClear'` mode, not the shipped
  `'countdown'` mode. R18 adds the missing half.
- **C13. Reduced motion** (`registry.get('ambientMotion') === false`): no bob, and the planted
  flag disappears on arrival with no fade. The route has no animation to begin with.
- **C14.** All new logic is pure and lives in modules under `src/systems/` with Vitest tests:
  road-walk stepping, rally target snap and validation, formation offsets, the halt on contact,
  and route sampling. Phaser objects only render it.

## Spec-author calls (made here so the plan needs no further questions; vetoable)

- **S1. The ghost starts on the squad's current rally point** when the mode opens, and follows
  the pointer from its first in-map move or press. `_buildCursorX/Y` holds whatever the last
  canvas pointer event left, which on desktop is near the barracks and on touch is the
  barracks tap.
- **S2. Off the road**, the ghost draws un-snapped at the pointer in the invalid colour, the
  way the armed-build ring draws red at the cursor with no pad (`GameScene.js:2156-2168`). A
  tap there toasts `Rally on the road` and stays in the mode.
- **S3. A Move shows the same march visuals as a Rally**: the dotted route, then a planted flag
  at the new default point that fades on arrival. The march is the same, so it should read the
  same.
- **S4. At rest, the formation's lead and the sprites face upstream**, toward lower progress,
  where enemies come from. While marching they face the direction of travel. *Cost if wrong:*
  purely visual. Every idle barracks now shows three spread soldiers facing the road's inbound
  direction, where it used to show one stacked figure facing right.
- **S5. The rally overlay** (range ring + ghost) draws on its own Graphics layer. It is redrawn
  every `update()` **and** on mode enter and exit, so entering or cancelling while paused
  still shows correctly. Pointer moves can't arrive while paused, so nothing else needs
  redrawing then.
- **S6. No matrix step.** The matrix is a scripted first run of map 0 (`src/systems/deviceFlow.js:15-34`).
  Its gold (130 start, 60 archer + 50 upgrade) can't buy a 100 g barracks. Real-input coverage
  comes from a new `--screens` run, `rally`, on all five devices (R20). The matrix must still
  pass unchanged.
- **S7. One shared eligibility predicate.** `soldierCanBlock(soldier, enemy)` is extracted in
  `soldierCombat.js`, covering not dead, not in a C15 disengage window, and the flyer rule.
  `findBlockingSoldier` and the march's halt test both use it. For any soldier without
  `disengageLeftPx > 0` (every sim soldier) its behaviour is identical, proven by R18.
- **S8. The march is sub-stepped** (`substepPx ≤ MELEE_RANGE / 2`), and the contact test runs at
  the soldier's start position before it moves. Then a 0.4 s frame can't carry a soldier
  through an enemy (E13).
- **S9. `Barracks.repositionSoldiers` is repurposed as `setRallyPoint(progress)`.** It sets
  `soldierPathProgress` and the flag record, with no teleport. It has no caller today, and
  this feature is exactly its job. `Soldier.setPathProgress` stays, used by the constructor
  and by respawn.
- **S10. No separate march state machine.** The target is `barracks.soldierPathProgress`. A
  soldier is *marching* when it is alive and its `pathProgress !== target`. Route, flag and
  arrival are all derived each frame from barracks state, so a sold barracks leaves nothing
  behind.
- **S11. "Arrived" means every live soldier is at the target.** Dead soldiers don't hold the
  flag up (they respawn at it). The flag's fade clock starts on the first arrived frame.

## Goals (testable requirements)

**Radial and mode**
- R1. `ringItems` (`radialItems.js:67-93`) adds the `rally` item for barracks only, using
  `RING_ANGLES.rally = 0` (`src/data/radial.js:20`). It is pushed after the upgrade/branch items
  and before `sell`, which keeps DOM and Tab order clockwise from the west (`:66`). Other towers
  get no `rally` item. A barracks ring has at most 5 items, and the radial has 6 item buttons
  (`index.html:1275-1280`).
- R2. `_onRadialActivate` (`GameScene.js:1655-1667`) routes `rally` to `_startRally()`. That
  closes the ring, sets `rallyMode = true` and `rallyBarracks`, syncs Cancel, and toasts
  `Tap the road inside the ring to rally the squad`. `rally` isn't in the touch two-tap
  `CONFIRMABLE` set (`src/ui/RadialMenu.js:15`), so one tap activates it. `_fillRingPeek`
  (`:1743-1779`) gains a `rally` case: header `Rally`, line `Then tap the road inside the
  ring to send the squad there.`
- R3. `_modeState()` (`:1383-1391`) gains `rallying: !!(this.rallyMode && this.rallyBarracks)`.
  `resolveTap` (`src/systems/tapResolve.js:20-37`) returns `{ type: 'rally' }` after
  `reposition` and before the radial step, so the order is aim → reposition → rally → radial →
  …. `hasMode` (`:56-58`) counts `rallying`. Cancel visibility, Escape (`_onUiCancel`,
  `:1481-1483`) and shutdown's cancel (`:624`) then cover rally with no further wiring.
  `_cancelMode` (`:1466-1477`) clears `rallyMode` and `rallyBarracks` and redraws the overlay.
- R4. `_rallyTo(mx, my)` handles the `rally` action in `_runTapAction`:
  - a tap within `TAP_TOWER_RADIUS` of the rally barracks → exit the mode (no toast);
  - otherwise `resolveRallyTarget(...)`:
    - not on the road → toast `Rally on the road`, stay in the mode;
    - on the road but out of range → toast `Too far — rally inside the ring`, stay in the mode;
    - valid → `barracks.setRallyPoint(progress)`, then exit the mode.
  - If the rally barracks is no longer in `placementManager.getTowers()`, the mode is cancelled.
- R5. `_repositionTo` (`:1435-1451`): after a successful move it calls
  `barracks.setRallyPoint(pathMgr.getNearestPathProgress(slot.x, slot.y))`. That default point
  is not range-checked, the same as on placement (`:1459`). A miss behaves exactly as today.

**Validation and snap, pure: `src/systems/rallyTarget.js` (new)**
- R6. `resolveRallyTarget({ x, y, pathMgr, centre: {x, y}, range, tapRadius })` returns
  `{ progress, point, onRoad, inRange, valid }`. `point = pointAtProgress(path, progress)`.
  `onRoad = dist(pointer, point) < tapRadius`, which agrees with `isOnPath`'s `<` (`PathManager.js:26`).
  `inRange = dist(point, centre) <= range`. `valid = onRoad && inRange`. `range` is
  `barracks.range`, which includes the meta `towerRangeMult` (`src/entities/Tower.js:19`), not
  the bare 130.

**March, pure: `src/systems/soldierMarch.js` (new)**
- R7. `marchStep({ progress, target, dt, speed, totalLength, substepPx, path, blocked })` returns
  `{ progress, arrived, halted }`, where `blocked(point) → boolean`:
  - It tests `blocked(pointAtProgress(path, progress))` **first**. If true, it doesn't move and
    returns `halted: true`. (A soldier inside its C15 disengage window passes a `blocked` that
    always returns false, so it walks out of the fight.)
  - It also returns `walkedPx`, the arc distance actually moved, so the caller can run down
    `disengageLeftPx` (C15).
  - Otherwise it advances toward `target` by up to `speed·dt` px of arc. The step is cut into
    sub-steps of ≤ `substepPx`, and it stops at the first sub-step point where `blocked` is
    true.
  - It never overshoots: it lands exactly on `target` and returns `arrived: true`.
  - `dt ≤ 0`, `progress === target` or `totalLength ≤ 0` are no-ops, with
    `arrived = (progress === target)`.
  - Progress is clamped to [0, 1].
- R8. `blocked` is "some live enemy `e` with `soldierCanBlock(soldier, e)` and
  `dist(point, e) < MELEE_RANGE`". **It skips `e.dead`**: corpses stay in `this.enemies` until
  the next sweep (`GameScene.js:874-878`, `:913-914`).
- R9. Soldiers march in `_updateSoldiers(dt)` (`:969-974`), which gains `this.enemies`. That runs
  after `_updateEnemies`, so the halt test sees this frame's enemy positions, and the block that
  follows lands on the next frame's `_updateEnemies` (the existing order, unchanged). Dead
  soldiers don't march.
- R10. Respawn: `Soldier.respawn()` (`Soldier.js:80-87`) first calls
  `setPathProgress(this.barracks.soldierPathProgress, path)`, so a soldier comes back at the
  current rally point (Decision 3, C8). At rest that is the same point as today.

**Formation, render only: `src/systems/soldierFormation.js` (new)**
- R11. `formationOffsets(count, dir, spacing)` returns `count` offsets `{dx, dy}`. Index 0 is
  `spacing` **ahead** along `dir`. Indices 1 and 2 flank it, `spacing` to each side along the
  normal and slightly behind. Any further index (tier 4B has 4, `src/data/towers.js:72`) fills
  in behind on alternating sides. The result is deterministic, with no randomness. For `dir` it
  uses the travel tangent while marching and the upstream tangent at rest (S4), with a zero
  vector falling back to `{x: -1, y: 0}`.
- R12. The offset (plus bob, R14) moves **only the drawn children**: sprite, shadow, Graphics
  body and HP bar. The container's x/y stays the logical road point. Spacing is sized from
  `EntitySprite.getDisplaySize()` when the art is active (memory: radius is not sprite size),
  else from the data fallback.
- R13. The muzzle flash (`GameScene.js:866`) spawns at the drawn position (logical + offset),
  so the flash lands on the soldier the player sees. It is a render-only change.

**Animation**
- R14. While marching: `setState('move')` every frame. That re-asserts it after an attack
  one-shot reverts to `idle`, as `Hero.update` does at `:269`. Also: `setFacing(facingDirX(travel dx))`,
  plus a vertical bob of `WALK_BOB.amplitudePx` at `WALK_BOB.hz`, which stays at 0 under
  reduced motion. On arrival or a halt: `setState('idle')` and bob 0. No manifest `move` entry
  is added (C11). The `sprites.js:247-248` comment is updated to say a `move` state is wired
  and falls back to `idle`.

**Visuals (mockup B)**
- R15. The rally overlay (S5) is the barracks range circle (`barracks.range`) plus the ghost
  flag at `resolveRallyTarget(cursor).point`. It is drawn in the OK colour when `valid`, the
  invalid colour when on the road but out of range, and un-snapped at the cursor in the invalid
  colour when off the road (S2).
- R16. While any soldier of a barracks is marching, a dotted route runs along the road from the
  squad's current progress to the target (`routeDots(path, from, to, spacingPx)`, pure, in
  `soldierMarch.js`), with the flag planted at the target. After arrival (S11) the flag fades
  over `RALLY_FLAG.fadeMs` (900) and is then gone. Under reduced motion it is removed on
  arrival. Route and flag draw on a layer above the pads and below the unit band (pad glow is
  10.5, `src/data/juice.js:80`; units are 11-15.9, `src/data/grounding.js:28`), so soldiers walk
  over the route.
- R17. Every colour, size and alpha comes from `src/data/soldiers.js`, derived from `PALETTE`
  (`src/data/theme.js:4-17`): OK = `accent`, invalid = `danger`. No hex literal appears in scene
  code for this feature.

**Balance**
- R18. The sim stays unchanged, and that is proven: no diff under `src/sim/`. The legacy golden
  (`waveTiming.test.js`, 50 keys) stays green. `npm run balance` output is byte-identical
  before and after; capture it at b0adeed first and record both SHA-256s in the PR.
  `soldierCanBlock` (S7) is the only change to a module the sim imports.

**Tunables**
- R19. New `src/data/soldiers.js`:
  ```js
  export const SOLDIER_MARCH     = Object.freeze({ speed: 60, substepPx: 15, disengagePx: 60 }); // px/s of road; substep ≤ MELEE_RANGE/2; disengage = 2×MELEE_RANGE (C15)
  export const SOLDIER_FORMATION = Object.freeze({ spacingFrac: 0.55, fallbackSpacingPx: 9, flankBackFrac: 0.4 });
  export const WALK_BOB          = Object.freeze({ amplitudePx: 1.5, hz: 4 });
  export const RALLY_FLAG        = Object.freeze({ fadeMs: 900, ghostAlpha: 0.6, routeDotSpacingPx: 10, routeDotRadius: 2,
                                                   poleHeight: 18, pennant: { w: 10, h: 7 }, depth: 10.6, ok: /* accent */, bad: /* danger */ });
  ```
  A data test asserts `substepPx ≤ MELEE_RANGE / 2`, `speed > 0` and `fadeMs ≥ 0`. `RING_ANGLES.rally = 0`
  goes in `src/data/radial.js`.

**Harness**
- R20. A new `--screens` run, `rally` (all five devices), on a quiet board: map 0, a
  `build=barracks@N:1` chosen so its range covers road on both sides, and **no `wave` param**,
  so no enemy can make the march nondeterministic (`debugCapture.js:35`). It uses real input
  (`tap`, `tapGamePoint`, and `pressPoint` for a touch hold, `capture.mjs:251-295`). Road points
  are computed in Node from `MAPS` with `PathManager`, which is pure.
  - (a) Tap the barracks, then tap `.radial-item[data-id="rally"]`. Assert `#cancel-btn` is
    visible. Run `radialAudit` on the 5-item ring first (`capture.mjs:461-483`).
  - (b) Move or hold the pointer on an in-range road point. Shoot `rally-ghost.png`.
  - (c) Move or hold on a road point **outside** the range. Shoot `rally-ghost-out.png`.
    Release, then assert the toast text and that `#cancel-btn` is still visible (C2).
  - (d) Tap an in-range road point far from the current point. Wait, in game time
    (`untilGameTime`, `:1355-1393`), for `__capture.rally[i].marching === true`. Shoot
    `rally-march.png`.
  - (e) Wait for `marching === false`. Assert every soldier's `progress` equals the target.
    Assert `#cancel-btn` is hidden.
  - `window.__capture` gains `rally: [{ target, marching, soldiers: [{ progress, dead }] }]`,
    updated in the debug block (`GameScene.js:696-700`).
  - **Prove it fails:** with `setRallyPoint` stubbed to teleport (call `setPathProgress` on every
    soldier), (d) must fail. With the mode left armed after a valid tap, (e) must fail on
    `#cancel-btn`.
- R21. Captures are committed as JPEG q90 under `docs/captures/48-rally-flag/`.

## Non-goals

- No change to what the **Move** item does, beyond the squad walking (R5). Its pre-existing
  reposition-mode drawing (`GameScene.js:2171-2181`) is left alone, even though it shows the
  range ring and road dots from the old rally UI (see Open question 5).
- No soldier-vs-soldier collision, no per-soldier rally points, and no logical formation.
- No new SFX. No move art: the walk sheet is a separate art task.
- No sim change. The modelled player never rallies (`simulate.js:27-30`).
- No fix for the existing barracks **Reinforce** ability, which is data only and has no
  implementation (`towers.js:78`, grep). Whenever it lands, the formation is generic in `count`
  (R11).
- No change to aim, armed-build or reposition coexistence. Rally mirrors reposition: aim
  beats it, and it beats an armed build (`tapResolve.js:21-26`).

## Anti-goals (must not happen)

- **Balance drift**: any change to who blocks, when, or where a soldier stands at rest (R18,
  C7).
- **A squad tunnelling through an enemy** on a long frame (S8, E13). The one deliberate
  exception is the C15 disengage window right after an order (Decision 7).
- **Boot 404s**: a manifest entry for art that doesn't exist (C11).
- **Leaks across levels**: rally state or visuals that outlive the scene. `this.events` survives
  shutdown (memory: scene listener leak). This feature adds **no** event listeners. If the
  builder adds one, it is wired and unwired as a pair.

## Edge cases

| # | Case | Required behaviour | Test |
|---|---|---|---|
| E1 | Tap exactly `range` px from the centre (snapped) | valid (`<=`) | pure |
| E2 | Snapped point `range + 0.01` | out of range: toast, stay | pure + scene |
| E3 | Pointer exactly `tapRadius` from the road | off road (`<`, matches `isOnPath`) | pure |
| E4 | Rally on the current target | no march; flag plants and fades after `fadeMs` | pure + scene |
| E5 | Target within one frame's step | arrives in one frame, no overshoot | pure |
| E6 | Target behind the squad (lower progress) | walks back; facing flips (deadzoned) | pure + scene |
| E7 | Target at progress 0 or 1 (path ends) | allowed if in range; clamped | pure |
| E8 | Re-rally mid-march | retargets from the current progress; route and flag move | scene |
| E9 | Move mid-march | target becomes the new pad's nearest point; walks from current | scene |
| E10 | Upgrade mid-march | see E14e (C9 revised): no snap to the flag | scene |
| E11 | Sell mid-march | soldiers destroyed; no route or flag drawn next frame (S10) | scene |
| E12 | Soldier dies mid-march | respawns at the target after `respawnDuration` (R10) | scene |
| E13 | 0.4 s frame (200 ms cap × 2x) heading into an enemy | halts at the first sub-step inside `MELEE_RANGE`; never ends past it | pure |
| E14 | Enemy already within `MELEE_RANGE` at march start, soldier **not** in a disengage window | no movement this frame (start test first) | pure |
| E14b | Squad engaged when the order is given (Decision 7) | soldiers get the C15 window: they walk off, the held enemy is released on the next `_updateEnemies`, no halt until `disengagePx` walked | pure + scene |
| E14c | Window ends with an enemy in contact (chaser) | halts and blocks again | pure |
| E14d | Soldier not engaged at order time | no window; halts on first contact | pure |
| E14e | Upgrade mid-march (C9) | rebuilt live soldiers keep their progress and keep walking; dead ones appear at the target | scene |
| E15 | Flyer, squad without `canBlockFlyers` | no halt, walks on (the flyer passes) | pure |
| E16 | Flyer, tier 4A squad | halts and blocks | pure |
| E17 | Corpse (`dead`) in `enemies` this frame | ignored by the halt | pure |
| E18 | Stunned enemy in contact | halts (eligible); no melee until the stun ends (`GameScene.js:858`) | note |
| E19 | Enemy held by another squad or the hero near the route | halts beside it, no trade until it dies | note |
| E20 | Whole squad dead when the flag is planted | target set; "arrived" holds at once (S11); respawns at the flag | scene |
| E21 | 2x speed | march distance per real second doubles | scene |
| E22 | Hit-stop / pause / game over | `update` returns before `_updateSoldiers` (`:704-713`); march frozen | scene |
| E23 | Entering rally from a ring left open under a user pause | overlay drawn on entry (S5); taps dropped until resume (C10); Cancel works while paused | scene |
| E24 | Escape / Cancel / tap on the same barracks | mode exits, overlay cleared, no toast | scene |
| E25 | Tap on another tower in rally mode | treated as a rally tap (off-road toast unless near the road); mode stays | scene |
| E26 | Touch long-press on an enemy in rally mode | peek, release swallowed, mode stays (`InputController.js:13-22`) | note |
| E27 | Touch drag from the barracks onto the road | resolves at release, plants if valid | capture |
| E28 | Pointer over a rail (`pointer.camera` unset) | cursor not updated; ghost stays at the last in-map point (`InputController.js:24-30`) | note |
| E29 | Level ends in rally mode | Cancel hidden (`_syncCancelButton`, `:1494`); shutdown cancels the mode (`:624`) | scene |
| E30 | RETRY / leave mid-march | fresh scene, fresh squads; nothing carried | liveScene |
| E31 | Debug-built barracks | no march at load (`applyDebugCapture`, `:113-117`, sets the target = position) | scene |
| E32 | `count` 1, 3 and 4 formations | distinct offsets, index 0 ahead, deterministic | pure |
| E33 | Zero-length tangent (duplicate path points) | formation `dir` falls back to `{-1, 0}`, no NaN | pure |
| E34 | Reduced motion toggled mid-march | read live each frame; bob 0 next frame; flag removed on arrival | scene |
| E35 | Default point after a Move is outside the new range | used anyway, the same rule as placement (R5) | note |
| E36 | Rally barracks missing from towers (defensive) | mode cancelled on the next rally tap | scene |

## Design

### Pure modules

```js
// src/systems/rallyTarget.js
export function resolveRallyTarget({ x, y, pathMgr, centre, range, tapRadius })
  // -> { progress, point, onRoad, inRange, valid }

// src/systems/soldierMarch.js
export function marchStep({ progress, target, dt, speed, totalLength, substepPx, path, blocked })
  // -> { progress, arrived, halted }
export function isMarching(soldier, target)            // !soldier.dead && soldier.pathProgress !== target
export function contactTest(soldier, enemies)          // point => any live e: soldierCanBlock && dist < MELEE_RANGE
export function routeDots(path, from, to, spacingPx)   // points along the road, from -> to
export function travelDir(path, progress, target)      // unit tangent toward target (upstream when equal)

// src/systems/soldierFormation.js
export function formationOffsets(count, dir, spacing)  // -> [{dx, dy}]

// src/systems/soldierCombat.js (S7)
export function soldierCanBlock(soldier, enemy)        // !soldier.dead && !(soldier.disengageLeftPx > 0) && (!enemy.def.flying || soldier.canBlockFlyers)
```

Road-walk stepping happens in progress space, as the hero does (`Hero.js:258-268`), because
`pointAtProgress` is parameterised by arc length (`src/systems/pathGeometry.js:121-145`).
`totalLength = pathLength(path)` is computed once per barracks or soldier, not per frame.

### Entities

- `Barracks` (`src/entities/Barracks.js`): `setRallyPoint(progress)` replaces
  `repositionSoldiers` (S9). It sets `soldierPathProgress` and `rallyFlag = { progress,
  arrivedMs: null }`. It keeps `pathPoints` and `totalLength` from `spawnSoldiers`.
- `Soldier` (`src/entities/Soldier.js`): stores `pathPoints` and `totalLength`. `update(dt,
  enemies)` ticks combat timers as today, then, if marching, runs `marchStep` and
  `setPathProgress`, then applies the render offset and bob and sets the animation state
  (R14). `respawn()` re-plants at the rally point (R10). Drawn children get the offset, e.g.
  through an inner container passed to `EntitySprite`, which accepts any container
  (`EntitySprite.js:31`, `:57`, `:67`). The HP bar keeps sizing from `getDisplaySize()`.
  Tests that import it need the Phaser `vi.mock` (memory: jsdom + Phaser mock).

### GameScene (`src/scenes/GameScene.js`)

- `create()` (`:268-270` area): `this.rallyMode = false; this.rallyBarracks = null;` and the
  overlay and route Graphics layers (`depth` from data). Teardown destroys them in `shutdown()`
  next to `_previewGfx` (`:644`).
- `_startRally()`, `_rallyTo(mx, my)`, `_drawRallyOverlay()` (S5), and `_drawRallyRoutes()`,
  which runs per frame from the `update()` draw block (`:739-744`).
- `_modeState`, `_runTapAction`, `_cancelMode`, `_onRadialActivate`, `_fillRingPeek`,
  `_repositionTo` and `_updateSoldiers` change as in R2-R5 and R9. The debug block (`:696-700`)
  writes `__capture.rally`.
- HUD DOM: no new DOM. Cancel stays owned by GameScene (`_bindCancelButton`, `:1485-1487`;
  memory: HUD DOM ownership). The ring is the existing `RadialMenu`.

### Tradeoffs considered

- **A squad-level march, one state per barracks, vs per-soldier.** Squad-level is slightly
  less code, but it would need special cases for respawned and dead members. Per-soldier
  (`pathProgress` against a shared target) handles them with no special cases. Chosen:
  per-soldier (C6, S10).
- **Logical formation offsets vs render-only.** Logical offsets would make "one peels off to
  fight" visible, but they change who blocks first and the sim's queued-replacement model.
  Chosen: render-only (C7, the controller's call).
- **Straight-line walk vs along the road.** Straight is shorter but crosses terrain. The user
  chose the road (Decision 4).
- **Sub-stepping vs swept-segment maths.** Sub-steps reuse `pointAtProgress` and the shared
  predicate, so there's no new geometry to get wrong (S8).

## Files that change

| File | Change |
|---|---|
| `src/data/soldiers.js` (+ test) | new: march, formation, bob, flag tunables |
| `src/data/radial.js` | `RING_ANGLES.rally = 0` |
| `src/data/sprites.js` | comment only (`:247-248`) |
| `src/systems/rallyTarget.js` (+ test) | new |
| `src/systems/soldierMarch.js` (+ test) | new |
| `src/systems/soldierFormation.js` (+ test) | new |
| `src/systems/soldierCombat.js` (+ test) | `soldierCanBlock`, used by `findBlockingSoldier` |
| `src/systems/radialItems.js` (+ test) | `rally` item |
| `src/systems/radialLayout.test.js` | barracks ring configs with `rally` (no overlap, both cells) |
| `src/systems/tapResolve.js` (+ test) | `rallying` state, `rally` action, `hasMode` |
| `src/entities/Barracks.js`, `src/entities/Soldier.js` (+ tests) | S9, R10-R14 |
| `src/scenes/GameScene.js` (+ `inputModes`, `radial` and frame tests) | R2-R5, R9, R13, R15-R16, harness hook |
| `scripts/capture.mjs` | `captureRally` run, wired into the per-device runs (`:593-605`) |
| `docs/captures/48-rally-flag/*.jpg` | captures |

## Test strategy

Every new test is first run against deliberately broken code and must fail for the specific
reason (memory: prove the test fails). The last column is the planned sabotage.

| Test | Asserts | Break it by |
|---|---|---|
| rallyTarget | E1-E3; `range` from the argument, not 130 | `<` for range; `<=` for road |
| marchStep stepping | distance = speed·dt (arc length); E5 no overshoot; E6 reverse; E7 clamp | step in index space; drop the clamp |
| marchStep contact | E13 halts inside range on a 0.4 s step; E14 no move | one full step without sub-steps; test only the end point |
| contactTest | E15-E17 | drop the flyer rule; drop `dead` |
| soldierCanBlock | `findBlockingSoldier` results unchanged (existing tests) + new cases | invert the flyer rule |
| formationOffsets | E32-E33; index 0 ahead of `dir`; flanks symmetric | swap ahead and behind |
| routeDots | first dot at `from`, last at `to`, spacing within ±1 px, reversed when `to < from` | return straight-line points |
| radialItems | barracks has `rally` (slot 0, `⚑`, `Rally`, primary, ready, cost null) in clockwise order; no other tower does | push before upgrade |
| radialLayout | 5-item barracks rings don't overlap at both cells | — |
| tapResolve | `rally` after reposition and before the radial; `hasMode` true for rallying | order swap |
| Soldier | respawn re-plants at the rally point; children offset, container not; `setState('move')` while marching, `idle` at rest; no bob under reduced motion | respawn in place; offset the container |
| GameScene modes | R2-R4 and E24, E25, E29, E36; Cancel shows and hides | exit on a miss |
| GameScene frame (frameScene pattern) | a march halts on contact and the enemy is blocked the next frame (Decision 2); E8-E12, E20-E22 | march before `_updateEnemies`; skip the halt |
| GameScene Move | R5: after a Move the target is the new pad's nearest point and soldiers walk, not teleport | leave `soldierPathProgress` |
| Paused entry | E23: overlay drawn on entry with no `update` call | draw only in `update` |
| sim | golden green; balance output SHA identical (R18) | change `findBlockingSoldier` ordering |
| data | `substepPx ≤ MELEE_RANGE/2` etc. | set `substepPx` 40 |
| capture `rally` | R20 (a)-(e) on 5 devices | R20's prove-it-fails |

Report the full suite count in the PR.

## Gates

`npm test`, `npm run build`, `npm run matrix` (unchanged, still green), and
`npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad` with **zero
problems**. Guards stay green: themeCss, kitRollout, noNativeTitles, railCss, typeFloor,
storyDialogCss, resultsCss. No CSS is expected. Any CSS that is added uses `--ui-*` tokens
and `calc(N * var(--hud-k))`, and the ring item uses the existing kit classes.

## Live verification (before PR)

Run `npm run build && npm run preview`, then use real input at **desktop 1440×900** and on an
**iPhone 14** (memory: verify the production build, not the dev server):
- Rally with the ring and ghost; the ghost turns red outside the ring; a miss stays in the
  mode; Cancel and Escape exit.
- The dotted route draws, the cluster marches along the road and faces its travel direction,
  and the flag fades about 0.9 s after arrival.
- Mid-wave rally into a stream of enemies: the squad stops, blocks, fights, then resumes.
  Nothing walks through.
- Move a barracks: the squad walks to the new pad's road point.
- Upgrade mid-march; a soldier dies mid-march and respawns at the flag; 2x; pause.
- Reduced motion (Ambient motion OFF): no bob, the flag vanishes on arrival.
- Use frozen-frame probes for the formation and flag geometry (memory: frozen-frame browser
  probes). Judge legibility on the dark board (memory: sprite pipeline).

## Left to the builder

- Flag and ghost drawing (pole and pennant shape), exact formation spacing and flank angle,
  bob amplitude, route dot size. Keep values within the R19 ballpark, confirmed in captures on
  desktop and iPhone.
- The inner-container approach versus per-child offsets for R12.
- Final toast and peek copy, within the meaning given in R2 and R4.
- Whether `__capture.rally` carries extra fields.
- Report the per-map **worst-case Move walk time** (longest arc between any pad's default
  point and any other pad's, ÷ speed) in the PR, as input to Open question 1.
- Update the backlog in `.claude/notes.md` after shipping, and log a move-sheet art task.

## Risks

- **R-1. `⚑` glyph coverage.** It isn't in Orbitron or Rajdhani. iOS, macOS and Windows ship it
  in symbol fonts, and Android has it in Noto Sans Symbols 2. `captureNoFonts` and the
  five-device captures will show any tofu. The fallback is a Graphics-free text glyph swap in
  `radialItems.js`.
- **R-2. Long walks after a Move.** A Move can cross the map. Map 0's road runs the full
  1280-px width with switchbacks, so a far-pad Move can mean on the order of 1,000+ px of road,
  roughly 20 s or more at 60 px/s, with the old lane open. That is what Decision 4 costs. The
  speed is a tunable (C5), and the builder reports the worst case.
- **R-3. A visual change at rest (S4, C7).** Every idle squad now draws spread out and facing
  upstream. Existing captures that show barracks will differ. That is expected, not a
  regression.
- **R-4. Snap on a self-approaching road.** Where two road sections pass close together, the
  nearest point can belong to the far section, and the walk along the road is then long
  (C3, Decision 4).

## Resolved questions

1. **Walk speed / long Move walks:** user — 60 px/s for both (Decision 8). The builder reports
   the per-map worst case.
2. **Whole squad halts together** (C6): controller's call — accepted. It is what Decision 2
   ("fights anything it bumps into") looks like with a render-only formation; peeling off
   would need logical offsets and a balance change.
3. **No walk cycle until move art:** controller's call — ship idle + bob; log a soldier move
   sheet as a backlog art task.
4. **S4 at-rest facing upstream:** controller's call — keep; called out in the PR so the user
   can veto at review.
5. **Move mode's stale drawing** (`GameScene.js:2171-2181`): controller's call — follow-up in
   the backlog; this PR doesn't touch it.
