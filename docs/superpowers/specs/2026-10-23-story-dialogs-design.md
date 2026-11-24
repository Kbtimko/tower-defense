# Roadmap 3.5: story dialogs as an action comic (design)

**Branch:** `visual/3.5-story-dialogs` (off `origin/visual/integration`, which includes 3.4 title + story world map) · **Date:** 2026-10-23
**Mockups (rough sketches, not pixel specs):** `docs/captures/3.5-story-dialogs/mockups/`
- `comic-dialogs.html` + `comic-options.png`: three styles. The user chose **B "Caption boxes"**.
- `comic-b-speakers.html` + `caption-boxes-speakers.png`: the per-speaker treatment, approved ("yes").
- `desktop1440-01-first-run-story.jpg`, `iphone-01-first-run-story.jpg`: today's dialog.

Tags used below: **[User]** = decided by the user, not reopened here. **[Claude]** = Claude's call; the user may override it. **[Builder]** = left to the implementer, within the stated constraints.

## 1. Intent

### The literal ask
- *"Those [dialogs] don't look so bad today. I just want to make them cleaner and more like an action comic book."*
- Picked option B (caption boxes), then approved the per-speaker mockup with "yes".
- Roadmap 3.5: *"Portrait frames, typewriter text, skip/advance on tap."*

### Where this departs from the mockups [User, confirmed 2026-10-24]
The mockups show only a small "TAP ▸" cue, with **no Skip or Next buttons**. The option-B caption did say "Skip is always there". This spec **keeps both buttons** (`#story-dialog-skip`, `#story-dialog-next`) [User: "Keep Skip + Next"], for four reasons:
- keyboard and screen-reader users need something to focus
- touch users need a visible ≥ 44 px Skip
- the harness and tests use these ids
- "Next" makes "tap to advance" discoverable

The mockup's "TAP ▸" becomes a small "▸" mark inside the caption, shown once the line has finished typing (§3.4).

### Why
The dialog works, and its content (`src/data/story.js`) is final. It looks like a settings popup, though: a rounded navy card with a small square portrait and grey body text (`desktop1440-01-first-run-story.jpg`). It doesn't feel like the war story the 3.4 world map now tells. The comic look gives each speaker a side, a colour and a voice. The typewriter makes lines land one at a time, and tapping anywhere keeps it fast.

### Goals
1. Every story sequence reads as an action-comic caption panel in the game's own fonts and palette.
2. You can tell who is speaking at a glance (side, colour, shape) without reading the name.
3. A line types out, one tap finishes it, the next tap moves on, and Skip always ends the sequence.
4. Fully usable at 750×340 (iPhone 14 landscape), with Skip/Next ≥ 44×44 CSS px, caption text ≥ 11 px, and the longest line fitting without scrolling.
5. Everything is code-drawn around the three existing 256 px portrait PNGs. A future speaker needs a data row only, with no UI code.

### Non-goals
- New story text, new portrait art, voice or SFX.
- The in-level `#story-banner` (the mid-wave headline banner, separate markup driven by `StoryManager`).
- The 3.6 results screen.
- The Story Log list itself, apart from one colour fix (§10).

### Anti-goals (it "works" but counts as a failure)
- **Typing you can't skip.** Any tap, Enter or Space finishes the line at once. Skip and Esc end the whole sequence at any moment, including mid-slam.
- **A dialog tap that reaches the game,** or a game key that fires under the dialog. For example, Space pausing the level during a briefing, Q arming an ability, or the closing tap placing a tower or pressing LAUNCH underneath.
- **A double tap that throws away a line unread.** The tap that finishes typing must not also advance (§3.3).
- **Text that jumps as it types.** Words wrapping to the next line mid-word, or the caption growing line by line.
- **Buttons that move** between lines or between speakers.
- **An unreadable caption on a phone.** Clipped, scrolling, under 11 px, or a skewed portrait overlapping it.
- **Screen readers spelling the line out letter by letter,** or getting only the typed part.
- **Speaker styling hardcoded per id in UI code.**

## 2. Where the dialog plays (every call site)
`StoryDialogOverlay` is constructed in two scenes, and the shared DOM is `#story-dialog` in `index.html`.

