# Title Screen & Story World Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Replace the instant jump to map select with a space title screen whose "LAST LIGHT" logo has a beam sweep.
- Turn map select into a story world map: a deep-space vista with planets, a route from Earth to the hive core, a receding Veth front line, an act banner and a briefing card.
- Animate the campaign advancing after a first-clear win.

**Architecture:**
- Pure modules in `src/systems/` hold every rule: progress, acts, briefing model, arrival timeline, route geometry, layout fit and starfield. Tunables live in `src/data/`.
- Two thin DOM screens (`#title-screen`, `#map-select`) draw on full-viewport 2D canvases (`SpaceCanvas`, `WorldMapRenderer`) for everything without words.
- Everything with words or taps is DOM.
- The scenes (`TitleScene`, `MapSelectScene`, a surgical `GameScene` change) wire them together, with listeners in add/remove pairs.

**Tech Stack:** Phaser 3.88 (scene lifecycle only), vanilla ES modules, DOM/CSS (3.1 kit `.ui-panel`/`.ui-btn`), 2D canvas, Vitest 2 + jsdom, Playwright (`scripts/capture.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-23-title-world-map-design.md`. Every task implicitly includes the spec sections it names. Read them, don't guess.

## Global Constraints

- Tunables only in `src/data/` (`campaign.js`, `worldMap.js`, `title.js`). No literal timings, colours or positions in `src/ui/` or `src/scenes/`.
- No canvas text anywhere. All words are DOM.
- Phaser scene data: always pass an object. `TitleScene` → `scene.start('MapSelectScene', {})`. `GameScene` → `scene.start('MapSelectScene', { from })`. Never a bare `scene.start('MapSelectScene')` (spec §4.3, `Systems.js:740`).
- `this.events.once('shutdown', …)`, never `on`. Every window/document listener, rAF, timer and fonts listener is added and removed as a pair in the same module.
- Kit CSS: paint only through `.ui-btn`/`.ui-panel` and `var(--ui-*)`. Sizes are `calc(N * var(--ui-u))`. Fonts are `var(--ui-font-*)`. No `title=` attributes (use `aria-label`).
- No `font-size` below 11 px in `index.html` outside rail `calc(… * var(--hud-k))` rules (#50a). Use `var(--ui-fs-xs)` (11).
- Coarse pointer: every DOM control ≥ 44×44 CSS px. Fine pointer: LAUNCH ≥ 48 px tall.
- Layout classes come from `COMPACT_MAX_HEIGHT_PX` (500) in `src/data/mobile.js`: `compact` when the viewport height is ≤ 500, else `tall`.
- Reduced motion = registry `ambientMotion === false`, read live, applied as the `.motion-off` class.
- Keep ids `#map-select`, `#map-overworld`, `#map-featured`, `#featured-name`, `#featured-play`, `#total-stars`, `#lifetime-stats`, the `#open-*` buttons, `#fullscreen-btn`, and `.ow-node[data-map-id]`. The harness and tests use them.
- Copy (verbatim):
  - `TAP TO START` / `CLICK TO START`
  - `▶ LAUNCH`
  - `↩ World Map`
  - `SOL COMMAND`
  - `MISSION ${n}`
  - `New threat: ${list}`
  - `Towers upgrade to Tier ${n}`
  - `Front line: ${r} of ${total} sectors retaken`
  - `CAMPAIGN COMPLETE` / `The war is won`
  - `LAST LIGHT · HIVE CORE`
  - `EARTH`
- Tests mocking Phaser follow the existing `vi.mock('phaser', …)` pattern in `src/scenes/MapSelectScene.*.test.js`. Every new test is mutation-checked: break the line it guards and see that test fail. Record that in the task report.
- Models: sonnet for the pure-module tasks (1–4); opus for UI, layout, Phaser-lifecycle and harness tasks (5–10) and for all reviews.

## Review Focus

1. **Garbage in the save's `maps[]`** (NaN, negative, `"3"`, > 3): a value that isn't a positive finite number counts as 0 stars, so the frontier never jumps past it. Test in Task 1.
2. **`document.fonts` missing, or `load()` rejecting** (old WebViews, privacy modes): the title must still reach `lit`, and the prompt must still show. Test in Task 5.
3. **Double-tapping "↩ World Map"** on the results overlay: exactly one `scene.start`. A second start mid-shutdown would run `create` twice and stack listeners. Test in Task 6.
4. **A locked node reached by keyboard** (Tab + Enter/Space): nothing selects and no card opens. Locked nodes are `disabled` buttons, and disabled controls fire no pointer events (memory), so hover affordances live on the wrapper. Test in Task 8.
5. **Meta-bar overlays across three map entries** (Upgrades, Heroes, Audio, Story, Codex) after the kit restyle: each still opens and closes, and enter → shutdown ×3 leaves zero net document/window listeners. Test in Task 8.

---

### Task 1: Campaign data and progress (pure)

**Files:**
- Create: `src/data/campaign.js`, `src/systems/campaignProgress.js`
- Test: `src/systems/campaignProgress.test.js`

**Interfaces:**
- Produces:
  - `ACTS: Array<{ id: 'I'|'II'|'III', name: string, mapIds: number[] }>`
  - `OBJECTIVES: Record<storyKey, string>`
  - `CAMPAIGN_COMPLETE = { act: 'CAMPAIGN COMPLETE', objective: 'The war is won' }`
  - `starsArray(saveMgr, maps) → number[]`: sanitized, one entry per map
  - `frontierIndex(stars: number[]) → number`: index of the first entry that isn't > 0, or `stars.length`
  - `sectorsRetaken(stars) → number`: equals `frontierIndex`
  - `actForMap(id, acts = ACTS) → act`
  - `bannerFor(stars, { maps = MAPS, acts = ACTS, objectives = OBJECTIVES } = {}) → { act: string, objective: string, sectors: string, complete: boolean }`

- [ ] **Step 1: Write the failing tests**

```js
// Derive from the data, never literal ids (memory: derived test lists).
it('ACTS covers every MAPS id exactly once, contiguous and in order', () => {
  expect(ACTS.flatMap(a => a.mapIds)).toEqual(MAPS.map(m => m.id));
});
it('every storyKey has an objective', () => {
  for (const m of MAPS) expect(OBJECTIVES[m.storyKey], m.storyKey).toMatch(/\S/);
});
it('frontierIndex: fresh 0, partial 3, all cleared = length', () => {
  expect(frontierIndex(Array(10).fill(0))).toBe(0);
  expect(frontierIndex([3,2,1,0,0,0,0,0,0,0])).toBe(3);
  expect(frontierIndex(Array(10).fill(1))).toBe(10);
});
it('gap save counts only the contiguous prefix', () => {
  const s = [3,0,2,0,0,0,0,0,0,0];
  expect(frontierIndex(s)).toBe(1); expect(sectorsRetaken(s)).toBe(1);
});
it('garbage star values count as uncleared', () => {          // Review Focus 1
  expect(frontierIndex([3, NaN, 2])).toBe(1);
  expect(frontierIndex([3, -1, 2])).toBe(1);
  expect(frontierIndex([3, '3', 2])).toBe(1);
  expect(starsArray({ getStars: id => [3, NaN, 7][id] }, MAPS.slice(0, 3))).toEqual([3, 0, 3]);
});
it('actForMap at every boundary', () => {
  for (const act of ACTS) for (const id of act.mapIds) expect(actForMap(id).id).toBe(act.id);
});
it('banner in progress and complete', () => {
  expect(bannerFor([3,2,1,0,0,0,0,0,0,0])).toEqual({ act: 'ACT I · RETAKE SOL',
    objective: OBJECTIVES[MAPS[3].storyKey], sectors: 'Front line: 3 of 10 sectors retaken', complete: false });
  expect(bannerFor(Array(10).fill(3))).toEqual({ act: 'CAMPAIGN COMPLETE',
    objective: 'The war is won', sectors: 'Front line: 10 of 10 sectors retaken', complete: true });
});
```

- [ ] **Step 2: Run** `npx vitest run src/systems/campaignProgress.test.js`. Expect FAIL (module not found).
- [ ] **Step 3: Implement.**
  - `campaign.js` holds the spec §3.1 `ACTS` and the ten `OBJECTIVES` lines from the §3.1 table, keyed by `storyKey`, each with a one-line source comment.
  - In `campaignProgress.js`, `starsArray` clamps to an integer in 0–3, and anything non-finite or not a number becomes 0. `bannerFor` follows spec §3.2 exactly.
- [ ] **Step 4: Run.** PASS. Mutation-check the gap and garbage tests.
- [ ] **Step 5: Commit** `feat(world-map): campaign acts, objectives and progress`.

### Task 2: Briefing card model (pure)

**Files:**
- Create: `src/systems/briefingCard.js`
- Test: `src/systems/briefingCard.test.js`

**Interfaces:**
- Consumes: `STORY_SEQUENCES`, `briefKey` (`src/data/story.js`); `MAP_WAVES` (`src/data/waves.js`, `{ [mapId]: Array<Array<{type}>> }`); `ENEMY_DEFS` (`src/data/enemies.js`, `{ [type]: { name, flying } }`); `MAPS`.
- Produces:
  - `commandQuote(storyKey) → string`
  - `newThreats(mapId) → string[]`: e.g. `['Veth Phantom (flying)']`, ordered by first appearance
  - `briefingCardModel(mapId, stars: number[]) → { missionNo, name, quote, threats, maxTier, stars, launchable }`
  - `maxTier` comes from the field `GameScene`/`_renderFeatured` uses today for "Towers upgrade to Tier N". Grep `featured-tier` in `MapSelectScene.js`.

- [ ] **Step 1: Failing tests.**
  - `every map's quote is the first command panel of its brief, verbatim`: derived by iterating `STORY_SEQUENCES[briefKey(m.storyKey)].panels.find(p => p.speaker === 'command').text`.
  - `newThreats matches an independent re-derivation`: the test builds its own `seen` set across `MAP_WAVES[0..id-1]` and compares names; no literal list.
  - `a map that introduces nothing returns []`: pick the first id whose re-derived list is empty, found by search rather than hardcoded.
  - `flying types carry "(flying)"`.
  - `model: missionNo = id + 1, launchable = unlocked by stars (id 0 always; else stars[id-1] > 0)`.
- [ ] **Step 2: Run.** FAIL.
- [ ] **Step 3: Implement** the three functions.
- [ ] **Step 4: Run.** PASS. Mutation-check (drop the `seen` carry-over and see the re-derivation test fail).
- [ ] **Step 5: Commit** `feat(world-map): briefing card model from story and wave data`.

### Task 3: Arrival plan and timeline (pure)

**Files:**
- Create: `src/data/worldMap.js` (only the `ARRIVAL` export in this task), `src/systems/arrivalPlan.js`
- Test: `src/systems/arrivalPlan.test.js`

**Interfaces:**
- Consumes: `frontierIndex` (Task 1).
- Produces:
  - `ARRIVAL = { focusMs: 300, stampStartMs: 300, stampEachMs: 150, stampScale: 1.6, flyStartMs: 750, flyMs: 2000, frontStartMs: 1750, frontMs: 1000, lightStartMs: 2750, lightMs: 300, cardAtMs: 3050, totalMs: 3200 }`
  - `planArrival({ from, stars }) → { kind: 'none'|'stamp'|'advance'|'complete', mapId, toId, newStars, prevStars }`
    - `stars` is the post-win array.
    - The frontier before the win is `frontierIndex(stars with [from.mapId] = from.prevStars)`.
  - `arrivalFrame(plan, tMs, A = ARRIVAL) → { focus, stamped, shipT, trailT, frontT, nextLit, cardOpen, done }`
    - `focus`, `shipT`, `trailT` and `frontT` are in [0, 1], eased with ease-in-out cubic.
    - `stamped` is the integer count of stars shown.
  - `easeInOut(t)`

- [ ] **Step 1: Failing tests.**
  - `advance only for a first clear of the frontier`: `from = { mapId: 0, result: 'victory', prevStars: 0, stars: 2 }`, `stars = [2,0,…]` → `{ kind: 'advance', mapId: 0, toId: 1, newStars: 2 }`.
  - `none` for each of:
    - defeat
    - abandon
    - `from` undefined, `{}` or `{ mapId: 'x' }`
    - a replay with ≤ stars
    - a gap-save first clear: `stars = [3,0,1,…]`, `from = { mapId: 2, prevStars: 0, stars: 1, result: 'victory' }`
  - `stamp`: `prevStars: 1, stars: 3` on a cleared map.
  - `complete`: a first clear of the last map (`MAPS.length - 1`).
  - `arrivalFrame` cases:
    - At `t = Infinity`: `done: true`, `shipT/trailT/frontT === 1`, `stamped === newStars`, `nextLit` (advance), `cardOpen`.
    - Monotonic: sample t = 0…3300 in 50-ms steps; no field ever decreases.
    - Beat boundaries: `stamped === 0` at t 299 and 1 at t 300. `shipT === 0` at 750 and 1 at 2750. `frontT === 0` at 1750. `nextLit` false at 2749 and true at 2750. `cardOpen` true at 3050. `done` at 3200.
    - `stamp` plan: `done` once the last star is stamped; `shipT` stays 0.
    - `none`: done at t = 0.
- [ ] **Step 2: Run.** FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** PASS. Mutation-check the gap-save `none` case (remove the frontier condition and see it fail).
- [ ] **Step 5: Commit** `feat(world-map): first-clear arrival plan and timeline`.

### Task 4: Route geometry, layout fit, starfield (pure)

**Files:**
- Create:
  - `src/systems/worldRoute.js`
  - `src/systems/worldMapLayout.js`
  - `src/systems/starfield.js`
  - `src/data/title.js`
  - `scripts/captureDevices.mjs`: moves the `DEVICES` table out of `scripts/capture.mjs` verbatim. `capture.mjs` then imports it.
- Modify: `src/data/worldMap.js` (add `ROUTE`, `LAYOUT`, `PLANETS`, `NEBULAE`, `BELT`, `SUN_GLARE`, `HAZE`, `TRAIL`, `SHIP`, `STARS_MAP`, `BACKDROP_ART`), `src/data/maps.js` (remove `overworldPos`), `src/data/maps.test.js` (remove its case), `scripts/capture.mjs` (import `DEVICES`)
- Test: `src/systems/worldRoute.test.js`, `src/systems/worldMapLayout.test.js`, `src/systems/starfield.test.js`

**Interfaces:**
- Produces:
  - `layoutClass({ width, height }) → 'tall'|'compact'`
  - `routeFrameFor(viewport, cls, L = LAYOUT) → { x, y, w, h }`
    - This is the single source for the frame. The scene publishes the same numbers to CSS as custom properties `--wm-top`, `--wm-card-w`, `--wm-stats` and `--wm-gutter`, so CSS and math can't drift.
    - The frame is left of the card (width `clamp(L.card[cls].min, L.card[cls].vw * width, L.card[cls].max)`), below the top band (`L.topBand[cls]`) and above the stats strip (`L.statsStrip[cls]`, 0 when compact), inset by `L.gutter`.
  - `nodeRects(frame, route, cls, L) → Array<{ id, cx, cy, w, h }>`: the rect includes the label (tall: `L.labelPx.tall` below; compact: the stars line only)
  - `worldMapProblems({ nodes, frame, viewport, coarse, minTouchPx = 44 }) → string[]`: overlap, outside frame (4-px margin), outside viewport, non-locked node < 44 on coarse
  - `routePoints(frame, route) → Array<{x, y}>`: Earth first, then map 0…9
  - `routeParamAt(points, index) → [0, 1]`: arc-length fraction at point `index`
  - `frontRadius(points, frontier) → px`: `hypot(hive − points[frontier + 1])`; 0 when `frontier ≥ MAPS.length`
  - `makeStars(seed, layers, w, h) → Array<{ x, y, layer, phase }>`, using `SeededRandom`
  - `advanceStars(stars, dtMs, w, layers)`: mutates x, wraps left → right, returns the array
  - `TITLE`, `TITLE_PROMPT`, `STARS_TITLE`, with the values in spec §3.4
  - `DEVICES` from `scripts/captureDevices.mjs`

- [ ] **Step 1: Failing tests.**
  - `fit: no problems on every capture device`: iterate `Object.entries(DEVICES)` using each `viewport`, with `coarse = !!d.hasTouch` and `cls = layoutClass(viewport)`, and assert `worldMapProblems(...)` is `[]`. Include `desktop1080`.
  - `front-line consistency: distance to hive strictly decreases Earth → node 9, per device frame`.
  - `frontRadius at 0, mid, all cleared (0)`.
  - `routeParamAt: 0 at Earth, 1 at hive, increasing`.
  - `starfield: same seed → same stars`, `wraps`, `stays in bounds after 10 000 steps`.
  - `worldMapProblems flags a synthetic overlap, an off-frame node and a 40-px coarse node`: hand-built rects prove the checker can fail.
- [ ] **Step 2: Run.** FAIL.
- [ ] **Step 3: Implement.**
  - Hand-tune `ROUTE.nodes` starting from the mockup shape (`docs/captures/3.4-title-world-map/mockups/world-map-vista.html`, with its `SQ` squeeze applied) until the fit and monotonic tests pass on every device.
  - Add `ROUTE.compact` overrides only if one set can't pass both.
  - `PLANETS` are the 7 ids in spec §3.3, with values seeded from the mockup's `planet(...)` calls, converted to route-frame coords.
  - `LAYOUT` holds node diameters (tall 56/final 64, compact 44/final 50), `inputGuardMs: 250` and `maxCanvasDpr: 2`.
- [ ] **Step 4: Run** the three tests, then `npm test`. All PASS; the `maps.test.js` `overworldPos` case is gone. Run `node scripts/capture.mjs --help`, or a dry import, to confirm `capture.mjs` still loads.
- [ ] **Step 5: Commit** `feat(world-map): route geometry, layout fit rule and starfield`.

### Task 5: Title screen and TitleScene

**Files:**
- Create: `src/ui/SpaceCanvas.js`, `src/ui/TitleScreen.js`, `src/scenes/TitleScene.js`
- Delete: `src/scenes/MenuScene.js`
- Modify: `src/main.js` (scene array), `src/scenes/BootScene.js:118` (`scene.start('TitleScene', {})`), `index.html` (add `#title-screen` markup + CSS)
- Test: `src/ui/TitleScreen.test.js`, `src/scenes/TitleScene.test.js`

**Interfaces:**
- Consumes: `TITLE`, `TITLE_PROMPT`, `STARS_TITLE` (Task 4); `makeStars`, `advanceStars` (Task 4); `POINTER_FINE_QUERY` (`src/data/mobile.js`).
- Produces:
  - `new SpaceCanvas(canvasEl, { maxDpr })` with `.start(drawFn(ctx, dtMs, w, h))`, `.redraw()`, `.destroy()`
    - It no-ops when `getContext('2d')` is null (jsdom).
    - It pauses while `document.hidden`; its `visibilitychange` listener is a pair.
  - `new TitleScreen(rootEl)` with `.show({ motion: boolean, pointerFine: boolean, onStart: () => void })` and `.destroy()`
    - `#title-screen[data-phase]` goes `waiting` → `sweep` → `lit`.
  - `TitleScene` (key `'TitleScene'`)

- [ ] **Step 1: Failing tests (jsdom).**
  - `click calls onStart exactly once even on a double click`.
  - `Enter and Space start; other keys don't`.
  - `destroy removes click + keydown listeners`: spy on `add/removeEventListener` and count pairs.
  - `motion off → data-phase "lit" immediately, no sweep class`.
  - `prompt text: fine → CLICK TO START, coarse → TAP TO START`.
  - `document.fonts undefined or load() rejecting → still reaches "lit" within fontWaitMs + sweep + settle` (fake timers; Review Focus 2).
  - `TitleScene: onStart → scene.start('MapSelectScene', {})`, called with an **object**.
  - `shutdown destroys the screen; enter/shutdown ×3 leaves no net listeners`.
- [ ] **Step 2: Run.** FAIL.
- [ ] **Step 3: Implement** per spec §2.1:
  - Markup: `#title-screen` with `role="button"`, `tabindex="0"`, `aria-label="Start game"` and no `title=`. It contains a `<canvas>`, `.title-logo` and `.title-prompt`.
  - The CSS beam sweep uses `background-clip: text` with `-webkit-` prefixes, with durations read from `--title-*` vars that `TitleScreen` sets from `TITLE`.
  - `.motion-off` disables the animations.
  - The logo size is a `clamp()` that never wraps at 750 px.
  - z-order: below `#rotate-prompt`.
- [ ] **Step 4: Run** the tests and then `npm test`. PASS. Then run `npm run build`: OK.
- [ ] **Step 5: Commit** `feat(title): space title screen with beam-sweep logo`.

### Task 6: GameScene return data

**Files:**
- Modify: `src/scenes/GameScene.js` (`_onVictory` ≈1795, `_onDefeat` ≈1830, `msg-btn` handler ≈382, labels ≈1823/1840)
- Test: `src/scenes/GameScene.returnToMap.test.js`

**Interfaces:**
- Produces: `msg-btn` → `this.scene.start('MapSelectScene', { from: { mapId, result: 'victory'|'defeat'|'abandon', prevStars, stars } })`.
  - Before a victory, `stars` is the current saved stars. `prevStars` is read before `setStars`.
  - The handler is guarded so a second click does nothing (Review Focus 3).
  - The label is `↩ World Map`.

- [ ] **Step 1: Failing tests.** Base them on the existing `GameScene.exit.test.js` harness.
  - `victory on a fresh map 0 passes { mapId: 0, result: 'victory', prevStars: 0, stars: N }`.
  - `prevStars is read before setStars`: seed 1 star, win with 3, assert `prevStars: 1`. Mutation-check by moving the read after `setStars`.
  - `defeat → 'defeat'`, `exit-confirm → 'abandon'`.
  - `double click starts once`.
  - `label reads ↩ World Map on victory and defeat`.
- [ ] **Step 2: Run.** FAIL.
- [ ] **Step 3: Implement.** Keep it surgical; GameScene stays the only owner of `#game-msg`.
- [ ] **Step 4: Run** `npm test`. PASS.
- [ ] **Step 5: Commit** `feat(game): return to the world map with the mission result`.

### Task 7: World map markup, kit meta bar and the 11-px floor

**Files:**
- Modify: `index.html`
  - `#map-select`: remove `#map-select-title`
  - `#map-meta-bar` buttons → `class="ui-btn"`, each with an icon span + a label span and an `aria-label`
  - add `#wm-backdrop` and `#wm-story` canvases inside `#map-overworld`
  - add `#wm-banner` with `.wm-act`, `.wm-objective`, `.wm-sectors`
  - add `#wm-earth-tag` and `#wm-hive-tag`
  - `#map-featured` → `.ui-panel` with `#featured-mission`, `#featured-name`, `#featured-quote`, `#featured-threats`, `#featured-tier`, `#featured-stars` and `#featured-play.ui-btn.ui-btn--currency` reading `▶ LAUNCH`
  - CSS: the tall/compact rules from spec §5, driven by the `--wm-*` vars; compact meta bar icon-only at 44×44
  - #50a: every sub-11-px rule → `var(--ui-fs-xs)`
  - delete the old `#open-*`/`#fullscreen-btn`/`#featured-*` paint rules and `.ow-connectors`/`.ow-path-*`
- Modify: `src/ui/kitRollout.test.js`: add the meta-bar buttons, `#map-featured` and `#featured-play` to `SURFACES`
- Create: `src/ui/typeFloor.test.js`: the new guard (no `font-size` < 11 px outside `--hud-k` calc rules)
- Test: the existing guards `themeCss`, `railCss`, `noNativeTitles` and `kitRollout`, plus the new `typeFloor`

**Interfaces:**
- Produces: the DOM ids above (Task 8 renders into them) and the CSS custom properties `--wm-top`, `--wm-card-w`, `--wm-stats`, `--wm-gutter` and `--wm-node` (Task 8 sets them from `LAYOUT`).

- [ ] **Step 1: Write `typeFloor.test.js`.** Parse `index.html` `<style>` the same way `themeCss.test.js` does. It must fail on today's file, listing the 7 selectors named in spec §7.1-7.
- [ ] **Step 2: Run.** FAIL with those 7.
- [ ] **Step 3: Edit the markup and CSS.** Extend `kitRollout` `SURFACES`.
- [ ] **Step 4: Run** `npm test`. The four guards and `typeFloor` pass. The existing `MapSelectScene.*.test.js` fixtures that read `index.html` may now fail; that is expected, and Task 8 fixes them. If any fail, record which.
- [ ] **Step 5: Commit** `feat(world-map): markup, kit meta bar (#41f) and 11-px type floor (#50a)`.

### Task 8: World map scene (static state)

**Files:**
- Create: `src/ui/WorldMapRenderer.js`, `src/ui/BriefingCard.js`, `src/systems/worldBackdrop.js` (`worldBackdropSource(registered) → 'procedural'|url`)
- Modify: `src/scenes/MapSelectScene.js` (rewrite `create`, `_populateOverworld`, `_renderFeatured`, `shutdown`; keep the overlay/meta binders), `src/scenes/BootScene.js` (404-tolerant probe of `BACKDROP_ART`, like portraits; registry key `worldBackdrop`)
- Test: `src/scenes/MapSelectScene.worldMap.test.js`, `src/ui/BriefingCard.test.js`, `src/systems/worldBackdrop.test.js`; update the existing `MapSelectScene.*.test.js` fixtures

**Interfaces:**
- Consumes:
  - `starsArray`, `frontierIndex`, `bannerFor` (Task 1)
  - `briefingCardModel` (Task 2)
  - `layoutClass`, `routeFrameFor`, `nodeRects`, `routePoints`, `routeParamAt`, `frontRadius` (Task 4)
  - `SpaceCanvas` (Task 5)
  - `classifyOverworld` (existing)
- Produces:
  - `new WorldMapRenderer({ backdrop: HTMLCanvasElement, story: HTMLCanvasElement, maxDpr, source })` with `.resize(frame, viewport)`, `.render({ points, trailT, frontR, frontAlpha, ship: { param }, hiveDim })` and `.destroy()`
    - `trailT` and `ship.param` are route params in [0, 1].
    - The backdrop is cached offscreen and rebuilt only on `resize`.
    - It no-ops without a 2D context.
  - `renderBriefingCard(rootEl, model)`
  - `MapSelectScene` sets `#map-overworld[data-frontier]` and `data-ready="1"` once the input guard ends
  - `MapSelectScene._layout()`: re-measures, recomputes the frame, sets the `--wm-*` vars, positions the nodes and redraws. It is bound to `resize`, `orientationchange` and `document.fonts` `loadingdone` as pairs.

- [ ] **Step 1: Failing tests.**
  - The nodes are `<button>`s in route order.
  - Locked nodes are `disabled`; keyboard Enter on one changes nothing (Review Focus 4).
  - The selected default is the frontier.
  - Banner text equals `bannerFor`.
  - The card shows the Command quote and `▶ LAUNCH`.
  - LAUNCH starts `GameScene` with `{ mapId, heroId }`.
  - The `inputGuardMs` window swallows a click on `#featured-play` (fake timers); after it ends, `data-ready="1"`.
  - `campaign_intro` plays on first entry only.
  - Enter → shutdown ×3 leaves zero net window/document listeners and no live rAF. Count add/remove pairs the way the 2026-08-17 leak test does; this covers Review Focus 5. All meta-bar overlays still open and close.
  - `worldBackdropSource`: `false` → `'procedural'`, a URL → the URL.
- [ ] **Step 2: Run.** FAIL.
- [ ] **Step 3: Implement.**
  - The renderer draws spec §2.2's backdrop: gradient, sun glare, nebulae, 2-layer drift, belt, the 7 planets from `PLANETS` (bands, rings, cracks, glow, night side as in the mockup), haze, front-line dashed arc, route (gold travelled / dashed ahead) and the ship chevron with an amber engine.
  - `.motion-off` stops the drift and the `next` pulse.
  - Reduced motion is read live from the registry.
  - Node `<img>` art keeps the existing `onerror` → `.ow-node-fallback` numbered circle.
  - Earth and hive tags are positioned from `routePoints`.
  - Keep `playMusic('menu')` and confirm, in `MapSelectScene.menuMusic.test.js`, that it does not restart a track that is already playing (spec §2.1 audio).
- [ ] **Step 4: Run** `npm test` (full suite). PASS, then `npm run build`.
- [ ] **Step 5: Controller live check (not the implementer).**
  - Serve the production build and look at 1440×900 and iPhone 14 with seeded saves (b) and (c) from spec §7.4.
  - The vista must match the approved mockup and the layout must be readable.
  - Fix before Task 9.
- [ ] **Step 6: Commit** `feat(world-map): story world map with vista, route, banner and briefing card`.

### Task 9: Post-win movement

**Files:**
- Modify: `src/scenes/MapSelectScene.js` (arrival driver)
- Test: `src/scenes/MapSelectScene.arrival.test.js`

**Interfaces:**
- Consumes: `planArrival`, `arrivalFrame`, `ARRIVAL` (Task 3); `WorldMapRenderer.render` (Task 8); `routeParamAt` (Task 4).
- Produces: `#map-overworld[data-arrival]` with the values `none|waiting|playing|done`.

- [ ] **Step 1: Failing tests (fake timers, rAF stubbed).**
  - `create({ from: first clear of map 0 })` → `data-arrival="playing"`. After 3200 ms: `done`, `data-frontier="1"`, `#featured-name` = `MAPS[1].name`, `.ow-node[data-map-id="1"]` has `next`.
  - A `pointerdown` during playing → `done` immediately; that event's `stopPropagation` and `preventDefault` were called, no node changed selection and no `scene.start` happened.
  - The skip handler is removed after done (pair count).
  - A story dialog open on entry → `waiting` until the dialog's close callback, then `playing`.
  - Motion off → `done` at once, with the next node selected and the card open.
  - `create({})` after a `create({ from })` entry → `none` (no replay).
  - A `stamp` plan only re-stamps; the card stays on that mission.
  - Defeat → `none`, and that mission is selected.
  - A `complete` plan → the banner complete, `frontAlpha` 0 and `hiveDim` 1 passed to the last `render`.
- [ ] **Step 2: Run.** FAIL.
- [ ] **Step 3: Implement.**
  - One rAF loop drives `arrivalFrame(plan, now - t0)` into node classes, stamped stars, `render(...)` and the banner cross-fade.
  - The skip handler is a capture-phase `pointerdown` + `keydown` on `#map-select`.
  - Resize mid-flight keeps the fractions (spec §5).
  - A hidden tab jumps to the end state on return.
- [ ] **Step 4: Run** `npm test`. PASS.
- [ ] **Step 5: Commit** `feat(world-map): post-win movement to the next mission`.

### Task 10: Harness — title step, post-win, audits

**Files:**
- Modify: `src/systems/deviceFlow.js` (`FLOW_STEPS`: insert `{ n: 2, id: 'title' }`, renumber 3–18), `src/systems/deviceFlow.test.js` (step-table literal), `scripts/capture.mjs`
- Create: `scripts/worldMapAudit.mjs` (page-side metrics → `worldMapProblems`), only if `capture.mjs` gets too long to hold it; otherwise inline it

**Interfaces:**
- Consumes: `worldMapProblems` (Task 4); the `data-*` hooks (Tasks 5, 8, 9).

- [ ] **Step 1: Update `deviceFlow.test.js`** to the new 17/18-step table. Run it: FAIL.
- [ ] **Step 2: Update `FLOW_STEPS` and `capture.mjs`** per spec §7.2 and §7.3:
  - `boot` expects `#title-screen` visible and `#story-dialog` hidden
  - `title` does a real tap at the centre
  - `play` waits for `#map-overworld[data-ready="1"]`
  - `MAP_SELECT_TARGETS` adds the meta bar and unlocked nodes
  - the live `worldMapProblems` audit
  - `--screens` adds `00-title`/`00b-title-lit`
  - the rotation start clicks `#title-screen`
  - the post-win sequence runs in a **new context** on map 0: `07b-arrival-mid`, skip tap, `07c-arrival-done` with the asserted hooks
  - one `reducedMotion: 'reduce'` run on `desktop1440` + `iphone`
  - one woff2-blocked run
- [ ] **Step 3: Run** `npm test`, then `npm run matrix`. Expect **desktop 17/17, iphone/pixel/ipad 18/18**.
- [ ] **Step 4: Run** `npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad`. Expect zero problems. **Look at every screenshot** against spec §8.
- [ ] **Step 5: Commit** `test(harness): title step, world-map audit and post-win captures`. Commit the screenshots into `docs/captures/3.4-title-world-map/`.

### Final: verification and PR (controller)

1. Final whole-branch review on opus against the spec, then one fix wave.
2. Live smoke on the production build (`npm run build && npm run preview`, the worktree's own Playwright) at 1440×900 and iPhone 14 landscape, covering spec §7.4 (a)–(d), plus real-input title dismissal and LAUNCH. Run a separate browser-acceptance agent over spec §8.
3. Gates, all green:
   - `npm test` (report the count)
   - `npm run build`
   - `npm run matrix`
   - `capture --screens` (5 devices, zero problems)
4. Tick 3.4 in the roadmap. Add a dated line to `.claude/notes.md`, closing #41c, #41f and #50a. Add the session file. Open the PR into **`visual/integration`**, with captures linked and a note that the post-win movement was verified in the capture build, not production.
