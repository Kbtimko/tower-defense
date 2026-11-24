# Mobile Shell — Implementation Plan (roadmap 2.3, pulled ahead of G3)

**Spec:** roadmap task 2.3 in `docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md`:
"Landscape prompt, fullscreen button, audio unlock on first tap, `touch-action: none`, disable
pull-to-refresh/double-tap zoom, safe-area insets, visibilitychange auto-pause, resize handling."
Pulled forward (user decision 2026-10-22) so the phone half of gate G3 can run: it must fix the
**landscape PLAY bug** (Known Bugs in `.claude/notes.md`).

## Root causes (measured 2026-10-22, Playwright iPhone 14 / Pixel 7 emulation, capture build)

1. **PLAY clipped in landscape.** At 750x340 `#map-select-layout` is 136 px tall (top 129, bottom
   265) but `#featured-play` sits at 320-363. `#featured-blurb` is `flex:1` with the default
   `min-height:auto`, so it cannot shrink below its text; the featured column overflows and
   `#map-select-layout { overflow:hidden }` + `body { overflow:hidden }` hide PLAY with no way
   to scroll. Title (34 px + 18 margin), meta bar and lifetime-stats chips eat the rest.
2. **Rotating breaks the layout (page zoom, not Phaser).** In a level, `#bottom-bar`'s min-content
   width is **770 px** (`scrollWidth`), wider than portrait (390) and even iPhone landscape (750).
   The viewport meta is only `width=device-width, initial-scale=1.0`, so the mobile browser
   widens the layout viewport to 770 and zooms out to fit. After rotating it is left at
   `visualViewport.scale = 1.92` showing a 390x177 window of a 770x350 layout, and
   `overflow:hidden` prevents panning. Phaser's FIT re-fit is fine (canvas re-fits to `#game`).
   The same 770 px bar also clips Send Wave in plain landscape on a 750 px phone.
3. `body { height: 100vh }`: on iOS Safari `100vh` is the large viewport (toolbars hidden), so the
   bottom of the page sits under the toolbar. Needs `100dvh`.

Out of scope (roadmap 2.2): the canvas is small on phones because the DOM HUD + bottom bar take
~137 of 340 px. The compact CSS below is a **stopgap** so G3 can play; 2.2 replaces it.

## Global Constraints (bind every task)

1. **No gameplay change.** Pause behaviour reuses `GameScene._onPauseToggle()`.
2. **Tunables in `src/data/mobile.js`** (new): media-query strings and the compact-height
   breakpoint. CSS cannot import JS, so `index.html` mirrors them; a contract test reads
   `index.html` from disk and asserts the mirrored strings are present (derive from the exports,
   never re-type the literal in the test).
3. **Pure logic Vitest-tested** (jsdom, Phaser mocked per `feedback_jsdom_phaser_mock`): layout
   audit, fullscreen API resolution, auto-pause decision, audio resume. **Mutation-check** each
   new test: break the code, see the specific test fail, restore.
4. **One owner per DOM element** (`project_hud_dom_ownership`): GameScene owns every `#hud` /
   `#bottom-bar` listener; MapSelectScene owns every `#map-meta-bar` button and wires it with the
   existing clone-then-bind pattern (`_bindPlay`). Nothing else attaches listeners to those.
5. **Listener lifecycle** (`project_scene_listener_leak`): document/window/matchMedia listeners a
   scene adds are named methods bound once, removed in `shutdown`; never inline arrows.
6. **Desktop unchanged:** every new rule is gated on `(pointer: coarse)` and/or
   `(max-height: 500px)`; desktop captures must be pixel-identical in layout to the baseline
   except the new fullscreen button.
7. Phaser 3.90 — verify APIs in `node_modules/phaser/src`. Vanilla JS; match surrounding style;
   comments explain why.
8. Each task ends with `npm test` green (report the count) and `npm run build` OK.

---

### Task 1: Layout audit in the capture harness (the failing test first)

**Files:** create `src/systems/layoutAudit.js` + `src/systems/layoutAudit.test.js`; modify
`scripts/capture.mjs`.

