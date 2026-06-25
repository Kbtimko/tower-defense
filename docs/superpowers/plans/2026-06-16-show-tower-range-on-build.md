# Show Tower Range Before Placing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a tower type is armed for building, draw a single range ring at the cursor (snapping to the nearest free slot when close) so the player sees the tower's real coverage before committing.

**Architecture:** A new pure helper `src/systems/rangePreview.js` computes the preview radius exactly as `Tower.js` does (`Math.round(baseRange × rangeMult)`). `GameScene` stores the latest cursor position and the upgrade range multiplier, then draws the ring inside the existing per-frame `_drawZones` method. No new scenes, systems, events, or data shapes; placement mechanics are unchanged.

**Tech Stack:** Phaser 3, Vitest, vanilla ES modules.

**Spec:** `docs/superpowers/specs/2026-06-16-show-tower-range-on-build-design.md`

---

### Task 1: Pure `previewRange` helper

**Files:**
- Create: `src/systems/rangePreview.js`
- Test: `src/systems/rangePreview.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/systems/rangePreview.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { previewRange } from './rangePreview.js';

describe('previewRange', () => {
  it('returns the base range when the multiplier is 1', () => {
    expect(previewRange(120, 1)).toBe(120);
  });

  it('scales by the multiplier and rounds', () => {
    expect(previewRange(200, 1.1)).toBe(220);
  });

  it('rounds a fractional result to the nearest integer', () => {
    // 115 * 1.15 = 132.25 -> 132
    expect(previewRange(115, 1.15)).toBe(132);
  });

  it('defaults the multiplier to 1 when omitted', () => {
    expect(previewRange(130)).toBe(130);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/rangePreview.test.js`
Expected: FAIL — `Failed to resolve import "./rangePreview.js"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/systems/rangePreview.js`:

```js
// Pure helper for the build-time range preview ring. Mirrors the exact range
// computation in Tower.js (`Math.round(def.range * _rangeMult)`) so the
// previewed coverage matches what the placed tower will actually have,
// including the towerRangeMult upgrade modifier.

export function previewRange(baseRange, rangeMult = 1) {
  return Math.round(baseRange * rangeMult);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/rangePreview.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/rangePreview.js src/systems/rangePreview.test.js
git commit -m "feat(towers): pure previewRange helper for build-time range ring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Track cursor + range multiplier on the scene

**Files:**
- Modify: `src/scenes/GameScene.js` (create() init block ~line 112-117; modifiers line 66-67; pointermove handler ~line 149)

- [ ] **Step 1: Store the range multiplier alongside the other modifier reads**

In `src/scenes/GameScene.js`, find (around line 66-67):

```js
    const mods       = this.upgradeMgr.getModifiers(this.heroId);
    this.killGoldMult = mods.killGoldMult;
```

Change it to:

```js
    const mods       = this.upgradeMgr.getModifiers(this.heroId);
    this.killGoldMult = mods.killGoldMult;
    this._towerRangeMult = mods.towerRangeMult ?? 1;
```

- [ ] **Step 2: Initialize the build-cursor fields**

Find the build/reposition state init (around line 112-117):

```js
    this.selectedType   = null;
    this.selectedTower  = null;
    this._openTowerId   = null;

    // Reposition mode state
    this.repositionMode        = false;
    this.repositioningBarracks = null;
```

Add the cursor fields right after `_openTowerId`:

```js
    this.selectedType   = null;
    this.selectedTower  = null;
    this._openTowerId   = null;

    // Latest pointer world position, used to draw the build-time range ring.
    this._buildCursorX  = 0;
    this._buildCursorY  = 0;

    // Reposition mode state
    this.repositionMode        = false;
    this.repositioningBarracks = null;
```

- [ ] **Step 3: Record the cursor position in the existing pointermove handler**

Find (around line 149):

```js
    this.input.on('pointermove', (p) => this.inspector.onPointerMove(p.worldX, p.worldY));
```

Replace with:

```js
    this.input.on('pointermove', (p) => {
      this._buildCursorX = p.worldX;
      this._buildCursorY = p.worldY;
      this.inspector.onPointerMove(p.worldX, p.worldY);
    });
