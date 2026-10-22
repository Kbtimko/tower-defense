# Fine-pointer narrow rails (backlog #43 b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `(pointer: fine)` devices, chosen once at boot, the HUD rails are 104 game px (2 × 52-px cells) and the canvas 1488×720; coarse pointers keep 176/88/1632 exactly.

**Architecture:** `src/data/layout.js` resolves rail metrics once at module load from a pure `railMetricsFor({ pointerFine })` + `isPointerFine(win)`; existing export names (`HUD_CELL`, `RAIL_WIDTH`, `CANVAS_WIDTH`) carry the resolved values and a new `HUD_K` = hudCell/88 is published as CSS `--hud-k`. Every length in a rail CSS rule becomes `calc(Npx * var(--hud-k))`, so layout px stays equal to game px inside `#hud-layer` and no JS geometry changes. The capture harness learns the page's pointer class.

**Tech Stack:** vanilla JS ES modules, Phaser 3.88, Vite 5, Vitest 2 + jsdom, Playwright (capture script only).

**Spec:** `docs/superpowers/specs/2026-10-22-fine-pointer-rails-design.md` — read it; its Design section lists every CSS declaration to change.

## Global Constraints

- Fine: `{ hudCell: 52, railWidth: 104, canvasWidth: 1488, hudK: 52/88 }`. Coarse: `{ hudCell: 88, railWidth: 176, canvasWidth: 1632, hudK: 1 }`.
- No `matchMedia` / `matchMedia` returns null / `pointer: none` → coarse.
- `POINTER_FINE_QUERY = '(pointer: fine)'` lives in `src/data/mobile.js`.
- Choice is made once at module load; never re-evaluated on resize.
- `.wave-preview` and `.wp-*` rules stay unscaled; nothing outside `#hud-layer` changes.
- Coarse layout must be value-for-value identical to today (k = 1).
- All 2232 existing tests pass unchanged. Comments explain why, not what. No new dependencies.

## Review Focus

1. A rail declaration missed by the `calc(... var(--hud-k))` rewrite (renders full size inside a 52-px cell) → Task 2's guard test T4, proven to fail on one reverted declaration.
2. Calling `matchMedia` unbound throws "Illegal invocation" → Task 1 tests `isPointerFine` with a `win` whose `matchMedia` uses `this`.
3. jsdom/Node silently resolving to fine values would change the whole existing suite → Task 1 asserts the resolved exports equal the coarse metrics in jsdom.
4. A touch device emulated as `pointer: fine` would put narrow rails on phones → Task 3's `railGeometryProblems` flags it; Task 4 runs it on every capture.
5. `scripts/capture.mjs` clicking world points with Node-side (always coarse) constants on a fine-pointer page → Task 4 reads the pointer class from the page.

---

### Task 1: Boot-time rail metrics + `--hud-k`

**Files:**
- Modify: `src/data/mobile.js` (add `POINTER_FINE_QUERY`)
- Modify: `src/data/layout.js`
- Modify: `src/ui/hudLayer.js` (`applyHudLayerSize` publishes `--hud-k`)
- Create: `src/data/layout.test.js`, `src/data/layout.fine.test.js`
- Modify: `src/ui/hudLayer.test.js`

**Interfaces:**
- Produces: `isPointerFine(win) -> boolean`; `railMetricsFor({ pointerFine }) -> { hudCell, railWidth, canvasWidth, hudK }`; constants `TOUCH_HUD_CELL = 88`, `FINE_HUD_CELL = 52`, `RAIL_COLUMNS = 2`; resolved exports `POINTER_FINE`, `HUD_CELL`, `RAIL_WIDTH`, `CANVAS_WIDTH`, `HUD_K`; CSS var `--hud-k` (unitless).

