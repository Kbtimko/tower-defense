# Pointer-First Input Model — Implementation Plan (roadmap 2.1)

**Spec:** roadmap task 2.1 in `docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md`:
"One pointer-first `InputController`: tap = select/place; long-press = inspect (replaces hover);
two-step confirm for upgrade/sell; every keyboard shortcut gets an on-screen equivalent (pause,
speed, send wave, abilities). Existing hover tooltips (`AbilityTooltip`, `WavePreviewPopover`,
`InspectController`) get tap paths. Tests for the state machine."

## Today (mapped 2026-10-22)
- Canvas: ONE `this.input.on('pointerdown', this._onPointerDown)` (`GameScene.js` ~239, body
  ~1162-1248) with a priority chain over scattered booleans: aim (`aimMode`/`_aimSlot` → any click
  fires `_triggerAimAbility`, no cancel) → barracks reposition (`repositionMode` /
  `repositioningBarracks`, a miss cancels silently) → tower hit within 22 px (`_openTowerPanel`) →
  else `_closeTowerPanel` → `inspector.tryClickInspect` (pins enemy/hero card) → build placement
  when `selectedType` (`getNearestSlot(...,22,true)`; no slot = cancel + toast) → hero move if on
  path (40 px) else toast. `pointermove` (~232) stores `_buildCursorX/Y` (range preview ~1823,
  reticle ~1871) and calls `inspector.onPointerMove` (hover peek `#inspect-peek`).
- Hover-only: canvas peek; `.tower-btn` `mouseenter` → `#tower-tooltip` (`_showTowerTooltip` ~1259);
  `AbilityTooltip` (pointerenter/focus on `#ability-{q,w,e}-wrap`, attached in
  `UIScene._onHeroHudInit`); `WavePreviewPopover` (hover/focus; a touch tap toggles only on the
  wrapper padding — taps on `#wave-btn` itself are ignored).
- Keys: `UIScene` document keydown: Space → `ui:pause-toggle` (`#pause-btn` exists), q/w/e →
  `ui:ability` (buttons exist). Escape closes inspector/tooltips/overlays but cancels NO mode. No
  on-screen cancel exists.
- Upgrade/sell/branch: one-click (`_upgradeSelectedTower` ~1504, `_sellSelectedTower` ~1536,
  `.branch-choose-btn` in `_renderBranchPicker` ~1420-1500); no confirm.