1. `layoutProblems(m)` — pure. Input:
   `{ device: {width, height}, innerWidth, innerHeight, scale, scrollWidth, targets: [{ name, rect: {left, top, right, bottom, width, height} | null, visible }] }`.
   Returns an array of human-readable strings, empty when healthy:
   - `zoomed: visualViewport.scale=<s>` when `|scale - 1| > 0.01`;
   - `layout viewport <innerWidth>x<innerHeight> wider than device <w>x<h>` when
     `innerWidth > device.width`;
   - `page overflows: scrollWidth <sw> > innerWidth <iw>`;
   - per target: `<name> missing` (rect null), `<name> hidden` (visible false), or
     `<name> off-screen <rect>` when any edge is outside `[0, innerWidth] x [0, innerHeight]`
     (1 px tolerance) or width/height is 0.
   Tests: one healthy case + one per problem, plus the boundary (edge exactly at innerWidth is
   healthy; +2 px is not).
2. `capture.mjs`:
   - Each `DEVICES` entry gains `portrait`: the Playwright descriptor name for the same device
     upright (`iphone: 'iPhone 14'`, `pixel: 'Pixel 7'`, `ipad: 'iPad Pro 11'`; desktop none).
   - A helper `audit(page, deviceName, label, selectors)` collects the metrics in the page
     (`visualViewport.scale`, `innerWidth/Height`, `document.documentElement.scrollWidth`,
     `getBoundingClientRect()` + `checkVisibility()`-or-computed-style visibility for each
     selector; for a class selector audit EVERY match, named `.tower-btn[0..n]`), runs
     `layoutProblems` with `device` = the context's viewport, and records
     `{ device, label, problems }` into `report.json` under `layout`.
   - In `--screens`: audit `#featured-play` on the map-select shot; audit `#pause-btn`,
     `#speed-btn`, `#open-codex`, `.tower-btn`, `#exit-btn`, `#wave-btn` on the in-game shot.
   - New rotation sequence in `--screens` for every device with `portrait`: fresh context with
     the portrait descriptor, boot, skip the story, shoot `00-portrait.png`; then
     `page.setViewportSize(<landscape viewport>)`, wait 800 ms, shoot
     `02b-map-select-rotated.png`, audit `#featured-play` (label `rotated-map-select`); click
     PLAY, wait for the level, shoot `03b-in-game-rotated.png` and audit the in-game set (label
     `rotated-in-game`). Also do a rotation **inside a level**: portrait context loading the
     capture URL directly (`captureUrl`), then rotate and audit (label `rotated-mid-level`).
   - Print every problem at the end as `LAYOUT <device> <label>: <problem>` and set
     `process.exitCode = 1` if any exist.
3. **Prove it fails:** `npm run capture -- --screens --maps 0 --devices desktop,iphone,pixel`
   must report problems on iphone (`featured-play off-screen`, `zoomed`, `page overflows`,
   `#wave-btn off-screen`) and exit non-zero; desktop reports none. Paste the LAYOUT lines into
   the task report. Commit: `test(capture): layout audit for phone viewports and rotation`.

### Task 2: Viewport, page shell and compact phone layout (fixes root causes 1-3)

**Files:** create `src/data/mobile.js` + `src/data/mobile.test.js`; modify `index.html`.

1. `src/data/mobile.js`:
   ```js
   // Phone in portrait: the game is landscape-only, so this shows the rotate prompt.
   export const PHONE_PORTRAIT_QUERY = '(orientation: portrait) and (pointer: coarse)';
   // Landscape phones are ~340-430 px tall; tablets and desktops are taller.
   export const COMPACT_MAX_HEIGHT_PX = 500;
   export const COMPACT_QUERY = `(max-height: ${COMPACT_MAX_HEIGHT_PX}px)`;
   export const VIEWPORT_CONTENT =
     'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
   ```
   `mobile.test.js` reads `index.html` (`fs.readFileSync` relative to the repo root) and asserts
   the viewport meta `content` equals `VIEWPORT_CONTENT` and that `@media ${COMPACT_QUERY}`
   and `${PHONE_PORTRAIT_QUERY}` (Task 3 adds the latter; write that assertion in Task 3) appear.