- [ ] **Step 1: Write failing tests** in `src/data/layout.test.js` (jsdom):
  - `railMetricsFor({ pointerFine: true })` toEqual `{ hudCell: 52, railWidth: 104, canvasWidth: 1488, hudK: 52/88 }`; `{ pointerFine: false }` → `{ 88, 176, 1632, 1 }`; for both, `railWidth === 2 * hudCell` and `canvasWidth === WORLD_WIDTH + 2 * railWidth`.
  - `isPointerFine`: `undefined` → false; `{}` → false; `{ matchMedia: () => null }` → false; a `win` whose `matchMedia(q)` returns `{ matches: q === '(pointer: fine)' }` **and reads `this === win` (throws otherwise)** → true; one answering `{ matches: false }` → false.
  - Resolved exports in jsdom: `{ hudCell: HUD_CELL, railWidth: RAIL_WIDTH, canvasWidth: CANVAS_WIDTH, hudK: HUD_K }` toEqual `railMetricsFor({ pointerFine: false })` and `POINTER_FINE === false`.
  - `src/data/layout.fine.test.js`: `vi.stubGlobal('matchMedia', q => ({ matches: q === POINTER_FINE_QUERY }))`, `vi.resetModules()`, dynamic-import `./layout.js` and `../ui/hudLayer.js`; assert `CANVAS_WIDTH 1488`, `RAIL_WIDTH 104`, `HUD_CELL 52`, `HUD_K 52/88`; after `applyHudLayerSize(document)` the root style has `--rail-w: 104px`, `--hud-cell: 52px`, `--canvas-w: 1488px`, `--hud-k: String(52/88)`; `mapRectIn` for a 1440-wide, 696.8-high canvas at left 0 gives left ≈ 100.65 and width ≈ 1238.7 (`toBeCloseTo(…, 1)`; read `mapRectIn`'s real signature first). `vi.unstubAllGlobals()` in afterEach.
  - `src/ui/hudLayer.test.js`: add — after `applyHudLayerSize`, `--hud-k` is `'1'`.
- [ ] **Step 2: Run** `npx vitest run src/data/layout.test.js src/data/layout.fine.test.js src/ui/hudLayer.test.js` — Expected: FAIL (exports missing).
- [ ] **Step 3: Implement.** `isPointerFine(win)` returns `win?.matchMedia?.(POINTER_FINE_QUERY)?.matches === true` (call as a method on `win`). Module resolves `railMetricsFor({ pointerFine: isPointerFine(globalThis) })` once and exports the five names. Keep the existing "44 CSS px on a 360-px phone" comment on `TOUCH_HUD_CELL`; comment `FINE_HUD_CELL` with why (mouse targets don't need 44 px; 2×52 = 104 rails). `applyHudLayerSize` adds `s.setProperty('--hud-k', String(HUD_K))`. No other importer changes.
- [ ] **Step 4: Run** the three files, then `npm run test` — Expected: all pass; existing 2232 unchanged.
- [ ] **Step 5: Commit** `feat(layout): resolve rail metrics once from the pointer class (#43)` (stage the five files explicitly).

### Task 2: Rail CSS scales by `--hud-k` + guard test

**Files:**
- Modify: `index.html` (`<style>` rail rules + header comment lines ~17–29)
- Modify: `src/ui/fitLabels.js` (comment only: "88-px cell" → "its cell")
- Create: `src/ui/railCss.test.js` (`// @vitest-environment node`, like `src/data/mobile.test.js`)

**Interfaces:**
- Consumes: CSS var `--hud-k` from Task 1.

- [ ] **Step 1: Write the failing guard test (T4).** Read `index.html` via `new URL('../../index.html', import.meta.url)`. Extract `<style>` text; strip `/* */` comments; remove `@keyframes` blocks; flatten `@media` blocks to their inner rules. Load the body markup into `new JSDOM(html)` (`jsdom` is installed). A rule is a *rail rule* if any comma-separated selector, after removing pseudo-classes/elements (`:hover`, `::after`, `:focus-visible`, `:where(...)`→its argument, `:not(...)`, `[disabled]` stays), matches ≥1 element inside `#hud-layer` that is NOT `.wave-preview` or inside it; also include the `#hud-layer` rule itself. Assert every `/\d+(\.\d+)?px/` in each rail rule body appears as `calc(<N>px * var(--hud-k))`, except values written as `var(--rail-w)`/`var(--hud-cell)`/`var(--peek-gap)`/`var(--canvas-w)`/`var(--world-h)`. Failure message lists `selector → declaration`. Add a second assertion that the rail-rule count is ≥ 20 (so a broken selector filter can't pass vacuously).
- [ ] **Step 2: Run** `npx vitest run src/ui/railCss.test.js` — Expected: FAIL listing the ~45 declarations from the spec's Design section.
- [ ] **Step 3: Rewrite each listed declaration** as `calc(<today's px> * var(--hud-k))` (multi-value shorthands: wrap each length, e.g. `padding: 0 calc(10px * var(--hud-k))`; `box-shadow: inset calc(-3px * var(--hud-k)) 0 0 #8b6914`). Leave `.wave-preview`, `.wp-*`, `--peek-gap`, `@keyframes`, everything outside `#hud-layer` untouched. Update the header comment: cells are 88 game px on touch, 52 on a mouse; rail lengths multiply by `--hud-k`. If the test flags a rule the spec didn't list, convert it too and note it in the commit body.
- [ ] **Step 4: Run** `npx vitest run src/ui/railCss.test.js` — PASS. **Prove it bites:** revert `.hud-val`'s font-size to `28px`, rerun, confirm this test fails naming `.hud-val`; restore. Then `npm run test` and `npm run build` — all pass.
- [ ] **Step 5: Commit** `feat(hud): rail lengths scale with --hud-k (#43)`.

### Task 3: Layout audit — explicit touch floors + rail geometry

**Files:**
- Modify: `src/systems/layoutAudit.js`
- Modify: `src/systems/layoutAudit.test.js`

**Interfaces:**
- Consumes: `railMetricsFor` from Task 1.
- Produces: `railGeometryProblems({ device, pointerFine, canvasRect, rails }) -> string[]` where `device = { name, hasTouch }`, `canvasRect = { width, height }` (CSS px), `rails = [{ id, width }]` (CSS px).

- [ ] **Step 1: Failing tests:** `minTouchFor` results unchanged for the existing cases (keep them); new `railGeometryProblems` cases — (a) `hasTouch: true, pointerFine: true` → contains `'touch device reports pointer: fine'`; (b) fine, canvas 1440×696.77, rails 104·1440/1488 = 100.65 → `[]`; (c) coarse, canvas 844×372.35, rails 176·844/1632 → `[]`; (d) fine canvas but a rail 3 px too wide → one problem naming the rail id; (e) fine but canvas aspect 1632/720 → one aspect problem. Messages prefixed with `device.name`.
- [ ] **Step 2: Run** `npx vitest run src/systems/layoutAudit.test.js` — FAIL.
- [ ] **Step 3: Implement.** `minTouchFor` takes `canvasWidth` from `railMetricsFor({ pointerFine: false })` (touch floors only apply to coarse devices; module constants would follow the environment). `railGeometryProblems`: rail width tolerance ±1 CSS px of `railWidth * canvasRect.width / canvasWidth`; aspect tolerance 0.01 of `canvasWidth / WORLD_HEIGHT`; metrics from `railMetricsFor({ pointerFine })`.
- [ ] **Step 4: Run** the file then `npm run test` — PASS.
- [ ] **Step 5: Commit** `feat(audit): rail geometry check per pointer class (#43)`.

### Task 4: Capture harness is pointer-aware

**Files:**
- Modify: `scripts/capture.mjs`

**Interfaces:**
- Consumes: `railMetricsFor`, `POINTER_FINE_QUERY`, `railGeometryProblems`.

- [ ] **Step 1:** Add `DEVICES.desktop1440` (`viewport 1440×900, deviceScaleFactor 1`) and `DEVICES.desktop1080` (`1920×1080, deviceScaleFactor 1`), shaped like the existing `desktop` entry.
- [ ] **Step 2:** The in-page metrics evaluate also returns `canvas` (rect of `#game canvas`) and `pointerFine` (`matchMedia(query).matches`, query passed in as an argument — don't inline the string). The in-game audit pushes `railGeometryProblems({ device: { name, hasTouch }, pointerFine, canvasRect, rails })`, with rails from `#rail-left`/`#rail-right` rects.
- [ ] **Step 3:** `clickGamePoint(page, x, y)` reads `pointerFine` from the page and uses `railMetricsFor({ pointerFine })` for `railWidth`/`canvasWidth` instead of the imported `RAIL_WIDTH`/`CANVAS_WIDTH`; drop those imports if now unused.
- [ ] **Step 4: Verify** `npm run capture -- --screens --devices desktop,desktop1440,desktop1080,iphone,pixel,ipad` (check `--help`/arg parsing for the exact flags first). Expected: zero LAYOUT problems; the desktop devices report fine-pointer rails, the phones coarse. `npm run test` still green.
- [ ] **Step 5: Commit** `feat(capture): desktop devices and pointer-aware clicks (#43)`.

### After Task 4 (controller, not a subagent task)

Browser-verify on `npm run build && npm run preview` per spec AC1–AC9: the acceptance table at 1280×720 / 1440×900 / 1920×1080 (mouse), real `page.mouse` clicks on every rail control, label overflow check after `document.fonts.ready`, wave-preview computed `.wp-title` 28px, and the AC7 phone fingerprint diffed against a base-branch build. Then tick roadmap/notes and open the PR into `visual/integration`.
