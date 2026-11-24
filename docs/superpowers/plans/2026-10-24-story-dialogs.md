# Story Dialogs (Action-Comic Caption Boxes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every story dialog as an action-comic caption panel (user's option B) with per-speaker sides/colours, a slam-in portrait, typewriter text, tap-to-finish / tap-to-advance, and keyboard/a11y-safe input, without changing the dialog's call-site API.

**Architecture:**
- **Pure modules** hold every rule: `typewriter.js` (reveal timing), `dialogFlow.js` (the typing → complete → next state machine on top of `storySequence.js`), `speakerLook.js` (side/colour/shape resolution from data) and `storyDialogLayout.js` (layout audit).
- **Thin DOM:** `StoryDialogOverlay` keeps `play(sequenceId, onComplete)` / `close()` and adds one optional constructor argument, `{ motion }`. It owns one click listener, one capture-phase keydown listener and one rAF loop.
- **CSS** in `index.html` paints the comic look from `--sd-*` variables the overlay sets.

**Tech Stack:** vanilla ES modules, DOM/CSS (3.1 kit tokens), Vitest 2 + jsdom, Playwright harness (`scripts/capture.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-23-story-dialogs-design.md`. Every task implicitly includes the spec sections it names; read them, don't guess.

## Global Constraints

- **Unchanged API.** Keep `StoryDialogOverlay.play(sequenceId, onComplete)` and `close()` semantics exactly (spec §2 "Kept behaviour"). The constructor gains `{ motion?: () => boolean, now?, raf?, caf? }`.
- **Unchanged ids:** `#story-dialog`, `#story-dialog-portrait`, `#story-dialog-name`, `#story-dialog-text`, `#story-dialog-next`, `#story-dialog-skip`. Added: `#story-dialog-stage`, `#story-dialog-live`. New classes use the `sd-` prefix.
- **Tunables** live only in `src/data/storyDialog.js` (`STORY_DIALOG`, `SPEAKER_LOOK_DEFAULTS`, with values verbatim from spec §5.2) and in the `STORY_SPEAKERS` rows (spec §4.2 table, verbatim; Veth `color` becomes `0xb57bff`).
- **No timers.** No `setTimeout`/`setInterval` in the dialog; the guard is a timestamp compare and typing runs in one rAF loop (spec §3.3).
- **Animation properties.** Slam and glitch animate the individual `translate`/`scale` properties, never `transform`, and sit on nested elements (outer = slam, inner = glitch). The skew lives on `transform`. Skip and Next sit outside every animated subtree (spec §3.4).
- **Colours.** Dialog CSS uses no hex literals. The only colour function allowed is `rgba(0,0,0,a)`. Lengths are `calc(N * var(--ui-u))`. Ink = `var(--ui-bevel-lo)`. Fonts are `var(--ui-font-*)`, type ≥ 11 px, no `title=` attributes. The existing guards (themeCss, typeFloor, noNativeTitles, railCss, kitRollout) stay green.
- **Copy (verbatim):**
  - `Next ▸` / `Continue ▸`
  - `Skip`
  - aria-labels `Next` / `Continue` / `Skip story`
  - dialog `aria-label="Story"`
  - live text `"<Speaker name>: <full line>"`
- **Listener pairs.** Every listener, rAF and keyup tail is added and removed as a pair. `close()` is idempotent and never calls `onComplete`.
- **Test rules.** Phaser is mocked in scene tests (`vi.mock('phaser', …)`). Every new test is mutation-checked. Never pipe test output through tail/head.
- **Models.** Sonnet for Tasks 1–3 (pure); opus for Tasks 4–6 (DOM, CSS, harness) and for all reviews.

## Review Focus

1. **Browser zoom 200 % on a 1280×720 laptop** (viewport 640×360, compact, narrower than an iPhone): the longest line must still fit with Skip/Next visible. Test in Task 6: a `--screens` run at 640×360 with `storyDialogProblems` clean.
2. **Story text containing `<`, `&`, quotes or an emoji:** it renders literally (textContent, never innerHTML), is split by code point and never splits a surrogate pair. Tests in Task 1 (typewriter, emoji) and Task 4 (overlay renders `"<b>&amp;"` literally).
3. **A future speaker with a long name** (e.g. 28 characters): the name tab truncates with an ellipsis on one line and never pushes the caption or the action row. Test in Task 5 (CSS guard: the tab has `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`) and Task 6 (`storyDialogProblems` flags tab overflow, via synthetic rects).
4. **An `onComplete` that immediately calls `play()` again** (chained beats): exactly one set of listeners and one rAF loop afterwards, and the new sequence slams. Test in Task 4.
5. **A double tap on Skip:** `onComplete` runs exactly once, and the second click on the now-hidden overlay does nothing. Test in Task 4.

---

### Task 1: Story-dialog data + typewriter (pure)

**Files:**
- Create: `src/data/storyDialog.js`, `src/systems/typewriter.js`
- Test: `src/systems/typewriter.test.js`

**Interfaces:**
- Produces:
  - `STORY_DIALOG` and `SPEAKER_LOOK_DEFAULTS`, values verbatim from spec §5.2
  - `revealTimes(text, cfg) → number[]`: ms offset per code point
  - `typeDurationMs(text, cfg) → number`
  - `charsShown(text, elapsedMs, cfg) → int` (0…`Array.from(text).length`)
  - `cfg = { msPerChar, punctPauseMs, punctChars }`

- [ ] **Step 1: Failing tests** per spec §8.1-1:
  - `charsShown(t, 0) === 0`, `charsShown(t, NaN) === 0`
  - `charsShown(t, typeDurationMs(t)) === len` and `charsShown(t, Infinity) === len`
  - monotonic over a 5-ms sweep
  - punctuation pause: for `"Hi. Go"` the char after `.` reveals exactly `punctPauseMs` later than without the pause
  - `typeDurationMs('') === 0`
  - `charsShown('a😀b', …)` steps 0,1,2,3 (the emoji counts as one)
  - the derived longest panel across `STORY_SEQUENCES` types in `< 5000` ms with `STORY_DIALOG` (derived, never a literal line)
- [ ] **Step 2: Run** `npx vitest run src/systems/typewriter.test.js`. Expect FAIL (module not found).
- [ ] **Step 3: Implement.** Use `Array.from(text)` for code points. A character's reveal time = its index × `msPerChar` + `punctPauseMs` × (the number of earlier characters in `punctChars`).
- [ ] **Step 4: Run.** PASS. Mutation-check the pause and emoji tests.
- [ ] **Step 5: Commit** `feat(story): typewriter timing and story-dialog tunables`.

### Task 2: Speaker look (data rows + pure resolver)

**Files:**
- Modify: `src/data/story.js` (`STORY_SPEAKERS` rows gain `side`, `caption`, and `shape`/`glitch` where non-default; Veth `color: 0xb57bff`), `src/data/story.test.js`, `docs/art-bible.md` §2 (add the "Story speakers" table, per spec §5.2)
- Create: `src/systems/speakerLook.js`
- Test: `src/systems/speakerLook.test.js`

**Interfaces:**
- Consumes: `SPEAKER_LOOK_DEFAULTS` (Task 1); `resolvePortrait(speaker, registeredKeys)` (`src/systems/portraitFallback.js`).
- Produces: `speakerLook(speakerId, speakers = STORY_SPEAKERS, defaults = SPEAKER_LOOK_DEFAULTS, registered = REGISTERED_PORTRAITS) → { id, name, side: 'left'|'right', frame: '#rrggbb'|null, caption: '#rrggbb'|null, shape: 'box'|'jagged', glitch: boolean, portrait }`. `frame`/`caption` are `null` for an unknown speaker, so CSS falls back to tokens through `data-speaker="unknown"`. `portrait` is the `resolvePortrait` result; an unknown id gives `{ kind: 'fallback', initial: '?' }`.

- [ ] **Step 1: Failing tests:**
  - `speakerLook.test.js` (spec §8.1-3): command/rael/veth side, shape, glitch and colours (hex derived from the data, not literals); unknown id → defaults with `frame` null, name `''`, initial `'?'`; a row missing `side`/`shape` → defaults; `side: 'up'` → `left`, `shape: 7` → `box`; numbers masked to 24 bits; registered key → `image`, unregistered → `fallback`.
  - `story.test.js` additions (spec §8.1-4):
    - every speaker has a valid side and a numeric caption
    - `shape`/`glitch` are absent or valid
    - contrast ≥ 4.5 for caption vs ink and for colour vs ink, with ink = `deriveShades(PALETTE, MIX).bevelLo` imported, never a literal
    - at least one `right` speaker exists
- [ ] **Step 2: Run** both files. Expect FAIL.
- [ ] **Step 3: Implement** the rows (spec §4.2 table) and `speakerLook`. Write the art-bible table to match `STORY_SPEAKERS`.
- [ ] **Step 4: Run.** PASS. Mutation-check: a too-dark speaker colour (e.g. `0x6a2fbf`) must fail the contrast test, and removing the `side` sanitizing must fail its test.
- [ ] **Step 5: Commit** `feat(story): per-speaker comic look as data`.

### Task 3: Dialog flow state machine (pure)

**Files:**
- Create: `src/systems/dialogFlow.js`
- Test: `src/systems/dialogFlow.test.js`

**Interfaces:**
- Consumes: `createSequence`, `currentPanel`, `advance`, `atEnd`, `isComplete` (`src/systems/storySequence.js`, unchanged); `typeDurationMs`, `charsShown` (Task 1); `STORY_DIALOG` (Task 1).
- Produces:
  - `startFlow(sequence, now, { motion = true } = {}) → state`
  - `primary(state, now, cfg) → state`
  - `skip(state) → state`
  - `tick(state, now, cfg) → state`
  - `view(state, now, cfg) → { index, phase: 'typing'|'complete'|'done', shown, length, isLast, transition: 'slam'|'swap', panel }`

  All are pure and return new objects. `transition` is `'slam'` when the panel's speaker differs from the previous panel's (and for the first panel), else `'swap'`. `typeDelayMs` = `slamDelayMs` or `swapDelayMs`, by transition.

- [ ] **Step 1: Failing tests** (spec §8.1-2, values from `STORY_DIALOG`):
  - Primary during typing → `complete` with `shown === length`.
  - `tick` past `typeEnd` → `complete` with `completeAt === typeEnd` (not the tick time).
  - Primary at `completeAt + advanceGuardMs - 1` is ignored (same index). At `completeAt + advanceGuardMs` it advances.
  - The last panel's Primary after the guard → `done`.
  - `skip` from typing, complete and mid-delay → `done`.
  - `motion: false`: each panel starts `complete` and the guard still holds.
  - Transitions over the real `campaign_intro` give `['slam','swap','slam','slam']`.
  - Command → Veth (both left) gives `slam`.
  - A 1-panel sequence: `isLast` from the start.
  - An empty sequence: `done` at start.
  - An empty panel text: `complete` at once.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** PASS. Mutation-check the guard boundary and the `completeAt = typeEnd` rule.
- [ ] **Step 5: Commit** `feat(story): typing/complete/advance state machine with double-tap guard`.

### Task 4: StoryDialogOverlay behaviour + markup structure

**Files:**
- Modify:
  - `src/ui/StoryDialogOverlay.js` (rewrite inside the same API)
  - `src/ui/StoryDialogOverlay.test.js` (rewrite the cases spec §3 changed; keep the re-entrant `play()` tests)
  - `index.html` (`#story-dialog` markup only: the stage, frame/tab/caption/action-row wrappers, the `.sd-typed`/`.sd-rest` spans inside `#story-dialog-text`, `#story-dialog-live`, `role="dialog" aria-modal="true" aria-label="Story"`, `aria-hidden` on the name and text, aria-labels on the buttons; a `.sr-only` utility rule)
  - `src/scenes/MapSelectScene.js` and `src/scenes/GameScene.js` (constructor `{ motion }` only, plus importing the shared shortcut helper)
- Create: `src/ui/browserShortcut.js` (move `isBrowserShortcut(e)` out of `MapSelectScene`, unchanged logic; `MapSelectScene` imports it)
- Test: `src/ui/StoryDialogOverlay.test.js`, `src/ui/browserShortcut.test.js`, a scene test (Space during a GameScene briefing doesn't emit `ui:pause-toggle`)

**Interfaces:**
- Consumes: `startFlow`/`primary`/`skip`/`tick`/`view` (Task 3); `speakerLook` (Task 2); `STORY_DIALOG` (Task 1); `isBrowserShortcut` (moved here).
- Produces:
  - `#story-dialog` data attributes `data-index`, `data-phase`, `data-speaker`, `data-side`, `data-shape`, `data-glitch` (`"1"`/`"0"`) and `data-transition`
  - CSS vars `--sd-frame` and `--sd-caption`, plus `--sd-*` timing vars from `STORY_DIALOG`
  - the class `.motion-off`
  - one-shot classes `sd-slam` / `sd-swap`, replayed on a panel change
  - `.sd-done-mark` visible in `complete`

  Task 5 styles these exact names.

- [ ] **Step 1: Failing tests:**
  - every case in spec §8.1-5, with injected `now`/`raf`/`caf`
  - every Story Log beat (`Object.keys(STORY_LOG_LABELS)`) plays to `done` via repeated Primary with no throw
  - **Review Focus 2:** a panel text `"<b>&amp;"` renders literally
  - **Review Focus 4:** an `onComplete` that calls `play()` again leaves exactly one listener set and one rAF loop (pair counts)
  - **Review Focus 5:** a double click on Skip calls `onComplete` exactly once
  - `browserShortcut` tests: Ctrl/Meta/Alt → true; plain keys and Shift → false
  - the scene test above
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** per spec §3.1–3.5, §5.3, §9:
  - a delegated click on `#story-dialog` (`closest('#story-dialog-skip')` → skip, else primary)
  - capture-phase keydown on `document`:
    - ignore events that are `defaultPrevented`, are browser shortcuts, or are `e.repeat`
    - Enter/Space → primary unless focus is Skip; Esc → skip; Tab wraps between Skip and Next
    - `stopPropagation` on every non-shortcut key; `preventDefault` on handled keys
  - a keyup swallow after a key closes the dialog
  - focus to Next on `play`, restored on finish/close
  - the live region set once per panel
  - `.sd-typed`/`.sd-rest` written only when `shown` changes
  - `img` `error` → fallback
  - `motion()` read at `play` and at each panel change
  - animation replay guarded for jsdom
  - remove today's inline `style.color` / `style.background` writes and the `'#fff'` fallback; colour comes only from `--sd-frame` / `--sd-caption` and the CSS (#50b, spec §5.3)
  - the portrait `img` has `alt=""` (spec §9)
- [ ] **Step 4: Run** the overlay tests, then the full `npm test` (the existing MapSelectScene/GameScene/story tests must stay green), then `npm run build`.
- [ ] **Step 5: Commit** `feat(story): dialog input model, typewriter loop and a11y (same API)`.

### Task 5: Comic visual CSS

**Files:**
- Modify: `index.html` `<style>`:
  - replace the `.story-dialog-*` rules (≈ lines 360–372) with the comic look from spec §4.1–4.2, §3.4 and §6–7
  - `#story-log-inner h3` → `var(--ui-accent)` + `var(--ui-font-heading)`
  - keep the coarse-pointer 44-px list covering the dialog buttons
- Modify: `src/ui/kitRollout.test.js` (remove `.story-dialog-card` from SURFACES; Skip/Next stay)
- Create: `src/ui/storyDialogCss.test.js`, the new guard (spec §8.1-7)

**Interfaces:**
- Consumes: the attribute, var and class names from Task 4's Produces block.

- [ ] **Step 1: Write `storyDialogCss.test.js`:**
  - Rules whose selectors name `#story-dialog`, `.story-dialog` or `.sd-` contain no hex literal and no colour function other than `rgba(0,0,0,…)`.
  - Border/outline/shadow lengths use `var(--ui-u)`.
  - The rule set is non-empty (no vacuous pass).
  - The name tab rule has `white-space:nowrap`, `overflow:hidden` and `text-overflow:ellipsis` (Review Focus 3).
  - No `@keyframes` used by `.sd-` animates `transform`.
  - `.motion-off` disables the `sd-` animations.

  Run it: FAIL on today's file (hex literals in the old rules).
- [ ] **Step 2: Write the CSS:**
  - **Speaker variants:** `data-side="right"` mirrors the composition and reverses the skew; `data-shape="jagged"` uses the layered clip-path build (ink layer + inset fill + `filter: drop-shadow` on the unclipped parent, spec §4.2); `data-glitch="1"` loops the glitch on the inner elements; `data-speaker="unknown"` uses tokens.
  - **Motion:** `sd-slam`/`sd-swap` keyframes on `translate`/`scale` with timings from the `--sd-*` vars.
  - **Layout:** the compact class via `@media (max-height:500px)`; the action row is fixed and right-aligned.
  - **Text:** `.sd-rest{visibility:hidden}`; the halftone overlay; the overlay gets `cursor:pointer; user-select:none; -webkit-touch-callout:none; touch-action:manipulation`.
- [ ] **Step 3: Run** `npm test` (all guards: themeCss, typeFloor, noNativeTitles, railCss, kitRollout, storyDialogCss) and `npm run build`. PASS.
- [ ] **Step 4: Controller live check (not the implementer).** On the production build at 1440×900 and iPhone 14, play `campaign_intro` plus Story Log replays (Finale, the Asteroid Belt epilogue). Compare with the approved mockups `docs/captures/3.5-story-dialogs/mockups/caption-boxes-speakers.png`, and fix before Task 6.
- [ ] **Step 5: Commit** `feat(story): action-comic caption-box look (#50b in dialog)`.

### Task 6: Layout audit + harness

**Files:**
- Create: `src/systems/storyDialogLayout.js` (`storyDialogProblems({ viewport, portrait, tab, caption, captionScroll: { scrollHeight, clientHeight }, actions, fontPx }) → string[]`) + test
- Modify: `scripts/capture.mjs`:
  - **`skip-story` / `briefing` steps:** real-tap finish and advance before Skip, per spec §8.2, plus the post-briefing `#wave-btn` / `#paused-overlay` assertions
  - **`STORY_TARGETS` audit:** add it
  - **Screens:** `01a-story-typing`; `01-first-run-story` after `data-phase="complete"`; the `captureStoryGallery` run (`10`, `10b`, `10c` longest-derived, `10d` Veth)
  - **`captureMissingArt`:** block `portrait-veth.png` and shoot `10e`
  - **`captureReducedMotion`:** assert `getAnimations({subtree:true}).length === 0`
  - **`captureNoFonts`:** clean
  - **`winMapZero`:** wait for `data-phase="complete"` before its story shot
  - **Review Focus 1:** a `--screens` device or extra run at 640×360
- Test: `src/systems/storyDialogLayout.test.js` (synthetic rects: overflow, out-of-viewport, portrait∩caption with skew bleed, caption∩actions, font < 11, tab overflow (Review Focus 3); each check proven to fail)

- [ ] **Step 1: Write the `storyDialogLayout` tests.** Run: FAIL.
- [ ] **Step 2: Implement the function.** Run: PASS. Mutation-check.
- [ ] **Step 3: Update `capture.mjs`** per the list above. Real input only, no `dispatchEvent`.
- [ ] **Step 4: Gates, once each,** capturing full output and exit codes:
  - `npm test`
  - `npm run build`
  - `npm run matrix`: exit 0, desktop 17/17, touch 18/18, no console errors
  - `npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad`: exit 0, 0 problems

  **Look at** the 01/01a/10–10e shots against spec §12.
- [ ] **Step 5: Commit** code, plus the captures converted to JPG q90, into `docs/captures/3.5-story-dialogs/` (not `mockups/`): `test(harness): story dialog finish/advance, gallery and layout audit`.

### Final: verification and PR (controller)

1. Final whole-branch review on opus against the spec and the ledger minors, then one fix wave.
2. Live smoke on the production build at 1440×900 and iPhone 14 landscape, covering spec §8.4 (a)–(d), with real input. Run a browser-acceptance agent over spec §12.
3. Tick 3.5 in the roadmap. Update `.claude/notes.md` (3.5 done; the in-dialog part of #50b closed; the #41c story half closed; follow-ups) and the session file.
4. Open a PR into **`visual/integration`** with the captures linked, noting that the victory epilogue was verified in the capture build.