| Call site | Sequence(s) | onComplete |
|---|---|---|
| `MapSelectScene.create` (first visit, after the title) | `campaign_intro` (4 panels: command, command, **rael**, command) | `markBeatSeen` + `_beginArrival()` |
| `MapSelectScene._bindStoryLog` (Story Log replay) | any seen beat, from `storyLogEntries` | no-op |
| `GameScene.create` (first entry to a map, not in debug) | `brief_<storyKey>` (2–4 panels; Veth appears in Titan's Reach, Enemy Homeworld and Last Light) | `markBeatSeen` |
| `GameScene._onVictory` (first win) | `epilogue_<storyKey>`, or `campaign_ending` on map 10 (4 panels: rael, command, command, rael) | `markBeatSeen` + `_showVictoryOverlay` |
| `MapSelectScene.shutdown` / `GameScene.shutdown` | — | `close()` (silent teardown) |

**API [Claude]:** keep `play(sequenceId, onComplete)` and `close()` exactly as they are, so no call site's logic changes. The constructor gains one optional argument:

```js
new StoryDialogOverlay({ motion: () => this.game.registry.get('ambientMotion') !== false });
```

Both scenes pass it, because reduced motion must be read live from the registry (§6) and the overlay has no other route to it. Tests may also inject `now`/`raf`/`caf` (default `performance.now`, `requestAnimationFrame`, `cancelAnimationFrame`) so time is deterministic without fake rAF.

**Kept behaviour:**
- A missing or empty sequence calls `onComplete` at once and never shows.
- `play()` while open finishes the open sequence first, so its `onComplete` runs and its beat is still marked seen.
- `close()` never calls `onComplete`.

## 3. Interaction

### 3.1 Inputs [Claude, from the user's "tap finishes, next tap advances"]
| Input | Action |
|---|---|
| Tap/click **anywhere on the overlay** (portrait, caption, name, dim backdrop) except Skip | **Primary** |
| `#story-dialog-next` (click, or Enter/Space while focused) | **Primary** |
| `#story-dialog-skip` (click, or Enter/Space while focused) | **Skip** |
| Enter / Space (focus anywhere except Skip) | **Primary** |
| Escape | **Skip** |
| Tab / Shift+Tab | Cycles focus between Skip and Next only (focus trap; `aria-modal`) |
| Any other key with no Ctrl/Cmd/Alt | Swallowed (`stopPropagation`, no `preventDefault`), so no game shortcut fires under the dialog |
| Ctrl/Cmd/Alt combos | Untouched (browser shortcuts, the same `isBrowserShortcut` rule as 3.4) |
| A key auto-repeat (`e.repeat`) | Ignored (swallowed, no action), so a held Enter can't run through a briefing |

- **Primary** while typing finishes the line. While the line is complete, it advances (after the guard in §3.3), or on the last panel it finishes the sequence.
- **Skip** finishes the whole sequence now. `onComplete` runs once, so the beat is still marked seen.

**Backdrop tap: changed from today [Claude].** Today a click on the dim backdrop finishes the whole sequence. From now on it counts as **Primary**.
- Why: a stray tap on the backdrop (the most likely place for a miss on a phone) should never throw away a whole briefing.
- Skip stays one explicit tap away, and Esc still skips.
- Comics are read by tapping anywhere, which is what the roadmap's "advance on tap" means.

### 3.2 Event plumbing (why each choice)
- **One delegated `click` listener on `#story-dialog`.** `e.target.closest('#story-dialog-skip')` means Skip; anything else is Primary. That's one add/remove pair instead of three.
  - `click` is the **last** event of a tap, so a gesture that closes the dialog has nothing left to land on the map, a node or LAUNCH below (the 3.4 title rule).
  - Set `cursor: pointer` on the overlay. iOS Safari only fires `click` on non-control elements that have a listener and/or a pointer cursor.
  - Also set `user-select: none`, `-webkit-touch-callout: none` and `touch-action: manipulation`, so a long press doesn't select caption text or open the callout.
- **One `keydown` listener on `document`, capture phase.** It runs before `UIScene`'s document-bubble listener (Space → `ui:pause-toggle`, Q/W/E → abilities, Escape → `ui:cancel`) and before `InspectController`'s window listener.
  - While the dialog is open it calls `stopPropagation()` on every keydown except browser shortcuts.
  - It calls `preventDefault()` on the keys it handles (Enter, Space, Escape). That stops native button activation, so a focused Next isn't triggered twice.
  - It decides Primary or Skip from `document.activeElement`.
  - It **ignores events already `defaultPrevented`.** `MapSelectScene`'s 250-ms entry guard shares document capture and is registered first. It `preventDefault`s the title's leftover key events, and `stopPropagation` can't stop a sibling listener on the same node.
- **Closing-gesture tail.** If a key closes the sequence, the dialog swallows that key's next `keyup` (capture, once). The swallow is removed on the next `keydown` or on `close()`. This way a Space released after closing can't activate whatever now has focus, such as LAUNCH.
  - A click needs no tail, because it is already the last event.
- **Focus:**
  - `play()` remembers `document.activeElement` and focuses `#story-dialog-next`. Programmatic focus after a pointer gesture shows no ring (`:focus-visible`).
  - Finishing or `close()` puts focus back on the remembered element if it is still connected and visible. Otherwise focus is left on `<body>`. This covers the Story Log entry, which is hidden by then.

### 3.3 State machine (pure; §5.1 `dialogFlow.js`)
Per panel, the phase is `typing` → `complete`. The sequence ends in `done`.

```
play(seq) ─► typing(i=0) ──primary──► complete(i) ──primary (≥ advanceGuardMs after complete)──► typing(i+1)
                │  time ≥ typeEnd ──────────►│                                                    │
                │                             └─primary, last panel (after guard)──► done ◄────────┘ (i+1 = length)
   any state ──skip──► done                   reduced motion: each panel starts in complete
```

- **`advanceGuardMs`** (seed 250 ms): a Primary that arrives less than this long after the line became complete is ignored. It covers three cases:
  1. **Double tap:** tap 1 finishes typing, tap 2 (≤ 250 ms later) is dropped, and the line is never skipped unread.
  2. **Reduced motion:** a line appears complete at once, so a stray tap in flight when the dialog opens can't skip it.
  3. **Victory:** the epilogue opens the moment the last enemy dies, while the player may still be tapping the map.
  
  The guard applies to advancing only. Finishing the typing is never guarded, because it is harmless, and Skip/Esc are never guarded.
- `typeEnd` = panel start + `typeDelayMs` + the typewriter duration (§3.4). When `now ≥ typeEnd`, the next tick moves the phase to `complete` with `completeAt = typeEnd` (not the tick time), so the guard is measured from when the line actually finished.
- An empty panel text (prevented by `story.test.js`, handled anyway) is `complete` at once.
- Everything is timestamp-driven from `now()`. **One rAF loop** runs only while a panel is `typing`. It writes DOM only when the shown-character count changes, and it stops at `complete`. There's no `setTimeout`/`setInterval` anywhere. The guard is a timestamp compare.

### 3.4 Motion (motion on) [User: slam + typewriter; Claude: timings, seeded from the approved `comic-dialogs.html`]
| Beat | When | What |
|---|---|---|
| **Slam** | A panel whose speaker differs from the previous panel's (and the first panel) | The portrait panel slams in from its own side: translate ∓14 %, scale 1.08, opacity 0 → slight overshoot → rest. `slamMs` 450, `cubic-bezier(.2,.9,.3,1.2)`. The name tab and caption pop in (scale .6 → 1.04 → 1, opacity 0 → 1), `captionPopMs` 300, starting `captionDelayMs` 120 into the slam. |
| **Swap** | Same speaker as the previous panel (e.g. `campaign_intro` 1→2, `campaign_ending` 2→3) | No re-slam: the portrait and name stay put. The caption alone does a short punch (scale .96 → 1, `swapMs` 140). [Claude] Re-slamming the same face every line reads as jitter. |
| **Typewriter** | Starts `typeDelayMs` after the panel shows: `slamDelayMs` 450 after a slam, `swapDelayMs` 140 after a swap | `msPerChar` 28 (the mockup's speed, about 36 chars/s), plus `punctPauseMs` 90 after `. ! ? … —` [Claude; set it to 0 to drop it]. The longest line (§4.3) types in about 4.3 s. Tap finishes it. |
| **Continue mark** | Phase `complete` | A small ink "▸" at the caption's bottom-right inside corner, blinking (`steps(2)`, 1.1 s, as the mockup's cue). It sits in reserved padding, so it never shifts the layout. On the last panel it's the same mark. |
| **Glitch** (speaker `glitch: true`) | Loops while that speaker is on screen | Portrait and caption jitter: translate ≤ 0.6 % plus `hue-rotate(40deg)` for about 120 ms every `glitchPeriodMs` 2400. The caption is offset 300 ms from the portrait, as in the approved mockup. That is far below 3 flashes/s (WCAG 2.3.1). |

**Implementation constraints:**
- **Slam and glitch animate the individual `translate` / `scale` / `rotate` properties, never `transform`.** The skew lives on `transform`, so an animation of `transform` would wipe the skew mid-slam. Supported in Chrome 104, Safari 14.1 and Firefox 72, all older than the kit's own `color-mix()` floor.
- **Skip and Next sit outside every animated subtree.** Nothing that contains them slams, pops or glitches. A real tap at any moment lands where the button is drawn, and Playwright's "stable" actionability check never waits on them.
- Timings live in `src/data/storyDialog.js` (§4.2). The overlay publishes them as `--sd-*` custom properties on `#story-dialog` (`--sd-slam-ms`, …), and the CSS reads them. JS stays the single source (the `--title-*` precedent from 3.4).
- The overlay re-runs a one-shot animation by toggling its class with a forced reflow (the `replay()` helper pattern in `MapSelectScene`) [Builder may use WAAPI instead, guarded for jsdom].

### 3.5 Text never moves while typing [Claude]
- The caption always holds the **full** line in two spans:
  ```html
  <span class="sd-typed">Forty years of si</span><span class="sd-rest">lence beyond…</span>
  ```
  `.sd-rest` is `visibility: hidden`.
- Line breaks are fixed by the full text from the first frame. A word is never re-wrapped mid-type, and the caption height never changes while typing.
- Split by code points (`Array.from`), never inside a surrogate pair. Today's text is all BMP (`—`, `…`, `’`), but a future emoji must not break.
- `#story-dialog-text.textContent` is always the full line. The existing tests and harness checks keep working.
- **Between panels** the caption height may change (one line vs three), but nothing below it moves: Skip and Next are in their own fixed row (§7). The caption must fit its row, which is enforced by the audit in §8.3.

## 4. Visual spec

### 4.1 Composition (all speakers) [User: option B + per-speaker mockup]
There's no enclosing card. Over the dim backdrop, a centred **stage** holds two rows:

1. **Panel row** (fixed height per layout class, §7), left to right for a `left` speaker and mirrored for a `right` one:
   - **Portrait panel:**
     - skewed `skewX(∓skewDeg)` (seed 6°), negative for left and positive for right
     - thick ink border (≈ 6u desktop / 4u compact) with a coloured outline in the speaker's `color` (≈ 3u / 2u)
     - a hard offset ink drop shadow toward the bottom-right (≈ 12u / 8u, no blur)
     - the portrait image is counter-skewed and scaled 1.12 so it fills the frame with no wedges
     - a **halftone dot overlay** on top: `radial-gradient` dots, `mix-blend-mode: multiply`, about 0.5 opacity, dot pitch ≈ 9u desktop / 6u compact
   - **Speaker column:**
     - **name tab**: an ink background, the name in the speaker's `color`, a 4u border in the speaker's `color`, a hard 7u ink shadow. Uppercase with wide tracking.
     - below it the **caption box**: a solid fill in the speaker's `caption` colour, ink text, a thick ink border (≈ 4u), a hard ink drop shadow (≈ 7u, no blur). Padding reserves room for the "▸" mark.
2. **Action row** (fixed height, never moves): `Skip` and `Next ▸` (`Continue ▸` on the last panel, as today), **right-aligned for every speaker** [Claude]. A fixed spot means thumbs and the mouse never hunt for it. The mockup's mirrored "TAP" cue is replaced by the in-caption "▸".

**Paint rules:**
- **"Ink"** = `var(--ui-bevel-lo)` (`#070910`), an existing derived token and the nearest to the mockup's `#05070d` [Claude].
- Speaker colours reach the CSS as `--sd-frame` and `--sd-caption`, which the overlay sets from data on `#story-dialog` per panel.
- Every other colour is a `--ui-*` token. Dialog rules carry **no hex literals**. The only colour function allowed is `rgba(0,0,0,a)`, for the backdrop dim and the halftone dots. A guard enforces this (§8.1).
- Every border, outline and shadow length is `calc(N * var(--ui-u))`.

**Fonts** (no new comic font) [User]:
- Name tab:
  - Orbitron 700 where it renders ≥ 16 px (tall class, 16 px–`--ui-fs-lg`; never `--ui-fs-md` 15 px) [Claude, from the builder check]
  - Rajdhani 700 uppercase below that (compact class), per the art bible's "Orbitron ≥ 16 px only" rule
- Caption: Rajdhani 700, sentence case. Use `--ui-fs-lg`–`--ui-fs-xl` (18–24) on tall and `--ui-fs-md` (15) on compact, line-height 1.3.

**Kit:**
- Skip and Next stay **kit buttons** (`.ui-btn`, `.ui-btn--primary` on Next), unchanged [Claude]. They read as game UI, not as part of the comic.
- The comic surfaces (frame, tab, caption) are **not** kit surfaces. They are speaker-coloured, which the kit can't express.
- `.story-dialog-card` loses `ui-panel` (there's no card any more). Its `kitRollout` SURFACES entry is removed.

### 4.2 Per-speaker variants [User: approved mockup]
| Speaker | `side` | Frame/name `color` | `caption` fill | `shape` | `glitch` |
|---|---|---|---|---|---|
| Sol Command (`command`) | left | `0x4aa3ff` (unchanged) | `0xffd700` (= `--ui-currency`) | `box` | no |
| Commander Rael (`rael`) | **right** (portrait right, skew reversed, column to its left) | `0xffd24a` (unchanged) | `0xfff3c4` (pale gold) | `box` | no |
| The Veth (`veth`) | left | **`0xb57bff`** (was `0x9b4dff`) | `0xd9c2ff` (pale violet) | `jagged` | yes |
| unknown/missing speaker | left | `--ui-panel-edge` | `--ui-text` | `box` | no |

- **Veth colour change [Claude]:** `0xb57bff` is what the approved mockup used. The old `0x9b4dff` is only ~4.6:1 as name text on the ink tab, right at the limit. Only `portraitFallback` (the fallback block colour) and this dialog read `STORY_SPEAKERS.color`.
- **Jagged caption:**
  - The irregular polygon from the mockup is `clip-path: polygon(0 8%, 3% 0, 97% 0, 100% 10%, 98% 92%, 100% 100%, 4% 100%, 0 88%, 2% 50%)`.
  - `clip-path` would clip the ink border and the hard shadow, so build it in layers:
    - an ink layer clipped to the polygon
    - the fill layer, inset by the border width, clipped to the same polygon
    - the hard shadow as `filter: drop-shadow(…)` on the **unclipped parent**, so it follows the jagged edge
  - The text box inside keeps the same padding as `box`, so a Veth line wraps exactly like any other.
- **Fallback portrait** (no registered art, or a runtime `img` error → fallback):
  - It gets the **same frame**: skew, ink border, coloured outline, halftone, shadow.
  - The face is a solid `color` block with the initial (`resolvePortrait().initial`) in Orbitron 700 ink, centred and counter-skewed.
  - Unknown speaker: `?` on `--ui-panel-edge`.
- **Contrast floor:** each speaker's `caption` vs ink, and `color` vs ink (name on the tab), must be ≥ 4.5:1. This is tested with the existing `contrastRatio` from `src/ui/theme.js` (§8.1).
  - Command gold ≈ 14:1
  - Rael pale gold ≈ 17:1
  - Veth pale violet ≈ 12:1
  - Command name blue ≈ 7.5:1
  - Veth name `0xb57bff` ≈ 6.8:1

### 4.3 Longest line
- Currently the longest panel is `campaign_ending[2]` (Command, ≈ 137 chars: "Earth is sending word to every colony, …"). Next come `brief_titans_reach[2]` and `campaign_intro[0]` (≈ 133).
- Tests and the harness **derive** the longest panel from `STORY_SEQUENCES`. They never hardcode it, so a future line can't slip past.
- At the compact caption width (≈ 540 px of text at 15 px Rajdhani) it is 2–3 lines. At the tall width it is 2 lines.

## 5. Module breakdown

### 5.1 Pure modules (Vitest, no DOM, no Phaser)
| Module | Exports (illustrative) | Notes |
|---|---|---|
| `src/systems/typewriter.js` (new) | `revealTimes(text, cfg)` → ms per code point; `typeDurationMs(text, cfg)`; `charsShown(text, elapsedMs, cfg)` → 0…length | `cfg = { msPerChar, punctPauseMs }`. `elapsedMs` ≤ 0 or NaN → 0. `Infinity` or ≥ duration → full length. Monotonic non-decreasing. Empty text → duration 0. |
| `src/systems/dialogFlow.js` (new) | `startFlow(sequence, now, opts)`, `primary(state, now, cfg)`, `skip(state)`, `tick(state, now, cfg)`, `view(state, now, cfg)` → `{ index, phase, shown, isLast, transition }` | Built **on** `storySequence.js` (`createSequence`/`currentPanel`/`advance`/`atEnd`/`isComplete` stay and are reused), adding the phase layer from §3.3. `opts.motion` false → every panel starts `complete`. `transition` is `'slam'` or `'swap'` (speaker changed or not), and it picks `typeDelayMs`. Returns new objects and never mutates. |
| `src/systems/speakerLook.js` (new) | `speakerLook(speakerId, speakers, defaults, registered)` → `{ id, name, side, frame, caption, shape, glitch, portrait }` | Fills missing fields from `SPEAKER_LOOK_DEFAULTS`. It also sanitizes them: an unknown `side` becomes `left` and an unknown `shape` becomes `box`. `frame`/`caption` are CSS hex strings (numbers masked to 24 bits, like today's `hexColor`). `portrait` = `resolvePortrait(...)`. An unknown id gets the default look, name `''` and portrait `?`. |

### 5.2 Data (`src/data/`)
- **`src/data/story.js`:** `STORY_SPEAKERS` rows gain `side`, `caption`, and optionally `shape` and `glitch` (§4.2). There's no other change to story content. A future speaker is one row.
  ```js
  veth: { name: 'The Veth', color: 0xb57bff, portraitKey: 'portrait-veth',
          side: 'left', caption: 0xd9c2ff, shape: 'jagged', glitch: true },
  ```
- **`src/data/storyDialog.js` (new):**
  - `STORY_DIALOG` = `{ msPerChar: 28, punctPauseMs: 90, punctChars: '.!?…—', slamMs: 450, slamDelayMs: 450, captionDelayMs: 120, captionPopMs: 300, swapMs: 140, swapDelayMs: 140, advanceGuardMs: 250, glitchPeriodMs: 2400, glitchMs: 120, glitchCaptionOffsetMs: 300, continueBlinkMs: 1100, skewDeg: 6 }`
  - `SPEAKER_LOOK_DEFAULTS` = `{ side: 'left', shape: 'box', glitch: false }`. The unknown speaker's frame and caption colours come from tokens in CSS, flagged by `data-speaker="unknown"`.
- **`docs/art-bible.md` §2:** add a short "Story speakers" table (frame + caption per speaker) with the same note as the Veth emissives table: the source of truth is `STORY_SPEAKERS`, and this table must match it. These are content colours like enemy emissives, not UI chrome, so the six-token UI palette is unchanged.

### 5.3 DOM (thin, no rules)
- **`src/ui/StoryDialogOverlay.js` (rewritten inside the same API):**
  - Owns the one click and one keydown listener (§3.2), the optional keyup tail, and the one rAF loop.
  - Per render:
    1. calls `view()`
    2. sets `data-index`, `data-phase` (`typing|complete`), `data-speaker`, `data-side`, `data-shape`, `data-glitch` and `data-transition` on `#story-dialog`, plus `--sd-frame` and `--sd-caption`
    3. toggles `.motion-off`
    4. replays the slam/pop or swap class only on a panel change
    5. writes `.sd-typed`/`.sd-rest` only when `shown` changes
    6. updates the live region once per panel (§9)
  - `close()` is idempotent. It removes every listener (including a pending keyup tail), cancels the rAF, clears animation classes, hides the overlay and restores focus. It never calls `onComplete`.
  - It reads `motion()` at each `play()` and at each panel change.
  - **Removed:** the inline `style.color`/`style.background` writes and the `'#fff'` fallback (part of #50b).
- **`index.html`:**
  - Markup under `#story-dialog`. **Ids kept:** `#story-dialog`, `#story-dialog-portrait`, `#story-dialog-name`, `#story-dialog-text`, `#story-dialog-next`, `#story-dialog-skip`.
  - **Added:** `#story-dialog-stage`, `#story-dialog-live` (visually hidden), and wrappers for the frame, tab, caption and action row [Builder names the classes, `sd-*` prefix].
  - `#story-dialog` gets `role="dialog"`, `aria-modal="true"`, `aria-label="Story"`. No `title=` attributes (the `noNativeTitles` guard).
  - CSS: replace the `.story-dialog-*` rules (lines ≈ 360–372). Keep `.story-dialog-actions button` in the coarse-pointer 44-px list, or its renamed equivalent.
- **Scenes:** each constructor call gains `{ motion }` (§2). No other scene change.

**Rejected alternatives:**
- Canvas or Phaser-drawn dialogs: they lose DOM text (fonts, a11y, layout audit), and the dialog must also run on the world map, where there is no Phaser scene graph worth using.
- A separate dialog per call site: four copies of one behaviour.

## 6. Reduced motion
- The source is the registry flag `ambientMotion` (the saved setting wins, otherwise `prefers-reduced-motion`; `resolveAmbientMotion`).
- It is read live through the injected `motion()` at `play()` and at every panel change. Settings can't be opened while the modal dialog is up, so this is live in practice.
- It is applied as `.motion-off` on `#story-dialog`, never as a CSS media query (3.4 rule: the saved setting can override the OS).

| Thing | Motion on | Motion off |
|---|---|---|
| Portrait slam, caption pop, swap punch | §3.4 | None: panels appear in their final pose |
| Typewriter | Types | Full line at once (`phase = complete` on the first frame) |
| Glitch (Veth) | Periodic flicker | None; the jagged shape and violet stay |
| Continue "▸" | Blinks | Static |
| Advance guard | 250 ms | 250 ms (still needed, §3.3) |

Under `.motion-off`, the dialog subtree has **no running animations** (`getAnimations()` is empty). The harness checks this (§8.3).

## 7. Per-device layout
There are two layout classes, using the existing `COMPACT_QUERY` (`max-height: 500px`, `src/data/mobile.js`), plus pointer class for touch sizes.
- **Tall:** desktop 1280×720 / 1440×900 / 1920×1080, iPad Pro 11.
- **Compact:** iPhone 14 at 750×340, Pixel 7, 844×390, 932×430.

| Element | Tall | Compact |
|---|---|---|
| Stage | `min(1100px, 92vw)`, centred, with 2.3's safe-area padding | Full width minus safe-area insets and `--ui-sp-sm`–`md` padding |
| Panel row height | Fixed: the portrait height plus its shadow | Fixed: the portrait height plus its shadow |
| Portrait | ≈ 230×264 (the mockup's 20:23), `clamp()`ed to the viewport | Height `min(48dvh, 160px)`, same aspect (≈ 140×160) |
| Name tab | Orbitron 700, 16 px–`--ui-fs-lg` | Rajdhani 700 uppercase, `--ui-fs-sm` |
| Caption | Rajdhani 700, `--ui-fs-lg`–`xl` | Rajdhani 700, `--ui-fs-md` (15) |
| Action row | Directly under the panel row, right-aligned; kit buttons ≥ 40 px fine / ≥ 44 coarse | Same; Skip and Next ≥ 44×44 |

- **Skew bleed:** a skewed frame overhangs its box by `tan(skewDeg) × h/2` (≈ 8 px at 160 px tall), plus the hard shadow. The gap between portrait and column, and the stage's side padding, reserve at least that. Otherwise the frame overlaps the caption or clips at the screen edge on the mirrored side.
- **Budget check at 750×340:** 340 − 2×8 padding − 44 action row − 8 gap = 272 px for a 160-px panel row. The caption column is ≈ 750 − 16 − 140 − 24 − 16 ≈ 550 px wide. The longest line is 2–3 lines at 15 px, inside the 160 − tab (≈ 28) = ~130 px caption allowance, which holds about 5 lines.
- **Fallback fonts** (`*.woff2` blocked) use the condensed body stack, so lines get no longer.
- [Builder] may use `clamp()` with `dvh`/`vw`, or container query units on the stage (the mockup's `cqw`). Container query units need Safari 16 / Chrome 105, both already below the kit's `color-mix()` floor.
- Portrait-orientation phones: `#rotate-prompt` (z 1000) covers the dialog, as it does every screen. Rotating re-flows by CSS alone; typing continues from its timestamp.
- Z-order is unchanged: `#story-dialog` z 18 sits over the world map (z ≤ 16) and the HUD (z 6), and under `#game-msg` (20), which never shows together with it.

## 8. Testing strategy
Every new test is mutation-checked: break the code, then watch *that* test fail (memory: "prove the test fails").

### 8.1 Unit (Vitest)
1. **`typewriter`:**
   - 0 at t ≤ 0 and at NaN
   - full length at the duration and at `Infinity`
   - monotonic over a sweep of t
   - the punctuation pause delays exactly the next character
   - empty text → duration 0
   - an astral-plane character counts as one and is never split
   - a duration check on the derived longest line
2. **`dialogFlow`:**
   - typing → complete on Primary; on tick past `typeEnd`, with `completeAt = typeEnd`
   - a Primary within `advanceGuardMs` of complete is ignored, and at or after the guard it advances
   - the last panel's Primary → `done`
   - `skip` from typing, complete and mid-delay → `done`
   - motion off: every panel starts `complete`, and the guard still holds
   - `transition` is `slam` on a speaker change (including the first panel and command → veth, both left-side), and `swap` on the same speaker (`campaign_intro` 0→1)
   - a 1-panel sequence: `isLast` from the start
   - an empty sequence: `done` at start
2b. **`storySequence`:** existing tests unchanged.
3. **`speakerLook`:**
   - each speaker's side, shape, glitch and colours
   - unknown id → defaults, `?` portrait, empty name
   - a row missing `side`/`shape` → defaults
   - garbage values sanitized
   - a registered portrait → `image`, unregistered → `fallback`
4. **`story.test.js` additions:**
   - every speaker has a valid `side` (`left|right`), `caption` (a number), and `shape`/`glitch` either absent or valid
   - contrast ≥ 4.5:1 for `caption` vs ink and `color` vs ink, with ink taken from `deriveShades(PALETTE, MIX).bevelLo`, never a literal
   - at least one `right` speaker exists (else the mirror layout is dead code)
5. **`StoryDialogOverlay.test.js`** (jsdom, injected `now`/`raf`). The existing cases are rewritten where §3 changed them:
   - Next during typing finishes the line (`data-phase` → `complete`, `.sd-typed` = the full line), and a second Next after the guard advances
   - a backdrop click is **Primary**, not skip (replaces today's "backdrop click closes")
   - Skip during typing → `onComplete` exactly once, hidden
   - Escape → skip
   - Enter/Space → Primary, `defaultPrevented`, and **not** propagated: a document-bubble spy (standing in for `UIScene`) sees nothing
   - a Q keydown is not propagated
   - Ctrl+R is propagated
   - an `e.repeat` Enter does nothing
   - an event already `defaultPrevented` (the entry guard) is ignored
   - a closing Space swallows its keyup once, and a later keyup passes
   - focus goes to Next on play and returns on close
   - Tab wraps between Skip and Next
   - `#story-dialog-text.textContent` is the full line at every phase
   - the live region holds "Name: line" once per panel
   - `close()` mid-typing: no further DOM writes after more rAF ticks, `onComplete` not called, rAF cancelled
   - `close()` twice is safe
   - re-entrant `play()` (existing two tests kept)
   - motion off: complete at once, no animation classes
   - data attributes and `--sd-*` vars per speaker, including Rael `data-side="right"` and Veth `data-shape="jagged"` `data-glitch="1"`
   - fallback portrait renders the initial inside the same frame element
   - `img` `error` → fallback
   - **Listener pairing:** play → close ×3 leaves no document/overlay listeners (count `addEventListener`/`removeEventListener` pairs, the 2026-08-17 leak-test pattern)
6. **Scenes:**
   - both scenes construct the overlay with `motion`, and the registry flag flips it live
   - `MapSelectScene.worldMap`/`arrival` tests keep passing (they click `#story-dialog-skip`)
   - a GameScene test: Space during the briefing does **not** emit `ui:pause-toggle` (UIScene's listener is wired)
7. **CSS guards stay green, plus:**
   - `themeCss`, `typeFloor` (no dialog `font-size` < 11 px), `noNativeTitles`, `railCss`
   - `kitRollout`: remove `.story-dialog-card`; `#story-dialog-next`/`-skip` stay
   - **new guard:** rules whose selector names `#story-dialog`, `.story-dialog` or `.sd-` hold no hex literal, and no colour function except `rgba(0,0,0,a)`. Lengths for borders, outlines and shadows use `var(--ui-u)` (modelled on the radial guard)
   - extend the `#50b` intent: the guard's rule set must not be empty (a vacuous-filter check)

### 8.2 Device matrix (`npm run matrix`)
- The step table is unchanged (desktop 17/17, touch 18/18). No renumbering, and `deviceFlow.test.js` is untouched.
- **`skip-story` step:**
  - before Skip, with real input:
    - tap the caption → expect `#story-dialog[data-phase="complete"]` and `data-index="0"`
    - wait > `advanceGuardMs` and tap the caption again → expect `data-index="1"`
  - then tap `#story-dialog-skip` as today
- **`briefing` step:**
  - when shown, tap the caption once → expect `data-phase="complete"`, then shoot, then Skip
  - this proves tap-to-finish on every device and gives a fully typed screenshot
- **New assertion after Skip in `briefing`:** `#wave-btn` still reads "▶ Send Wave 1" and `#paused-overlay` is not shown. The closing tap leaked nothing into the level.
- **Layout audit:** `STORY_TARGETS = ['#story-dialog-skip', '#story-dialog-next']` is audited on the first-run story (touch ≥ 44, in viewport, not clipped). This closes the story-dialog half of #41c.

### 8.3 Screens (`npm run capture -- --screens`, 5 devices)
- **First run:**
  - `01a-story-typing.png` at slam end + ~500 ms (partial text, mid-type)
  - `01-first-run-story.png` after `data-phase="complete"` (replaces today's fixed 1.5-s wait)
  - plus `audit(..., 'story', STORY_TARGETS)` and `storyDialogProblems` (below)
- **`winMapZero`:** wait for `data-phase="complete"` before the story shot.
- **New `captureStoryGallery` run** (new context). Seed `lastlight_save` with every beat in `seenStoryBeats`, open the Story Log, then:
  - **Finale** (`campaign_ending`): step through all 4 panels with real taps. Shoot `10-story-rael.png` (right, mirrored) and `10b-story-command.png`, and at the derived longest panel `10c-story-longest.png` + `storyDialogProblems`.
  - **Asteroid Belt — Epilogue**: advance to panel 3, then shoot `10d-story-veth.png` (jagged, violet).
- **`captureMissingArt`:** also block `portrait-veth.png`, replay the Asteroid Belt epilogue, and shoot `10e-story-fallback.png` (the initial in the same frame).
- **`captureReducedMotion`:**
  - the first-run dialog shows `data-phase="complete"` on its first frame
  - `document.querySelector('#story-dialog').getAnimations({ subtree: true }).length === 0`
  - also with the Veth panel up
- **`captureNoFonts`:** the dialog lays out with no overflow (`storyDialogProblems` clean).
- **`storyDialogProblems`** (a pure function in `src/systems/layoutAudit.js`, or a sibling `storyDialogLayout.js`), fed measured painted rects. It reports:
  - caption overflow (`scrollHeight > clientHeight + 1`)
  - portrait, tab, caption or action row outside the viewport
  - portrait ∩ caption overlap, using the transformed bounding rect so skew bleed counts
  - caption or action row overlap
  - computed caption `font-size` < 11
  
  Unit-tested on synthetic rects.

### 8.4 Live smoke on the production build
Run `npm run build && npm run preview` at **1440×900** and **iPhone 14 landscape** (750×340), with the worktree's own Playwright and real input (memory: the MCP browser may be locked; Phaser and the DOM ignore synthetic events). Production has no `?debug`, so seed `lastlight_save`:
- **(a) A fresh save:**
  1. title → tap → `campaign_intro`
  2. watch the slam and typing
  3. one tap finishes, the next advances
  4. panel 3 is Rael on the right
  5. "Continue ▸" closes
  6. the map is interactive and nothing was selected
- **(b) A save with every beat seen:** Story Log → Finale, Asteroid Belt epilogue and Titan's Reach briefing, played through.
- **(c) Settings → ambient motion off:** replay a beat; the text is instant and nothing moves.
- **(d) A save with stars on map 1 but no `brief_lunar_gate` beat seen:** LAUNCH Lunar Gate. Then, on desktop:
  - Space and Enter advance the briefing
  - Space does not pause the game
  - Esc skips
  - a tap on a pad after closing opens the build radial normally
- **The victory epilogue** needs a win, so verify it in the `capture`-mode build via §8.3 (`winMapZero`). Say so in the PR rather than claiming a production check.

## 9. Accessibility
- `#story-dialog`: `role="dialog"`, `aria-modal="true"`, `aria-label="Story"`. Focus moves to Next and is trapped between Skip and Next (§3.2).
- **Full line, once:** `#story-dialog-live` is visually hidden (a new `.sr-only` utility), with `aria-live="polite"` and `aria-atomic="true"`. At each panel start it receives `"<Speaker name>: <full line>"`, including under reduced motion and including the first panel.
- The visual name and caption (`#story-dialog-name`, `#story-dialog-text`) are `aria-hidden="true"`, so nothing is read twice or letter by letter.
- The portrait `img` has `alt=""`. It's decorative, since the live region names the speaker (today it repeats the name).
- Next's accessible name is "Next" or "Continue" (`aria-label`), so "▸" isn't read out. Skip's is "Skip story".
- Every control is ≥ 44×44 on coarse pointers. Text contrast is ≥ 4.5:1 (§4.2). The glitch stays under the flash threshold (§3.4).

## 10. Absorbed backlog
- **#50b, inside the dialog only:**
  - `.story-dialog-text` `#e6e6e6`
  - `.story-dialog-portrait` `#0a0a0a`
  - the backdrop `rgba(2,4,10,0.78)` (→ `rgba(0,0,0,a)` or `--ui-panel`)
  - the JS inline `'#fff'` name fallback
  
  All go to tokens, guarded by §8.1-7.
- **#50b, `#story-log-inner h3 { color:#6bf }`:** 3.4 explicitly left this "for 3.5". It becomes `var(--ui-accent)` with `--ui-font-heading` (the art bible lists the story-log title as an Orbitron heading). That's a two-line change; the Story Log list is otherwise untouched.
- **Not absorbed:** `#story-headline { color:#5a9a6a }` belongs to the **in-level `#story-banner`**, which is separate markup (`#story-banner > .story-content > #story-headline/#story-body`, driven by `StoryManager`) and shares nothing with `#story-dialog`. It stays in #50b.
- **#41c remainder:** the story-dialog Next/Skip audit gap, via `STORY_TARGETS` (§8.2).

## 11. Edge cases (each covered by a test or an acceptance item)
| Case | Expected | Covered by |
|---|---|---|
| Missing sequence id | `onComplete` at once, never shown (as today) | 8.1-5 |
| Empty sequence (`panels: []`) | Same as missing | 8.1-2, 8.1-5 |
| One-panel sequence | "Continue ▸" from the start; Primary (after typing + guard) finishes | 8.1-2 |
| Empty panel text | `complete` at once; the caption keeps its one-line minimum height | 8.1-2 |
| Unknown speaker id | Default look (left, neutral frame and caption), empty name tab kept at its height (`visibility: hidden`, no layout shift), `?` portrait | 8.1-3, 8.1-5 |
| Speaker row missing `side`/`shape`/`glitch` | Defaults; no UI change needed for a new speaker | 8.1-3 |
| Missing portrait art (unregistered) | Initial-letter fallback inside the same skewed, inked, halftoned frame | 8.1-5, 8.3 `10e` |
| Registered art that errors at runtime | `img` `error` → same fallback | 8.1-5 |
| Very long line (derived longest, currently `campaign_ending[2]`) | Fits without scroll or clipping at 750×340 and 1440×900, fonts on and off | 8.1-1, 8.3 `10c` + no-fonts |
| A line wrapping while typing | Never: the full text is laid out from frame 1 | 8.1-5, acceptance 5 |
| Consecutive same speaker | Swap, no re-slam; the portrait stays put | 8.1-2, acceptance 4 |
| Speaker change on the same side (command → veth) | Slam (the speaker changed) | 8.1-2 |
| Side flip (rael ↔ command) | Mirrored composition; action row unmoved | acceptance 3, 6 |
| `play()` while another sequence is open | The previous `onComplete` runs once, listeners are not stacked, the rAF restarts, and the new first panel slams | 8.1-5 |
| Scene shutdown mid-typing or mid-slam | `close()`: rAF cancelled, listeners removed, keyup tail removed, `onComplete` **not** called (the beat stays unseen and replays next time, as today) | 8.1-5 |
| Rapid double tap | Tap 1 finishes, tap 2 within 250 ms ignored, tap 3 advances | 8.1-2, 8.2 |
| Tap during the slam (before typing starts) | Finishes the line | 8.1-2 |
| Held Enter/Space | The first press acts, repeats are ignored | 8.1-5 |
| Space/Enter/Esc/Q during a briefing | Not seen by `UIScene` (no pause, no ability, no cancel) | 8.1-5/6, 8.4 (d) |
| The title's carried-over tap or key on a first run | Swallowed by `MapSelectScene`'s entry guard (click stopped before the overlay; keys `defaultPrevented` and ignored) | 8.1-5, 8.2 `skip-story` |
| Closing tap over the map or LAUNCH | Nothing below fires: close happens on `click`, the last event | 8.2 `briefing`, 8.4 (a)(d) |
| Closing with Space, focus restored to a button | The keyup is swallowed; nothing activates | 8.1-5 |
| Victory epilogue opening while the player taps | The first tap only finishes typing; a reduced-motion stray tap is caught by the guard | 8.1-2 |
| Story Log replay of every beat | Each of the 21 `STORY_LOG_LABELS` plays to the end with no console error; `onComplete` is a no-op, so nothing is marked again | 8.1-5 (loop over all ids), 8.3 gallery |
| `campaign_ending` multi-speaker run | rael (right, slam) → command (left, slam) → command (swap) → rael (right, slam) → "Continue ▸" → victory overlay | 8.1-2, 8.3 gallery |
| Reduced motion on, or toggled between beats | No slam, glitch or blink; the full text at once; the guard holds | 8.1-2/5, 8.3 |
| Tab hidden mid-typing | rAF pauses; on return the count jumps to the timestamp (usually complete) | 8.1-1 (time-based) |
| Resize or rotation mid-typing | CSS re-flow only; the spans keep wraps consistent; typing continues | acceptance 9 |
| Fonts land mid-typing | One reflow of both spans together; no per-character jump | 8.3 no-fonts |
| Portrait upright phone | The rotate prompt covers it, as every screen | existing |
| jsdom (no `animate`, no layout) | The overlay works; animation calls guarded | 8.1-5 |

## 12. Acceptance list (for the browser-acceptance agent)
Run on the production build unless noted, at 1440×900 and iPhone 14 landscape.
1. On a fresh first run, after the title tap the intro dialog appears with **no rounded card**:
   - Sol Command's portrait sits **left** in a slanted frame with a thick dark border, a blue outline, visible halftone dots and a hard offset shadow
   - "SOL COMMAND" sits on a dark tab in blue
   - the line is in a **solid gold** box with a thick dark border and a hard shadow
2. The portrait slams in, then the line types out letter by letter. One tap anywhere (portrait, caption or backdrop) shows the full line at once. Tapping again within a quarter second does nothing; a tap after that moves to the next line.
3. On panel 3 (Rael), the composition is **mirrored**: portrait on the **right**, slanted the other way, gold outline, **pale-gold** caption to its left.
4. Panels 1 → 2 (both Command): the portrait does **not** re-slam; only the caption punches and the new line types.
5. While a line types, no word jumps to the next line and the caption doesn't grow. Skip and Next never move, on any panel or speaker.
6. Skip and Next are bottom-right on every panel, and each is ≥ 44×44 CSS px on iPhone. On the last panel Next reads "Continue ▸".
7. Skip at any moment (mid-slam, mid-type, complete) closes the dialog. The intro does not return on reload.
8. In the Story Log, "Asteroid Belt — Epilogue" panel 3 shows **The Veth**: a violet outline, a **jagged pale-violet caption** that keeps its dark edge and hard shadow, and a brief flicker on portrait and caption every ~2.4 s.
9. In the Story Log, "Finale" plays rael → command → command → rael with correct sides. Its longest line fits fully, with no scrollbar and no clipping, at 750×340 and 1440×900. Rotating the phone mid-line keeps it laid out.
10. All caption and tab text is ≥ 11 px on iPhone. Desktop names are Orbitron; captions are bold Rajdhani.
11. Desktop keyboard during a level briefing:
    - Enter and Space finish, then advance
    - Esc skips
    - Space never shows "PAUSED"
    - Q does not arm an ability
    - Tab only cycles Skip ↔ Next
12. After a briefing closes with a tap over the map, nothing is built, selected or launched. The next tap on a pad opens the build radial normally. "▶ Send Wave 1" is unchanged.
13. With Settings → ambient motion off: lines appear complete at once, nothing slams, flickers or blinks, and a single tap right after opening does not skip the first line.
14. With `portrait-veth.png` blocked (capture run): the Veth panel shows a violet block with "T" inside the **same** slanted, inked, halftoned frame.
15. Capture build: winning map 1 on a fresh save plays its epilogue in the new style, then the victory overlay.
16. With fonts blocked: the dialog still lays out with no overflow.
17. Screen reader (VoiceOver spot check, or an assertion on `#story-dialog-live`): each panel is announced once as "Speaker: full line", never letter by letter.

## 13. Out of scope
- The in-level `#story-banner` (separate markup; its `#5a9a6a` stays in #50b), the 3.6 results screen, new portrait art, new story text, voice, and SFX.
  - There is no UI-click SFX key in `SFX_KEYS`, and the overlay has no registry audio handle, so no existing hook is trivially reusable.
- A Story Log redesign, and reopening the list after a replay.
- A comic display font (the user ruled it out), speech balloons with tails (option A), and speed-line strips (option C).
- Higher-resolution portraits. The PNGs are 256 px, so on a 2× desktop the ~240-CSS-px frame upsamples slightly. Phase 4 art could replace them through the existing `portraitPath` slot with zero code change.

## 14. Resolved questions
**Decided by the user (2026-10-24):**
1. **Skip and Next buttons stay**, although the mockups show only "TAP ▸" (§1). The tap cue becomes an in-caption "▸".
2. **A tap on the backdrop advances one line** instead of skipping the whole sequence (§3.1).

**Claude's calls (2026-10-23).** Each is a default the user may override:
3. **Same speaker twice:** no re-slam, a caption punch only (§3.4).
4. **Typing speed** is the mockup's 28 ms/char plus a 90-ms sentence pause. The longest line takes about 4.3 s untapped. If that feels slow, the dial is `msPerChar` (20 ms gives ≈ 3.2 s).
5. **Veth frame colour** `0x9b4dff` → `0xb57bff`, matching the approved mockup and lifting name contrast above the 4.5:1 edge.
6. **Skip and Next keep the HUD kit look**, not a comic look.
7. **Ink** = the existing `--ui-bevel-lo` token, and the speaker colours are documented as content colours in the art bible. The six-token UI palette is unchanged.

**Builder-check notes (Claude, 2026-10-24):**
- Slam and glitch both animate `translate`, so they go on nested elements (outer = slam, inner = glitch).
- `isBrowserShortcut` moves out of `MapSelectScene` into a shared pure helper that both the map and the dialog import.
- The PR targets `visual/integration`, not `main`.
