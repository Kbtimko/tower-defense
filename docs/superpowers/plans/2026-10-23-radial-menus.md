# Radial build/upgrade menus (roadmap 3.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping a free pad opens a radial of the 6 towers (cost, affordability, range preview); tapping a tower opens an upgrade ring (next tier / both branches / sell / reposition + compact stats); `#tower-panel` is deleted, its detail moves to a long-press tower inspector; every native `title=` becomes a hover/focus/long-press `HintPeek`.

**Architecture:** Pure layout/item/detail modules (Vitest) feed a DOM presenter `RadialMenu` over static `#radial` markup inside `#hud-layer` (positioned in game px, kit-styled). `resolveTap` gains radial precedence; GameScene wires open/refresh/close/destroy and a change-driven range-preview graphics layer. The 2.4 device matrix is updated to drive the radial.

**Tech Stack:** vanilla JS, Phaser 3.90, Vite 5, Vitest + jsdom, Playwright (`scripts/capture.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-23-radial-menus-design.md` — binding. Its Decisions D1–D5, the Interaction table, "Items per ring", "Files", "Device matrix and capture", "Tests" and "Acceptance" sections are the contract; each task names the sections it implements.

## Global Constraints

- User decisions: build both ways (pad radial + rail arm-then-tap unchanged); ring = actions + compact stats, detail in long-press inspect; native `title=` removed, long-press peek on touch + hover on desktop.
- Controller rulings: D5 (an open radial eats the next canvas tap — retarget/close, never pass through) and ✕ Cancel closing radials are adopted as specified.
- Sizes derive from `HUD_CELL` (`radialMetrics`); radial CSS lengths are `calc(Npx * var(--hud-k))` or `var(--hud-cell)`/JS-published vars; `#radial { --ui-u: calc(2px * var(--hud-k)) }`; kit classes only (`.ui-btn` + variants; `.is-disabled` + `aria-disabled="true"` for unaffordable/locked — never the `disabled` attribute). Existing guards (railCss, themeCss, kitRollout, mobile) stay green and must cover `#radial`.
- Two-tap confirm on touch/pen for ring Upgrade/Branch/Sell (via `src/systems/confirmGate.js` `createConfirmGate`); build is one tap.
- Listeners wired/unwired as pairs; `destroy()` on scene shutdown (scene-listener-leak memory); no radial opens while paused-via-Phaser, `over` or `won`.
- No balance or `src/sim/` change; `SELL_REFUND_RATIO = 0.6` moves to `src/data/towers.js` value-for-value.
- Comments explain why. No new dependencies.

## Review Focus

1. The opening tap/release activating the item that lands under the finger → Task 3 opening-release guard test + controller real-touch check (Acceptance 5).
2. Stacked listeners across level replays → Task 3 "single wiring after 3 open/destroy cycles" + Task 4 shutdown→re-create test (Acceptance 4h).
3. Radial items crossing a rail or the map edge at a corner pad on either rail width → Task 1 clamp tests (4 corners × 2 cells) + Task 6 `radialProblems` in the matrix.
4. Affordability not updating live while open / confirm surviving an item turning unaffordable → Task 3 refresh tests.
5. A free pad within the path tap radius now opening the build radial instead of moving the hero → Task 4 `tapResolve` row (free pad beats path) — intended per spec; test pins it.

---

### Task 1: Pure radial geometry, items, refund, placement helper

**Spec:** D2, D3, "Items per ring", Files → New (pure): `src/data/radial.js`, `radialLayout.js`, `radialItems.js`, `placeBeside`; `sellRefund`.
**Files:** Create `src/data/radial.js`, `src/systems/radialLayout.js`, `src/systems/radialItems.js` (+ `.test.js` each); Modify `src/data/towers.js` (`SELL_REFUND_RATIO`), `src/systems/TowerPlacementManager.js` (`sellRefund(totalCost)` used by `sellTower`; export it), `src/systems/viewport.js` (`placeBeside`), tests for both.
**Produces:** `radialMetrics(hudCell) -> { item, hub, gap, radius, footprint }` (88 → item 88, hub 110, radius 108, footprint 152; 52 → radius 64, footprint 90); `layoutRadial({ anchor, angles, metrics, bounds, margin }) -> { centre, items:[{x,y}], shifted }`; `buildItems({ towerDefs, gold })`, `ringItems({ tower, towerDefs, map, maps, gold })`, `ringHub(tower)`, `unlockMapNumber(tier, maps)`, `previewRadius(item, ctx)`; `sellRefund(totalCost)`; `placeBeside(rect, size, bounds, gap, margin)`.

- [ ] **Step 1: Failing tests** exactly per spec Tests → Pure for these modules (no overlap at both cells for every ring config and 6 items; all 4 corners + 4 edges clamp inside bounds with margin; central pad `shifted:false`; footprints 152/90; every tier × `maxTierAllowed` 2/3/4 × barracks × gold below/at/above cost with `gold === cost` ready; `unlockMapNumber` derived from `MAPS`; `sellRefund` equals the old `Math.floor(totalCost*0.6)`; `placeBeside`). Run — FAIL.
- [ ] **Step 2: Implement** the signatures above; item objects carry `{ id, slot, label, cost, variant, state:'ready'|'disabled'|'locked'|'maxed', ariaLabel, … }` — define the exact shape in the module and keep it the single source for Task 3. Angles/scales in `src/data/radial.js`.
- [ ] **Step 3: Run** the files + `npm run test`. **Commit** `feat(radial): pure layout, items and sell refund (3.3)`.

### Task 2: Tower detail and the tower inspector peek

**Spec:** D4, Files → `towerDetail.js`, `armourRows.js`, `InspectController.js`, `InputController.js`; Interaction rows "Touch long-press on a tower".
**Files:** Create `src/systems/towerDetail.js` (+test), `src/ui/armourRows.js`; Modify `src/scenes/InspectController.js` (tower kind, `peekTower(tower, anchorRect)`, `hidePeek` hides it), `src/scenes/InputController.js` (long-press falls back to `inspector.longPressTargetAt` → tower), `index.html` (`#tower-inspector` `.inspector-panel ui-panel`, peek-only, `pointer-events:none`); port the armourPanel/branchArmour cases to `towerDetail.test.js`. GameScene keeps working (it may import `appendArmourRows` from the new module).
**Produces:** `describeTowerDetail(tower)`, `describeBranchPreview({ towerType, branch, damageMult, locked })`, `appendArmourRows(el, rows)`, `inspector.peekTower(tower, anchorRect)`.

- [ ] **Step 1: Failing tests** (ported armour cases incl. pierce, `_damageMult`, locked; InputController: a tower long-press peeks and swallows the release). Run — FAIL.
- [ ] **Step 2: Implement.** Keep `inspectableAt` side-effect-free (enemy/hero only).
- [ ] **Step 3: Run** + `npm run test`. **Commit** `feat(inspect): tower detail peek on long-press (3.3)`.

### Task 3: RadialMenu presenter + markup + CSS

**Spec:** D1, "Items per ring" (markup, hub, item peek), Interaction table (confirm, refresh, re-render, opening release, keyboard), Files → `RadialMenu.js`, `index.html` radial rules.
**Files:** Create `src/ui/RadialMenu.js` (+ `RadialMenu.test.js`); Modify `index.html` (`#radial` hub + 6 `.radial-item` buttons, `hidden`; geometry-only rules; add radial + hub to the long-press callout/user-select rule), `src/ui/kitRollout.test.js` (add `#radial-hub`, `.radial-item`), `src/ui/hudLayer.js` or the publisher of `--radial-item`/`--radial-hub` from `radialMetrics`.
**Consumes:** Task 1 items/layout; `createConfirmGate`, `attachLongPress`, `isKeyboardFocus`, `fitLabels`.
**Produces:** `new RadialMenu(doc, { onActivate(item), onPreview(item|null), onPeek(item, anchorRect) })` with `open({ kind:'build'|'tower', anchor, items, hub })`, `refresh(items, hub)`, `close()`, `destroy()`, `isOpen`, `kind`, `target`.

- [ ] **Step 1: Failing DOM tests** per spec Tests → DOM `RadialMenu` (confirm suite ported from `GameScene.touchInput.test.js`; keyboard nav order; `aria-disabled` focusable + activating it only toasts via callback; live refresh preserving focus and disarming confirm when the armed item turns unaffordable; opening-release guard — activation only from a `pointerdown` inside `#radial` after open, or keyboard; destroy restores a clean DOM; single wiring after 3 open/destroy cycles). Run — FAIL.
- [ ] **Step 2: Implement** presenter + markup + CSS. Assert railCss/themeCss filters actually find the radial rules (extend those tests).
- [ ] **Step 3: Run** + `npm run test` + `npm run build`. **Commit** `feat(radial): RadialMenu presenter, markup and kit styles (3.3)`.

### Task 4: Wire the radial into the game; delete #tower-panel

**Spec:** D5, new `resolveTap` order, Interaction table (all rows), Range preview (D-preview), Files → Changed (`tapResolve.js`, `GameScene.js`) and Removed (all), Tests → `tapResolve` + GameScene integration + `UIScene.towerPanel` guard.
**Files:** Modify `src/systems/tapResolve.js` (+test), `src/scenes/GameScene.js`, `index.html` (remove `#tower-panel` markup + every `#tower-panel`/`.branch-*`/`.upgrade-btn`/`.sell-btn`/`.reposition-btn` rule incl. coarse 44-px list entries), migrate/replace panel tests (`GameScene.barracksTier4`, `branchArmour`, `armourPanel`, `UIScene.towerPanel`, `touchInput`, `kitRollout` JS_SURFACES) — port behaviour to radial tests; delete only what the spec removes.
**Consumes:** Tasks 1–3.

- [ ] **Step 1: Failing tests:** each new `resolveTap` row (free pad + armed still places; free pad beats path; radial-open retarget/close/eat; `closeRadial` flag); GameScene integration list from spec Tests → DOM "GameScene integration" (free pad opens build; build deducts gold once and closes; ring upgrade re-renders; sell closes; barracks T3 on tier-4 map shows A/B and buys Vanguard; aim/arm/reposition close the radial; Esc/✕ close; defeat closes; shutdown → re-create → one listener); guard "no `tower-panel` anywhere in src". Run — FAIL.
- [ ] **Step 2: Implement** wiring (`_placeAt(slot, type)`, `_previewGfx` depth 31 redrawn on change, `radial.refresh()` from `_updateHUD`, close on modes/level end, `radial.destroy()` in shutdown, `hasMode()` counts an open radial, ✕ visible while open) and the removals.
- [ ] **Step 3: Run** + `npm run test` + `npm run build`. **Commit** `feat(radial): radial menus replace the tower panel (3.3)`.

### Task 5: HintPeek replaces native title= tooltips

**Spec:** "Tooltips (#42a)", Files → `HintPeek.js`, `src/data/hints.js`, `UIScene.js`, `upgradeNode.js`; Tests → `HintPeek`, `noNativeTitles.test.js`.
**Files:** Create `src/ui/HintPeek.js` (+test), `src/data/hints.js`, `src/ui/noNativeTitles.test.js`; Modify `index.html` (remove `title=`; `#hero-section tabindex="0"`; `#hint-peek` `.ui-panel`), `src/scenes/GameScene.js` (attach pause + codex hints, detach in shutdown), `src/scenes/UIScene.js` (hero-section hint; memoised string instead of `.title`), `src/ui/upgradeNode.js` (locked-hero reason → visible `.upgrade-node-gate` line), map-select meta-bar titles removed.
**Produces:** `attachHint(anchor, getText) -> detach`.

- [ ] **Step 1: Failing tests** (HintPeek hover/keyboard-focus/long-press-with-click-swallowed/linger/Esc; guard: no `title="` in the index.html body, no `.title =` / `setAttribute('title'` in non-test src). Run — FAIL.
- [ ] **Step 2: Implement.** Static strings in `src/data/hints.js`. Each owner detaches in its own shutdown.
- [ ] **Step 3: Run** + `npm run test` + `npm run build`. **Commit** `feat(ui): hint peeks replace native title tooltips (3.3)`.

### Task 6: Device matrix, layout audit and captures

**Spec:** "Device matrix and capture" (whole section), Acceptance 2–3.
**Files:** Modify `src/systems/deviceFlow.js` (+test: steps 7–17 per spec table, `pickPads(map, 2)`, `buildStates(gold)`, `allUnaffordableAfterUpgrade`, throws on failed premises), `src/systems/layoutAudit.js` (+test: `radialProblems({ items, hub, mapRect, rails, minTouchPx })`), `scripts/capture.mjs` (flow steps; `--screens` `04-tower-ring.png` + `04b-build-radial.png` via `freePad(map, towers)`, each followed by `radialProblems`).

- [ ] **Step 1: Failing pure tests** for the new deviceFlow expectations/steps and `radialProblems`. Run — FAIL. Implement. Run + `npm run test`.
- [ ] **Step 2:** `npm run matrix` → PASS on desktop, iphone, pixel, ipad (report the summary lines); `npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad` → zero problems. Diagnose root causes; never loosen an assertion.
- [ ] **Step 3: Commit** `feat(matrix): device flow drives the radial menus (3.3)`.

### After Task 6 (controller)

Browser acceptance per spec Acceptance 4(a)–(h) and 5 on the production build (desktop fine rails + iPhone coarse), frozen-frame probes with transitions settled; captures to `docs/captures/3.3-radial-menus/`; tick roadmap 3.3; notes; PR into `visual/integration`.