- `src/systems/viewport.js` `gameToPageCss` multiplies by Phaser `displayScale` (game px per CSS
  px) — inverted (backlog #40a); tower panel, peek and inspector cards are placed with it, so they
  are off-position whenever the canvas is FIT-scaled (every phone).
- DOM ownership: `GameScene.shutdown` clones `wave-btn, speed-btn, pause-btn, panel-upgrade-btn,
  panel-sell-btn, msg-btn, msg-cancel-btn, exit-btn, panel-reposition-btn, story-dismiss,
  open-codex` + every `.tower-btn`; `UIScene.shutdown` clones `ability-q/w/e`.

## Rulings (controller, 2026-10-22)
1. **Taps resolve on pointer-UP** for every pointer type (needed to tell tap from long-press).
   Side effect, intended: while the finger/mouse is down the range preview / aim reticle follow it,
   so a touch player can press, drag to adjust, release to place/fire.
2. **Two-step confirm only for touch/pen** (the pointerType of the press on that button). A mouse
   click is already deliberate; desktop stays unchanged.
3. **Keyboard → on-screen:** Space and Q/W/E already have buttons. Escape gets an on-screen
   **✕ Cancel** (shown only while a mode is active), and Escape itself now also cancels build /
   aim / reposition. No new keys are added (the ask is shortcut → on-screen, not the reverse).
4. **Native `title=` tooltips** (pause, codex, hero-section XP, locked branch) are out of scope →
   backlog (3.x UI kit). Long-press covers the three named tooltip systems + `#tower-tooltip`.
5. **Backlog #40a (`gameToPageCss`) is pulled in** as Task 1: tap-opened panels must land on the
   tapped tower on a scaled canvas.

## Global Constraints (bind every task)
1. **No gameplay change**: costs, refunds, ranges, hit radii and the tap priority order are
   unchanged. Behaviour moves; numbers do not.
2. **Tunables in `src/data/input.js`** (new): `LONG_PRESS_MS = 450`, `TAP_SLOP_PX = 12` (game px
   on canvas; CSS px for DOM), `PEEK_LINGER_MS = 1500`, `CONFIRM_WINDOW_MS = 2500`. No literals in
   logic.
3. **Pure logic in `src/systems/`, Vitest-tested** (jsdom, Phaser mocked): gesture classification,
   tap resolution, confirm gate, viewport maths. **Mutation-check** each new test.
4. **One owner per DOM element:** GameScene owns `#hud`/`#bottom-bar`/`#tower-panel`/new
   `#cancel-btn` listeners — add every new GameScene-wired id to the shutdown clone list;
   UIScene owns `ability-*`. Helpers attach listeners only through their owner and expose
   `destroy()`.
5. **Listener lifecycle:** named methods bound once; removed in shutdown/destroy; never inline
   arrows on document/window. `this.events` survives Phaser shutdown. Timers (`setTimeout`) are
   cleared on pointer-up, cancel, and shutdown.
6. **Desktop unchanged** apart from: release-to-click (Ruling 1), Escape cancelling modes, and the
   Cancel button appearing during a mode. Hover peek/tooltips keep working with a mouse.
7. **Long-press never also clicks:** a long-press on a DOM button suppresses the click that
   follows; on the canvas it never places/fires/moves.
8. Phaser 3.90 — verify APIs in `node_modules/phaser/src` (note: `this.scene.pause()` is QUEUED;
   `this.sys.pause()` is immediate). Vanilla JS; match surrounding style; comments explain why.
9. Each task ends with `npm test` green (count) and `npm run build` OK. Browser checks use REAL
   input: Playwright `page.mouse`, `page.touchscreen.tap`, and for long-press a CDP session
   `Input.dispatchTouchEvent` (touchStart → wait → touchEnd) — Phaser ignores synthetic
   `dispatchEvent`.

---

### Task 1: Fix `gameToPageCss` (backlog #40a)

**Files:** `src/systems/viewport.js`, `src/systems/viewport.test.js`; callers only if their
compensation was tuned around the bug (check `_openTowerPanel` ~1195/1368, `InspectController`
`_showPeek` ~253 and card placement).

1. Read Phaser's `ScaleManager` (`displayScale`, `canvasBounds`, `transformX/Y`) and write the
   failing test first: for a canvas FIT-scaled to 0.5 (bounds 640x360 at page offset x/y),
   `gameToPageCss(1280, 720)` must equal the canvas's bottom-right corner in page px, and
   `pageToGame(gameToPageCss(p)) ≈ p` round-trips for several points (derive expectations from
   the same `displayScale` the code reads — Phaser's `transformX` is `(pageX - bounds.left) *
   displayScale.x`).
2. Fix by dividing by `displayScale`. Update the stale comment on `pageToGame`.
3. Verify (frozen frame): in a Playwright 'iPhone 14 landscape' context on the capture build, open
   a level with a built tower, pause the scene, tap the tower with `page.touchscreen.tap` at the
   tower's page position (computed from the live tower's x/y through the FIXED helper), and
   assert `#tower-panel` is visible and its left/top lie within 40 px of the tap; same on desktop
   1280x720 (1:1 — must be unchanged). Screenshots, Read them.
4. Notes: mark backlog #40a done in the PR (controller edits notes). Commit:
   `fix(viewport): gameToPageCss divides by Phaser displayScale (backlog #40a)`.

### Task 2: Pure input state machine

**Files:** create `src/data/input.js`, `src/systems/inputGesture.js` + test,
`src/systems/tapResolve.js` + test, `src/systems/confirmGate.js` + test.

1. `src/data/input.js` with the four constants from Global Constraint 2.
2. `classifyGesture({ downMs, nowMs, movedPx, released, longPressMs = LONG_PRESS_MS, slopPx = TAP_SLOP_PX })`
   → `'pending' | 'tap' | 'longpress' | 'drag'`: `movedPx > slopPx` → `'drag'` (a drag that
   started as a press is still resolved as a tap at release for placement/aim — see Task 3; the
   classifier only reports it); `!released && held >= longPressMs` → `'longpress'`; `released &&
   held < longPressMs` → `'tap'`; else `'pending'`. Boundary tests at exactly `longPressMs` and
   `slopPx`.
3. `resolveTap(state, hits)` — pure version of today's `_onPointerDown` chain. `state = { aimSlot,
   repositioning, selectedType }`; `hits = { tower, slot, onPath, inspectable }` (precomputed by
   the caller with today's radii). Returns ONE action:
   `{type:'fireAim', slot}` | `{type:'reposition'}` (caller does the 60 px snap/miss-cancel as
   today) | `{type:'openPanel', tower}` | `{type:'pin', target}` | `{type:'place'}` |
   `{type:'cancelBuild', reason:'noSlot'}` | `{type:'moveHero'}` | `{type:'offPath'}` — exactly
   today's order (aim → reposition → tower → (close panel) → inspect → build → hero). Include
   `closePanel: true` on every action that today runs `_closeTowerPanel` first. One test per
   branch + order tests (e.g. aim beats tower hit; tower beats build).
4. `cancelMode(state)` → the state with `aimSlot`, `repositioning`, `selectedType` cleared, plus
   `hasMode(state)` (any of the three set) — drives the Cancel button.
5. `createConfirmGate({ windowMs = CONFIRM_WINDOW_MS })` → `{ press(key, nowMs) → 'armed' | 'confirmed', reset(), armedKey }`:
   first press of a key arms it; a second press of the SAME key within `windowMs` confirms and
   resets; a different key re-arms; after the window a press re-arms. Tests for each.
Commit: `feat(input): pure gesture, tap-resolution and confirm-gate state machines`.

### Task 3: Canvas `InputController` (tap, long-press, cancel)

**Files:** create `src/scenes/InputController.js` + test; modify `src/scenes/GameScene.js`,
`src/scenes/UIScene.js` (Escape), `index.html` (`#cancel-btn`), affected tests
(`GameScene.heroMoveBlocked.test.js` calls `_onPointerDown` via `.call(ctx)` — migrate it to the
new entry point, keep its assertions).

1. `InputController(scene)` owns the Phaser pointer listeners GameScene registers today
   (`pointerdown`, `pointermove`, plus `pointerup`), registered in GameScene.create and removed in
   shutdown/`destroy()`.
   - `pointerdown`: record `{downMs, x, y, pointerType}`, update `_buildCursorX/Y` (so the range
     preview / reticle show under a finger), start a long-press timer (`setTimeout(LONG_PRESS_MS)`).
   - `pointermove`: update the build cursor; track moved distance; mouse-only hover peek via
     `inspector.onPointerMove` exactly as today, gated on `!pointer.wasTouch` (Phaser 3.90
     `Pointer#wasTouch`, `node_modules/phaser/src/input/Pointer.js:380`).
   - long-press timer fires (still down, within slop): show the inspector PEEK for the enemy/hero
     under the press (reuse InspectController's hit test + `_showPeek`; add a public
     `peekAt(x, y)` / `hidePeek()` if needed); mark the gesture consumed so release does nothing;
     on release hide after `PEEK_LINGER_MS`.
   - `pointerup`: if not consumed, compute `hits` with today's radii and run
     `resolveTap(state, hits)`; GameScene executes the action through its existing methods
     (`_triggerAimAbility`, the reposition branch, `_openTowerPanel`, `_closeTowerPanel`,
     `inspector.tryClickInspect`, placement, `hero.moveToProgress`, toasts) — extract the chain's
     bodies into small methods if needed, but keep behaviour identical.
2. Cancel: `#cancel-btn` ("✕ Cancel") in `index.html` (absolute, top-centre of `#game`, below the
   wave banner area; ≥ 44 px tall; hidden unless a mode is active), wired by GameScene (add to the
   shutdown clone list). GameScene `_cancelMode()` clears build (`selectedType` + `.tower-btn`
   highlight), aim (`aimMode`, `_aimSlot`, emit `hero:aim-cancel`) and reposition; shows/hides the
   button whenever a mode starts/ends (`_selectTowerType`, `_onAbility` aim entry,
   `_startReposition`, and every exit path). Escape: extend `UIScene`'s keydown to emit
   `ui:cancel` on Escape; GameScene listens (named, removed in shutdown) and calls `_cancelMode()`
   — only when a mode is active, so Escape still closes inspector/overlays as before.
3. Tests: InputController with a fake scene/input emitter — tap → resolveTap action executed;
   long-press → peek shown, no action on release; drag beyond slop still resolves at release (so
   press-drag-release places at the release point); timers cleared on up and on destroy; listener
   removal on destroy. GameScene: Cancel button visibility follows modes; Escape → `ui:cancel` →
   cancel; clone list includes `cancel-btn`.
4. Verify (frozen frames; dev or capture build; real input): desktop mouse — build an archer by
   click (now on release), click a tower → panel, click an enemy → pin, hover → peek still shows,
   arm a tower then Escape → cancelled; iPhone 14 landscape (`page.touchscreen.tap` + CDP touch
   for long-press) — tap Archer then tap a pad → tower placed; long-press an enemy (pause the
   scene first so it holds still, read its live x/y → page px via the fixed `gameToPageCss`) →
   peek visible, nothing placed; arm airstrike, tap ✕ Cancel → mode cleared, no strike fired.
   Screenshots, Read them. Commit: `feat(input): pointer-first canvas controller with long-press
   inspect and an on-screen cancel`.

### Task 4: DOM long-press tooltips and two-step confirm

**Files:** create `src/ui/longPress.js` + test; modify `src/ui/AbilityTooltip.js`,
`src/ui/WavePreviewPopover.js`, `src/scenes/GameScene.js` (tower tooltip, panel buttons, branch
buttons), `src/scenes/UIScene.js` (ability wrappers), tests.

1. `attachLongPress(el, { onLongPress, onEnd, ms = LONG_PRESS_MS, slopPx = TAP_SLOP_PX })` →
   `detach()`: pointerdown (touch/pen only) starts a timer; pointermove beyond slop / pointerup /
   pointercancel clears it; when it fires, call `onLongPress(el)` and swallow the NEXT `click` on
   `el` (capture-phase listener, `stopImmediatePropagation` + `preventDefault`, removed after one
   use or on the next pointerdown); `onEnd` on release after a long-press. Also
   `contextmenu` → `preventDefault` while pressing (iOS/Android long-press menu). Tests with fake
   timers.
2. Wire (each by its owner):
   - `.tower-btn` (GameScene): long-press → `_showTowerTooltip(btn)`; end → hide after
     `PEEK_LINGER_MS`. The tap still arms build. The synthetic `mouseenter` flash on touch is
     suppressed (only show on `pointerType === 'mouse'` enter).
   - Ability wrappers (UIScene via `AbilityTooltip`): long-press on `#ability-{q,w,e}-wrap` (the
     wrapper, because disabled buttons fire no pointer events) → show the card; end → hide after
     linger; the tap still fires the ability.
   - `WavePreviewPopover`: replace the wrapper-padding `_onTap` toggle with long-press on
     `#wave-btn-wrap` (including over the button) → show; outside tap / Escape dismiss as today;
     a plain tap on Send Wave still sends the wave.
   - Each helper's `detach` is called from the owner's existing destroy/shutdown path.
3. Two-step confirm (touch/pen only, Ruling 2) via `createConfirmGate` in GameScene: record the
   `pointerType` of the press on `#panel-upgrade-btn`, `#panel-sell-btn` and each
   `.branch-choose-btn`; on click with touch/pen: first press → button gets class `confirming`
   and text `Tap again: <original action>` (keep the cost/refund in the text), auto-reverts after
   `CONFIRM_WINDOW_MS`; second press → execute. Opening another tower, closing the panel, or any
   other button resets the gate. Mouse clicks execute immediately as today. CSS for `.confirming`
   (art-bible danger/gold accent).
4. Tests: longPress helper; each wiring (long-press shows, tap still does the primary action, no
   click after long-press); confirm: touch needs two presses, mouse one, window expiry, reset on
   panel close.
5. Verify (frozen frames, real input, iPhone 14 landscape + desktop): long-press Archer → tooltip,
   not armed; long-press ability wrapper → card; long-press Send Wave → preview, wave NOT sent;
   tap tower → panel → tap Upgrade once → "Tap again" + gold unchanged → tap again → upgraded and
   gold reduced; same for Sell (refund); desktop mouse upgrade = one click. Re-run
   `npm run capture -- --screens --maps 0 --devices desktop,iphone,pixel` → exit 0, zero LAYOUT
   lines. Screenshots, Read them. Commit: `feat(input): long-press tooltips and touch two-step
   confirm for upgrade and sell`.

---

## Done when
- `npm test` green (count), `npm run build` OK, capture exits 0 with zero LAYOUT lines, frozen-frame
  probes pass on desktop and iPhone emulation with real input, screenshots LOOKED at.
- Notes: roadmap 2.1 ticked; backlog #40a done; title-tooltip follow-up recorded (Ruling 4).
