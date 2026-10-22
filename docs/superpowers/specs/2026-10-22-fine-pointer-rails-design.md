# Fine-pointer narrow rails (backlog #43, option b) — design

Branch `visual/43-fine-pointer-rails` (base `visual/integration` after roadmap 2.2). Vanilla JS, Phaser 3.88, Vitest + jsdom.

## Problem / goal

Roadmap 2.2 widened the canvas to 1632×720: WORLD 1280×720 plus two 176-px HUD rails (`src/data/layout.js`). That is 2.27:1, so on 16:9 and 16:10 desktop windows the canvas fills the width and letterboxes top and bottom, and the map comes out 10–17 % smaller than before the rails. Desktop players use a mouse, so they don't need 44-CSS-px touch cells.

**Decided (not reopened):** on `(pointer: fine)` devices, the choice is made **once at boot**: rails are **104 game px wide** (2 columns × 52-px cells, k = 52/88 = 0.5909), so the canvas is **1488×720**. Coarse pointers (phones, tablets) keep 176/88 exactly as today, because that layout passed the real-device gate.

Map size in CSS px (window = viewport; the canvas fills the width in every row):

| Viewport | Pre-rail | 176 rails (today) | 104 rails (new) | New vs pre-rail |
|---|---|---|---|---|
| 1280×720 | 1036×583 | 1004×565 | ~1101×619 | +6 % |
| 1440×900 | 1356×763 | 1129×635 | ~1239×697 | −9 % |
| 1920×1080 | 1676×943 | 1506×847 | ~1652×929 | −1 % |

## Requirements

1. **R1 Boot-time metrics.** `src/data/layout.js` exposes the pure `railMetricsFor({ pointerFine })`, which returns `{ hudCell, railWidth, canvasWidth, hudK }`. Fine gives `{ 52, 104, 1488, 52/88 }`. Coarse gives `{ 88, 176, 1632, 1 }`. The module resolves this once at load and exports the results as `HUD_CELL`, `RAIL_WIDTH`, `CANVAS_WIDTH` (same names as today) and the new `HUD_K`.
2. **R2 Detection.** The pure `isPointerFine(win)` returns `win?.matchMedia?.(POINTER_FINE_QUERY)?.matches === true`. It takes the global object, not a bare `matchMedia` function, because calling an unbound `matchMedia` throws "Illegal invocation" in browsers. Put `POINTER_FINE_QUERY = '(pointer: fine)'` in `src/data/mobile.js` next to the other media queries. layout.js calls `isPointerFine(globalThis)`. In jsdom and Node, `matchMedia` is missing, so the result is coarse and every existing test and `scripts/capture.mjs` import resolves to today's values.
3. **R3 CSS scale factor.** `applyHudLayerSize` also publishes `--hud-k` (unitless `HUD_K`). Existing variables keep their names. They now carry the resolved values (`--rail-w` 104px, `--hud-cell` 52px, `--canvas-w` 1488px on fine pointers).
4. **R4 Rail content scales by `--hud-k`.** Every length in a rail rule becomes `calc(<today's px> * var(--hud-k))`. The full list is under Design. Lengths already written as `var(--rail-w)` or `var(--hud-cell)` stay as they are.
5. **R5 Wave preview keeps its size.** `.wave-preview` and all `.wp-*` rules stay unscaled, with today's game-px values.
6. **R6 Coarse is unchanged.** With k = 1, every computed rail value under `#hud-layer` (rect, font-size, border, padding, radius, gap) matches today exactly on phone and tablet emulation.
7. **R7 Capture harness is pointer-aware.** It adds desktop devices at 1440×900 and 1920×1080. `clickGamePoint` gets rail and canvas widths from the page's pointer class, not from Node-side constants (those are always coarse). It also adds a rail-geometry audit.
8. **R8 Audit stays environment-independent.** `minTouchFor` uses `railMetricsFor({ pointerFine: false })` explicitly, since touch floors only apply to coarse devices. Today it reads module constants, which happen to be coarse in Node.

## Edge cases