```

- [ ] **Step 4: Verify nothing broke**

Run: `npx vitest run`
Expected: PASS — full suite still green (no behavior change yet; this only stores state).

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat(game-scene): track build cursor + tower range multiplier

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Draw the build-time range ring in `_drawZones`

**Files:**
- Modify: `src/scenes/GameScene.js` (`_drawZones`, ~line 1262-1286)
- Modify: import block (add `previewRange`)

- [ ] **Step 1: Import the helper**

Near the top of `src/scenes/GameScene.js`, alongside the other `../systems/` imports, add:

```js
import { previewRange } from '../systems/rangePreview.js';
```

- [ ] **Step 2: Draw the ring after the zone-highlight loop**

Find the end of the zone-highlight loop in `_drawZones` (around line 1262-1273):

```js
  _drawZones() {
    const canAfford = this.selectedType && this.economy.gold >= (TOWER_DEFS[this.selectedType]?.cost ?? Infinity);
    for (const zone of this.placementManager.getZones()) {
      if (zone.occupied) continue;
      const color = this.selectedType ? (canAfford ? 0xffd700 : 0x884444) : 0x444444;
      const alpha = this.selectedType ? 1 : 0.3;
      this.gfx.lineStyle(this.selectedType ? 2 : 1, color, alpha);
      this.gfx.strokeCircle(zone.cx, zone.cy, zone.radius);
      if (this.selectedType && canAfford) {
        this.gfx.fillStyle(0xffd700, 0.07); this.gfx.fillCircle(zone.cx, zone.cy, zone.radius);
      }
    }
```

Immediately after that closing `}` of the `for` loop (and before the `if (this.repositionMode ...)` block), insert the build-preview ring:

```js
    // Build-time range preview: a single ring at the cursor (snapping to the
    // nearest free slot when close) showing the coverage the tower would have.
    if (this.selectedType && !this.repositionMode) {
      const def    = TOWER_DEFS[this.selectedType];
      const radius = previewRange(def.range, this._towerRangeMult);
      // getNearestSlot returns { slotIndex, x, y } (verified in
      // TowerPlacementManager.js:35) — note x/y, not cx/cy.
      const slot   = this.placementManager.getNearestSlot(
        this._buildCursorX, this._buildCursorY, 60, true,
      );
      const cx = slot ? slot.x : this._buildCursorX;
      const cy = slot ? slot.y : this._buildCursorY;
      const valid = canAfford && !!slot;

      if (valid) {
        this.gfx.lineStyle(2, 0xffd700, 0.5);
        this.gfx.strokeCircle(cx, cy, radius);
        this.gfx.fillStyle(0xffd700, 0.07);
        this.gfx.fillCircle(cx, cy, radius);
      } else {
        this.gfx.lineStyle(2, 0x884444, 0.4);
        this.gfx.strokeCircle(cx, cy, radius);
      }
    }
```

> Note: `getNearestSlot` returns `{ slotIndex, x, y }` (see
> `TowerPlacementManager.js:35`) — the slot center is `slot.x` / `slot.y`, not
> `cx`/`cy`. The zone-highlight loop above uses `zone.cx`/`zone.cy` because it
> iterates the raw zone objects from `getZones()`; the two are intentionally
> different. Use `slot.x` / `slot.y` here.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — full suite green. (`_drawZones` is not unit-tested in this codebase; the draw is verified in the browser at Step 5.)

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Browser verification**

Run: `npm run dev`, open the served URL, start any level, then:
- Arm each tower type (click its build button). Confirm a single gold range ring follows the cursor.
- Move the cursor near a free slot — confirm the ring's center snaps to that slot.
- Move the cursor away from all slots — confirm the ring floats at the cursor.
- Compare sniper (range 200) vs mage (range 100) — the sniper ring is visibly larger.
- Spend down gold (or pick a tower you can't afford) — confirm the ring turns dim/red with no fill.
- Deselect the build button — confirm no ring is drawn.
- Start repositioning a barracks — confirm the build-preview ring does NOT appear (only the reposition indicator does).

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat(game-scene): show tower range ring while placing (backlog #6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** Active-when conditions (Task 3 guard `selectedType && !repositionMode`); cursor tracking (Task 2 Step 3); snap-to-slot vs free-float (Task 3 Step 2 `getNearestSlot`); radius = `round(base × mult)` (Task 1 + Task 3); affordability/validity cue (Task 3 `valid` branch reusing `canAfford`); reuse of selected-tower ring style `0xffd700` (Task 3); pure helper + unit test (Task 1); browser verification matrix (Task 3 Step 5). All covered.
- **Out-of-scope items** (touch preview, all-slot rings, placement changes) are not introduced.
- **Type consistency:** `previewRange(baseRange, rangeMult)` signature identical across Task 1 and Task 3. `this._towerRangeMult` set in Task 2, read in Task 3. `this._buildCursorX/Y` set in Task 2, read in Task 3. `getNearestSlot(x, y, maxDist, requireFree)` matches the existing call at `GameScene.js:839`.
- **Verified:** `getNearestSlot(worldX, worldY, snapPx, requireFree)` returns `{ slotIndex, x, y }` (`TowerPlacementManager.js:35`); the plan uses `slot.x`/`slot.y` accordingly. `previewRange` matches `Tower.js`'s `Math.round(def.range * _rangeMult)` with `_rangeMult = modifiers.towerRangeMult ?? 1`.