2. `index.html`:
   - viewport meta → `VIEWPORT_CONTENT` (minimum-scale=1 is what stops shrink-to-fit zoom-out;
     maximum-scale/user-scalable stop pinch and double-tap zoom).
   - `html, body { height: 100%; overscroll-behavior: none; }` (no pull-to-refresh / rubber
     band); `body { height: 100vh; height: 100dvh; touch-action: manipulation;
     -webkit-tap-highlight-color: transparent; padding: env(safe-area-inset-top)
     env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }`
     (keep `box-sizing: border-box` from `*`). `#game canvas { touch-action: none; }` — only
     the canvas, so DOM overlays inside `#game` (story log, codex) still scroll.
   - `#bottom-bar`: `min-width: 0; overflow-x: auto;` so on any phone narrower than the bar the
     BAR scrolls instead of widening the page (this alone removes the zoom).
   - `#featured-blurb { min-height: 0; overflow-y: auto; }` and `#map-featured { min-height: 0; }`
     — the blurb shrinks/scrolls, PLAY keeps its size at every height (root cause 1).
   - `@media (max-height: 500px)` compact block (stopgap until 2.2; say so in a comment):
     map select — padding 8 px, title ~20 px with 6 px margin, meta bar tighter, featured panel
     padding 10 px and smaller name/stars, `#lifetime-stats` hidden; in-level — HUD padding 4 px
     and smaller stat fonts, `#bottom-bar` gap 4 px / padding 4 px 8 px, `.tower-btn` padding
     4 px 6 px with smaller icon/cost/name, hero section and ability buttons tightened, exit and
     wave buttons padding 6 px 10 px. Tune by measuring: the bar must fit in 750 px with no
     horizontal scroll, and every button stays ≥ 40 px tall (touch target; 2.2 takes it to 44).
3. Verify: `npm run capture -- --screens --maps 0 --devices desktop,iphone,pixel` exits 0 with
   no LAYOUT lines; LOOK at every iphone/pixel screenshot including `02b`/`03b`; desktop
   `02-map-select.png` / `03-in-game.png` unchanged vs the Task 1 run. Commit:
   `fix(mobile): viewport, safe areas and compact landscape layout keep PLAY on screen`.

### Task 3: Landscape prompt and fullscreen button

**Files:** create `src/ui/fullscreen.js` + test; modify `index.html`,
`src/scenes/MapSelectScene.js` (+ its existing test harnesses that build the meta-bar DOM:
`MapSelectScene.menuMusic.test.js`, `MapSelectScene.heroOverlay.test.js` create the elements by
id — add the new button there or guard with `?.`), `src/data/mobile.test.js`.

1. Rotate prompt: `<div id="rotate-prompt">` as the last child of `body` (outside `#game`,
   `#hud`, `#bottom-bar` — no scene owns it, no listeners). Hidden by default; shown by
   `@media (orientation: portrait) and (pointer: coarse)` as a fixed full-screen panel
   (z-index above everything) with a rotate glyph and "Rotate your device to landscape". Add the
   `PHONE_PORTRAIT_QUERY` assertion to `mobile.test.js`.
2. `src/ui/fullscreen.js` — pure-ish, takes `doc` so tests pass a fake:
   `fullscreenSupported(doc)` (`doc.fullscreenEnabled || doc.webkitFullscreenEnabled`),
   `isFullscreen(doc)` (`doc.fullscreenElement || doc.webkitFullscreenElement`),
   `toggleFullscreen(doc, el, orientation)` — exit if fullscreen, else request on `el`
   (`requestFullscreen` or `webkitRequestFullscreen`) and then best-effort
   `orientation?.lock?.('landscape')` with the rejection swallowed (unsupported on most
   browsers; it must never throw). Returns the promise. Tests cover both API flavours,
   unsupported, and a rejecting `lock`.
3. `#fullscreen-btn` (`⛶ Fullscreen`) in `#map-meta-bar`, styled like its siblings. MapSelectScene
   `_bindFullscreen()` with the clone pattern: hidden (`display:none`) when
   `!fullscreenSupported(document)` (iPhone Safari has no element fullscreen); click →
   `toggleFullscreen(document, document.documentElement, screen.orientation)`; label flips to
   `⛶ Exit fullscreen` via a `fullscreenchange`/`webkitfullscreenchange` listener that
   MapSelectScene adds in create and removes in shutdown (named bound method).