- **No `matchMedia`** (jsdom, Node), **`matchMedia` returns null** (old Firefox inside a hidden iframe), or **`pointer: none`** (keyboard-only devices, some TVs): coarse, wide rails. This is the safe default.
- **Hybrid touchscreen laptop** (primary pointer is fine): narrow rails. This is acceptable. A finger still gets a 44.7-CSS-px cell at 1280 wide. It matches BootScene's mapGrade, which already treats these laptops as non-coarse.
- **iPad with a trackpad:** expected to report coarse as its primary pointer, so wide rails. Spot-check if a device is available. Not a blocker.
- **Window resized, moved to another monitor, pointer plugged or unplugged, or DevTools device mode toggled after boot:** the choice is not re-evaluated, by design. A reload picks again. FIT scaling still handles resizes.
- **Small desktop windows:** at 1024×768 a cell is 35.8 CSS px and label text is about 9.8 CSS px (today: 15 px). This is accepted as the cost of the decision. See Open questions.
- **Wave preview:** its game-px size is unchanged. Because the layer scale is now canvas/1488, it renders about 9.7 % larger in CSS px at the same window size (1632/1488). It still fits: max 600 game px wide plus the gap, which is less than the 1280-wide map it opens over. Its vertical clamp uses `layer.offsetHeight` (720), which is unchanged.
- **Long or dynamic labels** ("Barracks", "▶ Send Wave 10", gold "12345", "Rael L10", Cancel shown or hidden): fitLabels refits. At k the natural widths scale almost linearly, so most labels already fit.
- **Left rail gets much more empty space:** 7 cell rows take 364 of 720 px instead of 616, and `space-evenly` spreads them out. Accepted (see Out of scope).
- **MapEditorScene:** its camera viewport follows `RAIL_WIDTH`, so on fine pointers the editor shows 104-px blank bands. Clicks use `pointer.worldX`, so no math changes.
- **Peek cards** (#tower-tooltip, #ability-card, inspectors), **tower panel clamp, banners, toast, CoinFx clamp, backdrop resolution** (`mapCssWidth`): they read rects, `--map-*` (from `mapRectIn`) or the resolved constants, so they follow automatically.
- **CSS before `applyHudLayerSize` runs:** `#hud-layer` is `display:none` until a level starts, and `applyHudLayerSize` runs before Phaser boots. That matches today's `--rail-w`, which also has no fallback.

## Design

### Where the choice lives (R1–R3)

`src/data/layout.js` keeps `WORLD_*` and the `MIN_TOUCH_*` values, and adds:
- `TOUCH_HUD_CELL = 88`, which keeps the existing "44 CSS px on a 360-px phone" comment.
- `FINE_HUD_CELL = 52`, commented: mouse targets don't need 44 px, and 52 gives 2×52 = 104 rails.
- `RAIL_COLUMNS = 2`.
- `isPointerFine(win)` and `railMetricsFor({ pointerFine })`. `railWidth = RAIL_COLUMNS * hudCell`, `canvasWidth = WORLD_WIDTH + 2 * railWidth`, `hudK = hudCell / TOUCH_HUD_CELL`.
- Resolved exports: `POINTER_FINE`, `HUD_CELL`, `RAIL_WIDTH`, `CANVAS_WIDTH`, `HUD_K`.

Module evaluation runs once per page load, which is "once at boot". `src/main.js` (Phaser `width: CANVAS_WIDTH`), `viewport.js`, GameScene and MapEditorScene `setViewport(RAIL_WIDTH, …)`, CoinFx, `backgroundAsset.js` and `hudLayer.js` (`mapRectIn`, the transform) need **no code change**: they already import the resolved names. The only `hudLayer.js` change is one `setProperty('--hud-k', …)` line.

Alternative rejected: re-evaluating on a `matchMedia` change event. That would need the Phaser game size and camera viewport to resize at runtime, and the requirement is a boot-time choice.

### How rail content shrinks (R4–R6): option C, a `--hud-k` multiplier

| | A: inner wrapper at 176 + `transform: scale(k)` | B: CSS `zoom: k` | **C: `calc(Npx * var(--hud-k))`** |
|---|---|---|---|
| Wave popover | Shrinks to 59 % unless counter-scaled by 1/k. Its `offsetTopWithin` and `layer.offsetHeight` clamp would then mix layout spaces, because offsets ignore transforms. | Shrinks unless set back to `zoom: 1/k` | Unaffected by construction |
| Rail height | Wrapper must be laid out 720/k ≈ 1218 px tall to fill the rail | OK | OK |
| fitLabels (`offsetWidth`/`clientWidth` plus a Range-rect/element-rect ratio) | OK (ratio normalises) | Engine-dependent. Chromium changed how zoom affects rects and offsets in 128, Firefox only shipped `zoom` in 126, Safari keeps the legacy model. | OK: layout px = game px |
| railAnchorRect (rects) | OK | Engine-dependent | OK |
| Cost | Little CSS, fragile geometry | One rule, unreliable cross-browser | About 45 declarations, no JS geometry change |

**Chosen: C.** It keeps the invariant the whole 2.2 HUD depends on: inside `#hud-layer`, layout px equals game px. So fitLabels, WavePreviewPopover, railAnchorRect and the audit all work unchanged. The popover stays full size because its rules are never multiplied. With k = 1 on coarse pointers, `calc(24px * 1)` computes to exactly 24px, which gives R6. The risk is missing a declaration, and a guard test covers that (Testing, T4).

**Declarations to change in `index.html`.** Each becomes `calc(<px> * var(--hud-k))`:
- `#hud-layer` `--hud-label-inset: 4px`
- `#rail-left` box-shadow `-3px`
- `#rail-right` `gap: 28px` and box-shadow `3px`
- `:where(.hud-rail) button`: border `3px`, border-radius `12px`, inset ring `2px`, `gap: 2px`, `font-size: 24px`
- `.hud-stat` `gap: 1px`, `font-size: 24px`; `.hud-val` `28px`; `.hud-lbl` `24px`
- `#pause-btn:focus-visible` outline `2px` and offset `-3px`
- `.tower-btn .t-icon` `30px`, `.t-cost` `24px`, `.t-name` `24px`
- `#wave-btn` `font-size: 26px`
- `#hero-section` `gap: 10px` and padding `0 10px`
- `#hero-portrait` width, height and flex-basis `56px`, border `3px`, font-size `28px`
- `#hero-info` `gap: 5px`; `#hero-level` `24px`
- `#hero-hp-bg` `10px`/`3px`; `#hero-hp-fill` `3px`; `#hero-xp-bg` `8px`/`3px`; `#hero-xp-fill` `3px`
- `.ability-btn::after` radius `9px`
- `.ability-key` `24px` and letter-spacing `1px`; `.ability-name` `28px`; `.ability-cd` `24px` and min-height `24px`

**Not changed:**
- `.wave-preview` and `.wp-*` (R5).
- `--peek-gap`.
- The `@keyframes` glow radii (`8px` text-shadow), which are cosmetic.
- Everything outside `#hud-layer`, including the `(pointer: coarse)` overlay block. Those overlays are real CSS px and don't depend on rail width.

Also update the header comment (lines 17–29) to say cells are 88 game px on touch and 52 on mouse, with sizes multiplied by `--hud-k`. Update the fitLabels.js comment ("88-px cell" → "its cell"). Both are comment-only.

### Harness and audit (R7, R8)

- **`layoutAudit.js`:** `minTouchFor` reads `railMetricsFor({ pointerFine: false })`. Add the pure `railGeometryProblems({ device, pointerFine, canvasRect, rails })` with three checks:
  - A `hasTouch` device reporting fine gives `touch device reports pointer: fine`. This protects the phone gate if emulation drifts.
  - Each rail width must be within ±1 px of `railWidth * canvasRect.width / canvasWidth`.
  - Canvas aspect must be within 0.01 of `canvasWidth / WORLD_HEIGHT`.
- **`scripts/capture.mjs`:**
  - The in-page metrics also return `canvas: rect('#game canvas')` and `pointerFine: matchMedia(POINTER_FINE_QUERY).matches`, passed in as an argument.
  - The in-game audit adds `railGeometryProblems`.
  - `clickGamePoint` uses `railMetricsFor({ pointerFine })` read from the page.
  - `DEVICES` gains `desktop1440` (1440×900) and `desktop1080` (1920×1080) at `deviceScaleFactor: 1`. The existing `desktop` (1280×720) now exercises narrow rails.
  - Phone descriptors (iPhone, Pixel and iPad landscape: `isMobile` + `hasTouch`) report `pointer: coarse` in Chromium. Playwright's own mobile-viewport tests assert this. R7's audit checks it on every run anyway.

## Acceptance criteria

At `npm run build && npm run preview`, Playwright Chromium with a default mouse context, so `(pointer: fine)` is true:

| Viewport | Canvas CSS (w×h, top) | Map rect (left, w×h) ±2 px | Cell CSS |
|---|---|---|---|
| 1280×720 | 1280×619.4, top 50.3 | 89.5, 1101.1×619.4 | 44.7 |
| 1440×900 | 1440×696.8, top 101.6 | 100.6, 1238.7×696.8 | 50.3 |
| 1920×1080 | 1920×929.0, top 75.5 | 134.2, 1651.6×929.0 | 67.1 |

1. **AC1:** In game px, `game.scale.width === 1488`, `#rail-left`/`#rail-right` `offsetWidth === 104`, and a `.tower-btn` `offsetWidth === 52`. The CSS rects match the table: map rect from `--map-*`, cell from a `.rail-grid` child.
2. **AC2:** Every in-game target lies inside a rail. `npm run capture -- --screens --devices desktop,desktop1440,desktop1080` reports zero LAYOUT problems, including `railGeometryProblems`.
3. **AC3:** With a real mouse (`page.mouse`, since Phaser ignores synthetic events), each of these works:
   - every tower button arms a tower, and `#cancel-btn` appears and cancels;
   - pause and resume;
   - speed;
   - Codex opens and closes;
   - Send Wave sends;
   - ability Q fires once unlocked;
   - Exit opens its confirm.
4. **AC4:** No rail label's text extends past its button or stat cell content box after `document.fonts.ready`. Use the same measure as fitLabels (`textWidthOf` / `offsetWidth` ≤ `clientWidth` − padding + 0.5).
5. **AC5:** Hovering `#wave-btn-wrap` shows `.wave-preview` with computed `.wp-title` font-size 28px (game px, unchanged) and `min-width` 440px. Its rect is fully on-screen and lies left of `#rail-right`, over the map.
6. **AC6:** Peek cards (tower tooltip, ability card) anchor to the narrow rails' inner edge, using the existing `placeLeftOf` / `railAnchorRect` behaviour.
7. **AC7 phone invariance:** At 844×390 iPhone emulation, plus `phone932`, `iphone`, `pixel` and `ipad`: `game.scale.width === 1632` and cells are 88. Build a **rail fingerprint**: for every element under `#hud-layer`, its rect, computed font-size, border widths, padding, border-radius and gap. The fingerprint must be identical between the base branch and this branch. Capture `--screens` on those devices must report the same LAYOUT result as the baseline.
8. **AC8:** MapEditorScene opens on a fine pointer with the map between 104-px bands, and a click places a point at the clicked world position.
9. **AC9:** Spot-check desktop Safari and Firefox at one window size each. Rails are narrow, labels fit, and the popover is readable. This only needs `calc`/`var` support; no `zoom` is involved.

## Testing

- **T1 `src/data/layout.test.js` (new):**
  - `railMetricsFor` gives exact fine and coarse objects, `railWidth === 2*hudCell`, and `canvasWidth === WORLD_WIDTH + 2*railWidth`.
  - `isPointerFine` covers `undefined`, `{}`, `matchMedia → null`, a `matchMedia` that answers only the fine query, and a coarse answer.
  - The resolved exports in jsdom equal the coarse metrics. This guards the assumption that keeps the existing suite valid.
- **T2 `src/data/layout.fine.test.js` (new):** Run `vi.stubGlobal('matchMedia', q => ({ matches: q === POINTER_FINE_QUERY }))`, then `vi.resetModules()`, then dynamically import `layout.js` and `hudLayer.js`. Check:
  - 1488 / 104 / 52 / k.
  - `applyHudLayerSize` publishes `--rail-w 104px`, `--hud-cell 52px`, `--canvas-w 1488px` and `--hud-k`.
  - `mapRectIn` at a 1440-wide canvas gives left ≈ 100.65 and width ≈ 1238.7.
- **T3** `hudLayer.test.js`: add an assertion that `--hud-k` is `'1'` in jsdom. `layoutAudit.test.js`: add `railGeometryProblems` cases (touch reporting fine, rail too wide or narrow, wrong aspect, clean fine and coarse), and `minTouchFor` is unchanged.
- **T4 rail CSS guard (new, node env like `mobile.test.js`):**
  - Parse `index.html`'s `<style>`: strip comments, drop `@keyframes`, flatten `@media`.
  - Select every rule whose selector, with pseudo-classes and pseudo-elements removed, matches an element inside `#hud-layer` in the static markup. Load the markup into a jsdom instance for this.
  - Exclude `.wave-preview` and its subtree.
  - Assert that every `Npx` in those rule bodies sits inside `calc(Npx * var(--hud-k))`.
  - Selecting by DOM membership, not a hand-kept selector list, keeps out `.ability-card`, `#open-codex-ms` and `#hero-mgmt-*`.
  - **Prove it fails:** revert one declaration, such as `.hud-val`, and confirm this test is the one that fails.
- The full suite must stay green with the existing 2229+ tests unchanged. Report the new count.
- Browser verification covers AC1–AC9 on the production build (`npm run preview`), using frozen-frame probes (pause the scene and read live objects or DOM) and real `page.mouse` input. Check the Vercel preview after pushing.

## Out of scope

- Option (c): flexible rails that absorb extra aspect ratio.
- Re-choosing the layout on resize or on pointer-device change.
- Rearranging rail content to use the freed vertical space.
- Resizing peek cards, overlays or the wave popover.
- Any change to the phone or tablet layout.
- Merging into `main`. The PR targets `visual/integration`.

## Open questions

1. **Small desktop windows.** At window widths under about 1100 px, rail text drops to about 10 CSS px (1024 wide: 9.8 px). Recommendation: accept, since these windows are rare on desktop. The alternative is to also require a minimum `screen.width` at boot before choosing narrow rails. That is one extra condition in `isPointerFine`'s caller, but it adds a second boot-time input.
