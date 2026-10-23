# Roadmap 3.3: radial build and upgrade menus (design)

**Branch:** `visual/3.3-radial-menus` (off `visual/integration` with 2.1–2.4, #43 and 3.1 merged) · **Date:** 2026-10-23

## Goal
The literal ask (roadmap 3.3): *"Replace the tower panel with a radial picker (cost, affordability, range preview) and an upgrade ring that previews the next tier and both branches. Touch-first."* Today a tower opens `#tower-panel`, a 170-px card that scrolls on phones (#42e). A tap on an empty pad with nothing armed only toasts "Hero can only move along the path".

The user's final decisions, which this spec does not reopen:
1. **Build both ways.** Tapping an empty pad with nothing armed opens a radial of the 6 towers, showing cost, affordability and a range preview. Tapping an item builds there. Arming from the rail and then tapping a pad works exactly as it does today.
2. **Upgrade ring = actions + compact stats.** The ring holds the next tier, or at T3 the two tier-4 branches (shown locked when the map caps the tier), plus Sell and Reposition (barracks only). The hub shows the tier and key stats. All other `#tower-panel` detail moves to **long-press inspect**, and `#tower-panel` is deleted.
3. **Tooltips (#42a).** Native `title=` goes away. Touch gets a long-press peek and desktop keeps hover.

## Decisions (alternatives considered)
| # | Decision | Rejected alternatives and why |
|---|---|---|
| D1 | **DOM radial inside `#hud-layer`** (static `#radial` markup positioned in *game px*). The layer is already FIT-transformed over the canvas by `fitHudLayer`, so a world point is simply `(RAIL_WIDTH + x, y)`. Scaling, resize and orientation come free, with no `worldToPageCss`. The radial uses `.ui-btn` kit states, real focus and `:focus-visible`. | **Phaser radial:** we would re-implement the kit look, focus, keyboard and a11y, and its hits would compete with the `InputController` gesture pipeline. **Body-level DOM in CSS px** (like the inspectors): needs a re-layout on every resize and its own size maths per FIT scale. The HUD comment warns floating *page-coordinate* cards away from the layer; the radial is positioned in game px, the same way the wave preview already is. |
| D2 | **Sizes come from `HUD_CELL`.** Item Ø = `HUD_CELL` (88 coarse / 52 fine), hub Ø = 1.25×, gap = 0.1×, ring radius = (hub+item)/2 + gap = **108 / 64** game px, footprint radius **152 / 90**. Items therefore meet exactly the per-device floor the rail audit already enforces (`minTouchFor`: 40.4 CSS px on the 340-px iPhone, ≥44 on 360-px phones at FIT 0.5). | A fixed CSS-px size breaks "scales with FIT". A bigger radius covers more of a 720-px map: the 304-px footprint is already 42% of its height. |
| D3 | **Edge handling: clamp the centre, keep the ring whole.** The full ring stays at fixed slot angles. If any item or the hub would cross the map rect minus an 8-game-px margin, the centre slides inward (`shifted: true`). The Phaser selection ring stays on the pad or tower, so the anchor still reads. Clamping is always feasible: 2×152+16 = 320 ≤ 720. | **Fan or arc away from the edge:** 6 items in a corner quadrant need R ≈ 3.5×item, roughly 300 px, and slot positions would change with pad position, which kills muscle memory. |
| D4 | **Detail moves to a tower inspector peek.** `InspectController` gains a `tower` kind rendered into a new `#tower-inspector` (`.inspector-panel ui-panel`, peek-only, `pointer-events:none`). It shows matchups, the armour line and soldier stats. It opens on a touch long-press on a tower (canvas) or on the ring hub, on mouse hover of the hub, and on keyboard focus of the hub. It lingers `PEEK_LINGER_MS` after release. | **ⓘ item in the ring:** an extra slot the user did not ask for. **Hover any tower:** adds new desktop hover noise over the whole board. **Pinnable card:** a tap on a tower now opens the ring, so a pin gesture would need a new rule. |
| D5 | **An open radial eats the next canvas tap.** A tap on another tower or free pad *retargets* the radial. A tap on its own pad or tower (the hub) closes it. Any other tap only closes, with no hero move, pin or toast. | **Pass-through (close, then act)**, as the old panel did: the radial sits *on* the field, so a dismiss tap usually lands on path or ground nearby and would move the hero by accident. |

## Interaction and state
At most **one** of {radial open, build armed, aim, reposition} holds at a time. Opening any one of them closes the others. `hasMode()` counts an open radial, so **Esc and ✕ Cancel close it** (✕ is visible while a radial is open).

New `resolveTap` order: aim → reposition → **radial open** (retarget/close) → tower → `openRing` → inspectable → `pin` → armed build → `place` / `cancelBuild` → **free pad → `openBuild`** → dead hero → path → `moveHero` / `offPath`. The `closePanel` flag becomes `closeRadial`.

| Situation | Result |
|---|---|
| Tap free pad, nothing armed | Build radial opens at that pad. The tower button highlight stays off. |
| Tap free pad, tower armed (rail) | Places the armed tower, as today. No radial. |
| Tap a tower | Ring opens and clears any armed build (`clearBuild`), as today. |
| Tap outside while open | D5: retarget to another tower or pad, close on the hub, otherwise close only. |
| Esc / ✕ Cancel | Closes the radial and returns focus to `document.body`. Esc still also dismisses the inspector and peek cards, as today. |
| Arm a rail tower, start aim (W), or start reposition while open | The radial closes first, then the mode starts. |
| Touch long-press on a tower | Tower inspector peek, with the release swallowed (no ring). Applies with the ring open or closed. |
| Touch long-press on a free pad | Not an inspect gesture (2.1 rule). Opens the build radial on release. |
| Touch long-press on a radial item or the hub | Item peek (`#tower-tooltip`) or tower inspector. `attachLongPress` swallows the click, so nothing builds, arms or closes. |
| Touch long-press on rail controls | Pause, Codex and the hero card get `HintPeek`. Tower buttons and Q/W/E keep their existing peeks. |
| Ring Upgrade, Branch A/B or Sell on touch/pen | Two-tap confirm (2.1 semantics via `createConfirmGate`). The first tap adds `.confirming`, the item caption reads "Tap again", and the item peek opens with a bold "Tap again to confirm" line above the item's details. The hub never shows the prompt; on a phone it is too small. The peek drops the prompt at once when the confirm lapses or is spent. Mouse clicks and keyboard (`detail 0`) run at once. The confirm disarms on timeout, on another item, on close, retarget or re-render, and when the item turns unaffordable. |
| Build item, any pointer | One tap builds (decision 1, no confirm). The radial closes and the build pop plays. |
| Gold changes while open | `economy:update` → `_updateHUD` → `radial.refresh()`. Item states re-derive in place. Focus and the confirm stay unless the item itself became unaffordable. |
| Upgrade bought (any input) | The ring re-renders in place, still anchored. Focus stays on the same slot, or moves to branch A at T3→4, or to the hub if the slot is gone. |
| Sold (any input), or the target is no longer in `getTowers()` | Ring closes. |
| Paused (user, auto-pause or hidden tab) | The radial stays open and usable under the dim, matching today's panel. Canvas taps are dropped by Phaser, so no new radial opens. The range preview still updates (D-preview below). |
| Defeat, victory or scene shutdown | Closes in `_onDefeat` and the victory path. `shutdown()` calls `radial.destroy()`, which removes every listener as a pair, clears timers, resets item classes and `hidden`, and hides both peeks. No radial opens while `over`/`won`. |
| Opening release | An item is activated only by a `pointerdown` *inside* `#radial` after it opened, or by keyboard. This stops the release (or compat click) that opened the radial from firing whatever item now sits under the finger. |

**Keyboard:** while focus is in `#radial`, ←/↑ and →/↓ move counter-clockwise and clockwise through the items, then the hub. Tab and Shift+Tab follow the same order because DOM order is slot order. Enter activates and Esc closes. Unaffordable or locked items stay **focusable**: they use `aria-disabled="true"` + `.is-disabled`, never `disabled`, because disabled controls get no pointer events (memory) and could not be peeked. Activating one does nothing beyond a "Not enough gold!" toast, or the lock text for a locked item. Space still pauses because UIScene's `preventDefault` stops it activating the button. Q/W/E still work.

**Range preview (D-preview):** a dedicated `this._previewGfx` (depth 31) is redrawn **on change**, not in `update()`, so it works while paused.
- **Build item:** hover, focus or press draws `previewRange(def.range, _towerRangeMult)` at the pad, gold when affordable and the existing invalid red (`0x884444`) when not.
- **Ring:** opening calls `tower.showRange()`. Hover, focus or press on Upgrade or a branch also draws the resulting range when it differs (`tierDef.range` × `_rangeMult`).
- Preview is cleared on leave, blur, release and close.

## Items per ring
Order is clockwise, 0° = east, in screen coordinates. Angles live in `src/data/radial.js`.

- **Build radial:** 6 items in `Object.keys(TOWER_DEFS)` order, derived rather than hard-coded, starting at -90° every 60°.
  - Item content: icon + `${cost}g`, plus `aria-label` "Build Archer, 60 gold". `.ui-btn--currency` when ready, `+ .is-disabled` when `gold < cost`.
  - The hub (neutral `.ui-btn`) always reads "Build". "Name + range" on preview was measured at 10.3–10.9 CSS px on iPhone 14 (below the 11-px floor), so the item peek carries the name instead. A hub tap closes the radial.
- **Upgrade ring:** slots are `upgrade` -90°, `branchA` -120°, `branchB` -60°, `reposition` 180°, `sell` 90°. Pairwise no-overlap at both cell sizes is enforced by test (60° ⇒ chord 108 ≥ 97).

Every ring face is a short **glyph over a caption**, the same pattern as build items (icon + cost). Tier and branch names were unreadable at the size that fits a round face on a phone (about 6.7 CSS px on iPhone 14), so the name lives in the **item peek** (CSS px, not scaled by the HUD FIT) and in `aria-label`.

| Tower state | Face: glyph / caption (variant · state) |
|---|---|
| level < 3, next ≤ `maxTierAllowed` | `upgrade` "⬆" / "{cost}g" · currency · ready / is-disabled |
| level < 4, next > `maxTierAllowed` | `upgrade` or both branches: "🔒" / "Map N" · currency · **locked**. N = `unlockMapNumber(tier)`, derived from `MAPS` (replaces the literal 3/5). |
| level 3, no branch, tier 4 allowed | `branchA`, `branchB`: "A" / "{cost}g" and "B" / "{cost}g" · currency · ready / is-disabled. **Barracks included (#44).** |
| level 4 | `upgrade` "MAX" · `.maxed` |
| always | `sell` "💰" / "+{refund}g" · danger. `refund = sellRefund(totalCost)` is shared with `sellTower`. |
| barracks | `reposition` "↻" / "Move" · primary. It closes the ring and enters today's reposition mode. |

Upgrade and branch items carry `name` (the tier label), which the peek header uses.

**Face size:** item text is 24 game px (glyph and caption alike). RadialMenu fits every line inside the circle (`circleFitScale`, inset 0.9) after the radial is shown. On iPhone 14 landscape no face renders below 11 CSS px. This is measured on the production build; see the task-4 report.

**Hub (ring):** always the tower's own lines, fitted to the hub circle and never replaced by item text. Line 1 is the tier (`T2` or branch label). Lines 2–3 are damage and range for firing towers, or soldier count×HP and damage for barracks.

**Item peek** (`#tower-tooltip`, 11 CSS px text, clamped to the map rect beside the radial footprint). It opens on mouse hover, keyboard focus, and a **touch press**: it shows on `pointerdown` and lingers `PEEK_LINGER_MS` after release. A touch press does not block the click, so a build item still builds and a confirmable item still arms (and re-shows the peek with the prompt). A long-press peeks with the click swallowed, as before.
- Upgrade: name, cost and the stats it changes, e.g. "DMG 15 → 25 · RNG 120 → 135". Unchanged stats are omitted.
- Branch: label, `passiveEffect`, matchup headline, armour rows using the tower's `_damageMult`, and the lock reason.
- Sell: refund. Reposition: one line. Build item: today's name/cost/effective/weak text.

## Tooltips (#42a)
- Remove `title=` from Q/W/E (`AbilityTooltip` already covers hover, focus and long-press), `#pause-btn`, `#open-codex`, the branch Choose button (gone with the panel), `#hero-section` (`UIScene._renderHeroXp` stores its memoised string instead), the map-select meta-bar buttons (their visible labels already say it), and `upgradeNode.js` locked-hero. The locked-hero reason becomes a visible `.upgrade-node-gate` line.
- New `src/ui/HintPeek.js` exports `attachHint(anchor, getText) → detach`. It owns a single `#hint-peek` (`.ui-panel`) and supports mouse hover, keyboard focus (`isKeyboardFocus`), long-press with the click swallowed, linger and Esc. It is placed with `railAnchorRect` + `placeRightOf`/`placeLeftOf` according to the anchor's rail. Static strings live in `src/data/hints.js`.
- GameScene attaches pause and codex. UIScene attaches `#hero-section`, which gains `tabindex="0"`. Each owner detaches in its own shutdown.
- Restyling the meta-bar with the kit (#41f) is left to 3.4, which owns map-select.

## Files
**New (pure, Vitest):**
- `src/data/radial.js`: scales, margin, angles.
- `src/systems/radialLayout.js`: `radialMetrics(hudCell)`, `layoutRadial({anchor, angles, metrics, bounds, margin}) → {centre, items, shifted}`.
- `src/systems/radialItems.js`: `buildItems({towerDefs, gold})`, `ringItems({tower, towerDefs, map, maps, gold})`, `ringHub(tower)`, `unlockMapNumber(tier, maps)`, `previewRadius(item, ctx)`.
- `src/systems/towerDetail.js`: `describeTowerDetail(tower)`, `describeBranchPreview({towerType, branch, damageMult, locked})`. This absorbs `headlineOverride` and the armour-row logic now in GameScene.
- `placeBeside(rect, size, bounds, gap, margin)` in `viewport.js`.

**New (DOM):**
- `src/ui/RadialMenu.js`: presenter over static markup with `open/refresh/close/destroy`. It owns the confirm gate, keyboard navigation, delegated listeners on `#radial` (wired and unwired as a pair), and long-press detachers. Callbacks are `onActivate`, `onPreview` and `onPeek`.
- `src/ui/HintPeek.js`.
- `src/ui/armourRows.js`: `appendArmourRows`, moved out of GameScene.

**Changed:**
- `tapResolve.js`: precedence + `state.radial`.
- `InputController.js`: the long-press target falls back to a tower via `inspector.longPressTargetAt`. `inspectableAt` stays enemy/hero and side-effect-free.
- `InspectController.js`: tower kind, `peekTower(tower, anchorRect)`; `hidePeek` hides it too.
- `GameScene.js`: radial wiring, `_placeAt(slot, type)`, `_previewGfx`, closing on modes and level end.
- `TowerPlacementManager.js`: `sellRefund`. `SELL_REFUND_RATIO = 0.6` moves to `src/data/towers.js`.
- `UIScene.js`, `upgradeNode.js`, `layoutAudit.js` (`radialProblems`), `deviceFlow.js`, `scripts/capture.mjs`.

**`index.html`:**
- Add `#radial` (hub + 6 `.radial-item` buttons, `hidden`), `#tower-inspector`, `#hint-peek`.
- Radial rules are geometry only:
  - Lengths are `calc(Npx * var(--hud-k))` or `var(--hud-cell)`-based. JS publishes `--radial-item` and `--radial-hub` from `radialMetrics`.
  - `#radial { --ui-u: calc(2px * var(--hud-k)) }`, `pointer-events:none`, with items and hub `auto`.
  - Round faces. No hex: tokens only.
- Add the radial and hub to the long-press callout/user-select rule.

**Removed:**
- `#tower-panel` markup and every `#tower-panel` / `.branch-*` / `.upgrade-btn` / `.sell-btn` / `.reposition-btn` rule, including the coarse 44-px list entries.
- GameScene `_openTowerPanel`, `_closeTowerPanel`, `_setUpgradeButton`, `_renderBranchPicker`, `_renderArmourLine`, `_openPanelFromTap`, `_panelAnchor`, `_bindConfirmable`/`_resetConfirm` (the logic moves into RadialMenu), the panel ids in the shutdown clone list, and the `tower-panel` hide.
- kitRollout entries for `#tower-panel`, `#panel-*`, `upgrade-btn` and `branch-choose-btn`. They are replaced by `#radial-hub` and `.radial-item` (`ui-btn`).

## Device matrix and capture
`flowExpectations` adds the following, with a throw if any premise fails like the existing ones:
- `pad2`: the second most central pad, via `pickPads(map, 2)`.
- `buildStates(gold)`: derived from `TOWER_DEFS`.
- `allUnaffordableAfterUpgrade`: `goldAfterUpgrade < min cost`.

Map 0 gives 130 → 70 → 20.

| # | Step | Assertion |
|---|---|---|
| 7 | arm-tower (rail) | Unchanged: `.selected`, ✕ visible, gold 130 |
| 8 | cancel-arm | Tap `#cancel-btn` → hidden, no `.selected` |
| 9 | open-build-radial | Tap pad → `#radial[data-kind=build]`, 6 items, states = `buildStates(130)`, `radialProblems` clean, screenshot |
| 10 | radial-build | Tap `.radial-item[data-id=build:archer]` → gold 70, radial hidden |
| 11 | open-ring | Tap pad → `data-kind=tower`, hub contains "T1", upgrade ready, sell "+36g" |
| 12 | upgrade-arm (touch only) | Tap upgrade → `.confirming`, caption "Tap again", gold 70 (inside the confirm window, as now) |
| 13 | upgrade | Gold 20, hub "T2", upgrade item locked "🔒 Map 3" (`lockedAfterUpgrade`) |
| 14 | radial-unaffordable | Tap `pad2` (D5 retarget from ring to build) → every item `aria-disabled`, gold 20 |
| 15 | close-radial | Tap `#radial-hub` → hidden |
| 16–17 | send-wave, pause | Unchanged (renumbered) |

`radialProblems({items, hub, mapRect, rails, minTouchPx})` in `layoutAudit.js` (pure, tested) checks:
- every visible item and the hub lie inside the map rect;
- none intersects a rail;
- each is ≥ `minTouchFor`;
- no two overlap.

`--screens`: `04-tower-panel.png` → `04-tower-ring.png` plus `04b-build-radial.png` on a free pad (`freePad(map, towers)`), each followed by `radialProblems`.

## Tests
- **Pure:**
  - `radialLayout`: no overlap at both cells for every ring config and for 6 items. All 4 corners and 4 edges clamp inside bounds with margin. `shifted` is false for a central pad. The footprint is 152/90.
  - `radialItems`: every tier × `maxTierAllowed` 2/3/4 × barracks × gold below/at/above cost. The boundary `gold === cost` is ready. `unlockMapNumber` is derived from `MAPS`.
  - `tapResolve`: each new row of the precedence. Free pad + armed still places. Free pad beats the path. The radial-open rows retarget, close or eat.
  - `towerDetail`: the ported `armourPanel` and `branchArmour` cases, including pierce, `_damageMult` and locked.
  - `sellRefund`; `placeBeside`.
- **DOM (jsdom):**
  - `RadialMenu`: the confirm suite ported from `touchInput`, plus keyboard navigation, `aria-disabled` focusable, live refresh preserving focus, the opening-release guard, destroy restoring a clean DOM, and single wiring after 3 open/destroy cycles.
  - `HintPeek`.
  - `GameScene` integration:
    - free pad opens build; build deducts gold once and closes;
    - ring upgrade re-renders; sell closes;
    - barracks T3 on a tier-4 map shows A/B and buys Vanguard (port of `barracksTier4`);
    - aim, arm and reposition each close the radial;
    - Esc/✕ close it; defeat closes it;
    - shutdown → re-create → one listener.
  - InputController: a tower long-press peeks and swallows the release.
- **Guards:**
  - New `noNativeTitles.test.js`: no `title="` attribute in the `index.html` body, and no `.title =` or `setAttribute('title'` in non-test src.
  - `UIScene.towerPanel` extends to "no `tower-panel` anywhere in src".
  - `railCss`/`themeCss` cover `#radial` automatically, because it sits inside `#hud-layer`. Assert the filter actually finds the radial rules.
  - kitRollout is updated as above.
- Prove each new test fails against a deliberately broken implementation (memory).

## Acceptance criteria
1. Full suite green. Report the count.
2. `npm run matrix` passes on desktop, iphone, pixel and ipad.
3. `--screens` shows no problems. Check the production build (`npm run build && npm run preview`).
4. Browser checks on desktop (fine rails, 1488) and phone emulation (iphone 340-px, coarse 1632), using frozen-frame probes (memory):
   - (a) A corner pad on a map that has one opens a fully visible, clamped radial clear of both rails.
   - (b) Earning gold mid-wave flips an item from disabled to ready live.
   - (c) Map 5 T3 archer and barracks show two branches. Map 0 T2 shows locked "Map 3".
   - (d) Keyboard: arrows, Enter, Esc, and the focus ring is visible.
   - (e) Long-press on a tower, the hub, an item, pause, codex and the hero card each peek without acting. Hover does the same on desktop.
   - (f) Aim mode with the ring open → ring closes and the aim fires normally.
   - (g) Paused: upgrade via the ring works and the preview redraws.
   - (h) Replaying a level 3 times, one radial tap builds exactly one tower and deducts gold once.
5. The opening tap never activates the item under the finger, on a real Chromium touch.

## Edge cases
- **Pad at a map corner or edge:** handled by the D3 clamp (`shifted`). The hub no longer covers the pad, and a tap on the uncovered pad or tower closes the radial (D5 own-target rule).
- **Gold below every cost:** the build radial still opens with all items `is-disabled` and peekable (matrix step 14).
- **`gold === cost`:** ready.
- **Gold drops while an item is armed:** the confirm disarms.
- **Tier-capped map:** locked items show "🔒 Map N". Map 0/1 at T2, map 2/3 at T3 (branches locked).
- **Level 4:** MAX.
- **Barracks:** Reposition item. Branches at T3 (#44). The armour/soldier detail sits in the inspector. Reposition mode closes the ring.
- **Hero aim mode:** aim has top precedence and the radial cannot coexist with it. Pressing W while the radial has focus closes the radial and starts the aim.
- **Hero dead:** no effect on radials. A path tap with nothing open is still `none`.
- **Pause:** the radial stays usable and the preview redraws. No new radial opens. Space never activates a focused item.
- **Pad inside the path's 40-px tap radius:** a tap within 22 px of a free pad now opens the build radial instead of moving the hero. This is intended; the hero still moves on any path tap further than 22 px from a pad.
- **Drag from the field released over the radial:** resolves as a canvas tap at that point (2.1 release-to-tap, see #42c), which normally means close.
- **Tower sold or upgraded by keyboard while the ring is focused:** handled by the re-render/close rules in the state table.
- **Wave end:** only gold changes. **Level end:** the radial closes.

## Out of scope
- Keyboard access to the canvas (opening a radial without a pointer) and U/S hotkeys.
- Open/close animation.
- Hover peeks on towers without an open ring.
- Recolouring matchup/armour content to palette tokens (#50b).
- Restyling the map-select meta-bar (#41f → 3.4).
- Soldier walk-to-rally (#48), tier visuals (#49), auto-send waves (#51).
- Any balance or `src/sim/` change. The sell ratio moves to `src/data/` value-for-value.

## Open questions
None. D5 (an open radial eats the next tap) and ✕ Cancel closing radials are recommendations the user can veto at plan review.