4. Verify: capture `00-portrait.png` shows the prompt on iphone/pixel and the desktop map select
   shows the button; frozen probe in the browser: click it in Playwright desktop Chromium,
   assert `document.fullscreenElement` is set and the label flipped, press it again to exit.
   Commit: `feat(mobile): landscape prompt and fullscreen button`.

### Task 4: Lifecycle — auto-pause on hide/portrait, audio resume on first tap

**Files:** create `src/systems/shellLifecycle.js` + test; modify `src/scenes/GameScene.js`,
`src/main.js`.

1. `shouldAutoPause({ hidden, phonePortrait, inLevel, userPaused, over })` — pure: true only when
   in a running level (`inLevel && !over && !userPaused`) and (`hidden || phonePortrait`).
   Never auto-RESUMES: coming back leaves the PAUSED overlay up so the player resumes when
   ready. Tests: each input flipped on its own.
2. GameScene: in `create`, `this._onShellChange = this._onShellChange.bind(this)`;
   `document.addEventListener('visibilitychange', this._onShellChange)`;
   `this._portraitMql = window.matchMedia?.(PHONE_PORTRAIT_QUERY)` and
   `this._portraitMql?.addEventListener('change', this._onShellChange)`; remove both in
   `shutdown`. `_onShellChange()` calls `_onPauseToggle()` when `shouldAutoPause({ hidden:
   document.hidden, phonePortrait: !!this._portraitMql?.matches, inLevel: true, userPaused:
   this._userPaused, over: this.over || this.won })` is true. **Overlays need no special case:**
   the codex (`_openCodex`) and exit-confirm (`msg-cancel-btn`) already pause with a bare
   `scene.pause()` and resume only `if (!this._userPaused)` — so auto-pausing while one is open
   sets `_userPaused`, and closing the overlay leaves the game paused with the PAUSED overlay up.
   Test exactly that (open codex → hide → close codex → still paused). Also run
   `_onShellChange()` once at the end of `create` (a level started in portrait pauses
   immediately). Tests extend `src/scenes/GameScene.pause.test.js` (its harness already stubs
   the pause button/overlay) and `GameScene.shutdown.test.js` (both listeners removed).
3. Audio: `resumeAudio(ctx)` — pure: if `ctx` and `ctx.state` is `'suspended'` or
   `'interrupted'` (iOS), call `ctx.resume()` and swallow a rejection; otherwise no-op. Tests for
   each state and a missing context. Phaser already unlocks WebAudio on the first touch
   (`WebAudioSoundManager.unlock`) — read it in `node_modules/phaser/src/sound/webaudio/` and
   note what it covers in the code comment; our hook covers the case it does not: an iOS
   context left `interrupted` after a call/lock-screen. In `main.js`, after `new Phaser.Game`,
   add document-level `pointerdown` (capture) and `visibilitychange` (when visible) listeners
   that call `resumeAudio(game.sound.context)` (these live for the page's life; no scene owns
   them).
4. Verify (frozen frames, Playwright iPhone context): start a level, `page.evaluate` →
   dispatch `visibilitychange` with `document.hidden` overridden true → assert `#paused-overlay`
   has `shown`, `scene.isPaused()` via `window.__game` (DEV only — use the dev server for this
   probe) and the pause button reads Resume; set it visible again → still paused. Rotate to
   portrait mid-level → paused + prompt visible; rotate back → still paused, layout audit clean.
   Commit: `feat(mobile): auto-pause on hide or portrait, resume audio on first tap`.

---

## Done when
- `npm test` green (count reported), `npm run build` OK, `npm run capture -- --screens --maps 0
  --devices desktop,iphone,pixel` exits 0 with no LAYOUT lines, and the screenshots were LOOKED
  at (including rotated ones).
- Notes: Known Bugs entry for the PLAY bug marked fixed; roadmap 2.3 checked with a one-line
  result; follow-ups (2.2 canvas size on phones, compact CSS to be replaced) recorded.
- Real-device confirmation of PLAY in landscape and after rotation happens at G3 (the user's).
