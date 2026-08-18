# Show Tower Range Before Placing — Design

**Date:** 2026-06-16
**Backlog item:** #6 — Show tower range before placing
**Status:** Approved, ready for implementation plan

## Problem

When a player arms a tower for building (selects a build button), open slots highlight in
gold but there is no indication of the tower's attack range. The player commits to a slot
without seeing the coverage they will get. Each tower type has a distinct base `range`
(archer 120, mage 100, cannon 110, ice 115, sniper 200, barracks 130 — `src/data/towers.js`),
so this matters for placement decisions.

## Goal

While a tower type is armed for building, draw a single range ring at the cursor so the
player can see coverage before committing. The previewed radius must match the range the
tower will actually have once built (including upgrade modifiers).

## Behavior

- **Active when:** `selectedType` is set (a build button is armed) **and** not in reposition
  mode (`repositionMode` false). This mirrors the conditions under which `_drawZones`
  already runs.
- **Cursor tracking:** the existing `pointermove` handler (`GameScene.js:149`) already fires
  for the inspector. Store the latest `worldX`/`worldY` on the scene so the per-frame draw
  can read it.
- **Ring center (free-floating with truthful snap):**
  - If `getNearestSlot(mx, my, 60, true)` returns a free slot within snap distance, center
    the ring on that slot — this is the slot a click would actually build on, so the
    preview is truthful.
  - Otherwise, center the ring on the raw cursor position (free-floating).
- **Ring radius:** `Math.round(TOWER_DEFS[selectedType].range × towerRangeMult)`, matching
  the exact computation `Tower.js` performs on construction
  (`this.range = Math.round(def.range * this._rangeMult)`, where
  `_rangeMult = modifiers.towerRangeMult ?? 1`). This keeps the preview in sync with the
  real tower, including range upgrades.
- **Affordability / validity cue:** reuse the existing `canAfford` check
  (`economy.gold >= TOWER_DEFS[selectedType].cost`).
  - Affordable **and** over a valid free slot → gold ring + faint gold fill.
  - Unaffordable, or free-floating with no valid slot in range → dimmed ring, no fill.
  - This is consistent with how `_drawZones` already colors slot highlights
    (gold `0xffd700` vs muted red `0x884444`).

## Visual style

Reuse the placed-tower selected-range look so build-preview and placed-tower range read as
the same visual language:

- Stroke: `lineStyle(2, 0xffd700, ~0.5)` for the affordable/valid state.
- Fill: `fillCircle(cx, cy, radius)` with `fillStyle(0xffd700, 0.07)` for the valid state.
- Dimmed state: lower-alpha stroke (e.g. `0x884444` / reduced alpha), no fill.

## Architecture & touch points

This is a small, self-contained change confined to one file plus one tiny pure helper.

- **`src/scenes/GameScene.js`**
  - In the `pointermove` handler (line 149), also record `this._buildCursorX` /
    `this._buildCursorY` (initialized in `create`).
  - In `_drawZones` (line 1262), after the slot-highlight loop, draw the preview ring using
    the rules above. The method already early-returns / only runs in build context, so no
    new gating branch is needed beyond the `selectedType && !repositionMode` check.
- **Range helper (pure):** add `previewRange(baseRange, rangeMult) => Math.round(baseRange * rangeMult)`
  as a new tiny pure module `src/systems/rangePreview.js` (mirroring the existing
  `src/systems/fireRateMods.js` pattern for small pure tower-stat helpers), with a sibling
  `rangePreview.test.js`. `GameScene._drawZones` imports it; the value matches the
  `Math.round(def.range * _rangeMult)` computation in `Tower.js`.

No new scenes, systems, events, or data shapes. Placement mechanics, tower construction, and
`_drawTowers` are unchanged.

## Testing

- **Unit:** test `previewRange` — base range × mult with rounding (e.g. `120 × 1 = 120`,
  `200 × 1.1 = 220`, rounding boundary like `115 × 1.15 = 132`).
- **Browser verification:**
  - Arm each tower type; confirm a single ring follows the cursor.
  - Confirm the ring snaps its center to a free slot when the cursor is within snap range,
    and floats at the cursor otherwise.
  - Confirm the radius differs correctly per type (sniper 200 noticeably larger than mage 100).
  - Confirm the ring dims when the player cannot afford the selected tower.
  - Confirm no ring is drawn when no type is armed or while repositioning a barracks.
- Existing tests should remain green (no behavior change to placement or rendering of
  existing entities).

## Out of scope (YAGNI)

- Touch / long-press preview for mobile — deferred to Phase 10 (iOS prep).
- Drawing range rings on every open slot simultaneously.
- Any change to placement mechanics, snap distance, or tower stats.
