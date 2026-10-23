# Theme module (visual roadmap 3.1) — design

Branch `visual/3.1-theme-module` (contains roadmap 2.1–2.4 and #43). Vanilla JS, Phaser 3.88, Vite 5, Vitest + jsdom.

## Problem / goal

The HUD and overlays are DOM styled by one ~650-line `<style>` in `index.html`. It has about 40 hand-picked colour literals: three navies for "panel" (`#0f0f1e`, `#0a1018`, `#0e1620`), a brass edge (`#8b6914`) next to the art bible's `#2a3a4a`, and green, blue and red buttons that each restate their own border, padding and hover. Fonts are mixed too. The body is Georgia, settings use Courier New, and most `<button>`s fall through to the UA system font because buttons don't inherit `font-family`. The 3.x screens (3.3 radial menus, 3.4 title/map select, 3.5 story dialogs, 3.6 results) need one shared kit to build on. 3.1 delivers that kit: tokens, bundled fonts, and procedural panel/button surfaces with states. It then moves the in-level HUD and its overlays onto the kit. It does not redesign any screen.

**Decided (not reopened):** Orbitron for headings and titles. Rajdhani for body text, HUD rail labels, story narration and codex lore. Both are bundled via `@fontsource/orbitron` and `@fontsource/rajdhani`. **Georgia is removed entirely.** The palette is art-bible §2 "UI" (panel `#0f1424`, panel-edge `#2a3a4a`, accent `#4fc3f7`, currency `#ffd700`, danger `#f07a7a`, text `#e8e0d0`) plus the §2 status colours. There are no new hues, only mixes of these.

## Requirements

1. **R1 Tokens in `src/data/theme.js`.** Frozen `PALETTE` (the six UI tokens plus status slow/burn/stun/armour/heal/gold, exactly as written in the bible), `MIX` (ratios for derived shades), `FONTS` (`heading` and `body` stacks as plain strings), `FONT_FACES` (`[{family, weight}]`), `TYPE_SCALE` (CSS px), `SPACING` (CSS px), `EFFECTS` (scanline/bevel/glow alphas). Tunables go in `src/data/`, per CLAUDE.md. The roadmap's `src/ui/theme.js` holds the logic (R2).
2. **R2 Pure helpers in `src/ui/theme.js`.**
   - `mixHex(a, b, t)` → `#rrggbb`
   - `contrastRatio(fg, bg)` (WCAG 2.x relative luminance)
   - `hexToInt('#0f1424')` → `0x0f1424` for Phaser
   - `deriveShades(PALETTE, MIX)` → text-muted, text-dim, the `face-*` / `edge-*` / `glow-*` per variant, and face-disabled
   - `themeCssVars()` → `{ '--ui-…': value }`
3. **R3 Publishing.** `applyTheme(doc)` sets every `themeCssVars()` entry on `documentElement`. That includes the root default `--ui-u: 1px`. `main.js` calls it next to `applyHudLayerSize(document)`, before `new Phaser.Game`. This follows the `--hud-k` precedent: JS is the single source and CSS only reads `var(--ui-*)`.
4. **R4 Bundled fonts, latin subset only.** `src/ui/theme.js` side-effect-imports `@fontsource/orbitron/latin-700.css`, `@fontsource/rajdhani/latin-500.css` and `@fontsource/rajdhani/latin-700.css`. That's 3 woff2 files, about 36 KB in total (6.4 + 14.7 + 15.3 KB, v5.3.0). The CSS is `font-display: swap` with relative `./files/` URLs, which Vite rewrites and emits to `dist/assets/`. A 400 request resolves to the 500 face by CSS font matching, so no 400 face is needed. Bold resolves to 700, so the browser never synthesises bold. Add both packages to `dependencies`.
5. **R5 Deterministic font load.** `loadThemeFonts(doc)` calls `doc.fonts.load()` for each `FONT_FACES` entry and returns a promise. The promise never rejects (errors are swallowed and the fallback stack takes over). It's a no-op without `doc.fonts` (jsdom). `main.js` starts it at boot but does **not** gate boot on it.
6. **R6 Kit CSS** in the existing `index.html` `<style>`: `.ui-panel` and `.ui-btn`, the variants `--primary`, `--danger` and `--currency` (neutral is the default), and the states in the Design table. Rules:
   - The kit **paints only**: `background-color`, `background-image`, `box-shadow`, `color`, `cursor`, `transition`, plus a zero-specificity border reset on buttons. Surfaces keep their own geometry (size, padding, radius, font-size).
   - Surfaces customise the kit by setting `--btn-*` / `--panel-*` vars, never by repainting.
   - Every kit length is `calc(N * var(--ui-u))`.
7. **R7 Global font swap.**
   - `body` → `var(--ui-font-body, sans-serif)`. Add `button, input, select, textarea { font-family: inherit; }` (family only, never the `font` shorthand, which would reset the UA button size).
   - `--hud-label-font` → `"Rajdhani", ` followed by today's condensed stack.
   - Delete all 8 `'Georgia',serif` and the 1 `'Courier New'` declarations.
   - Titles listed in Design → `var(--ui-font-heading)`.
8. **R8 Rollout.** The surfaces listed in Design adopt the kit now. Everything else gets the font swap only.
9. **R9 Phaser consumers** take fonts and colours from the theme. No `fontFamily` string literal remains in `src/` except `MapEditorScene` (`monospace`, a dev tool).
10. **R10 Art bible.** In `docs/art-bible.md`, replace "Georgia is the stopgap" with a Type subsection, a derived-tokens table and a component-states table (see Docs).
11. **R11 No layout regression.** Touch targets stay 44 px. Rail cell geometry is unchanged (the kit's 1u ring = today's `2px * k`). `npm run matrix` and `npm run capture -- --screens` report zero problems on desktop, desktop1440, iphone, pixel and ipad.

## Design

### Where the kit lives (decision)
- **JS tokens → CSS custom properties** (chosen). This mirrors `applyHudLayerSize`. Phaser reads the same values. `railCss.test.js` and `mobile.test.js` already parse the single `index.html` `<style>`, so kit CSS added there is guarded automatically.
- **A separate `theme.css` imported by JS** (rejected). Vite injects it as a `<link>` whose order relative to the inline `<style>` decides cascade ties. It would also escape both CSS guard tests.
- **Only `:root` CSS vars, no JS** (rejected). Phaser and the contrast test would need a second copy of the tokens.
- **Pre-JS paint:** only `body` and `#rotate-prompt` are visible before `main.js` runs. Their `var()`s carry literal fallbacks. Everything else themed is `display:none` until a scene shows it.

### Unit `--ui-u` and the rail guard
- `--ui-u` is 1px at `:root` (overlays and panels are real CSS px).
- `.hud-rail` sets `--ui-u: calc(2px * var(--hud-k))`, so a 1u ring equals today's rail ring at both k values. `.wave-preview` sets `--ui-u: 2px`: it is game px, unscaled, and exempt from the rail guard per #43 R5.
- Kit rules contain no `px` at all, so `railCss.test.js` stays green without exemptions.
- **Constraint:** a value that depends on `--ui-u` (scanline period, bevel offset, glow blur) is written inside the `.ui-*` rule, never pre-composed in a `:root` custom property. A custom property resolves `var()` where it is declared, so a root-composed gradient would carry the 1px unit into the rails.

### Surface recipe (CSS, procedural "9-slice")
**Choice: layered CSS** (gradients plus stacked inset box-shadows), which stretches like a 9-slice with fixed-size edges. Alternatives considered:
- **Canvas-generated PNG + `border-image`.** Blurry under the HUD's fractional transform scale and at each DPR. It would need regenerating per variant/state, can't coexist with `border-radius`, and is untestable in jsdom.
- **SVG data-URI `border-image`.** Crisp, but colours get baked into strings and it still has no radius.

Layers, from back to front:
1. `background-color: var(--btn-face)`.
2. `background-image`: a soft-profile scanline `repeating-linear-gradient` (period 3u, white at `--ui-scanline-alpha` ≤ 0.04, transparent → line → transparent with no hard stops), then a vertical sheen (`linear-gradient`, white 0.05 → 0).
3. `box-shadow`, in order:
   - ring `inset 0 0 0 1u var(--btn-edge)`
   - bevel highlight `inset 2u 2u 0 var(--ui-bevel-hi)` (upper-left key light per bible §1)
   - bevel shade `inset -2u -2u 0 var(--ui-bevel-lo)`
   - the first-listed shadow paints frontmost, so the ring covers the outer 1u of each bevel; the 2u offset leaves a visible 1u bevel band just inside the ring (a 1u offset would sit entirely under the ring)
   - inner glow `inset 0 0 6u var(--btn-glow)`

Panels use the same stack with `--panel-*` vars plus an outer drop shadow (`0 3u 14u rgba(0,0,0,.5)`) held in `--panel-drop`, which `.hud-rail` and `.story-banner` set to `0 0 0 transparent` (flush with the map / parked above it, where the drop would darken the map). The kit never uses `background` shorthand: the rail's transparent border is the touch-target gutter and relies on `background-clip: padding-box`. It never uses `border` for looks either; the ring is a box-shadow.

| State | Selector(s) | Change |
|---|---|---|
| normal | `.ui-btn` | variant face/edge/ink, glow at rest alpha |
| hover | `:hover` (fine pointers via `@media (hover:hover)`) | glow alpha up, face +1 mix step, ring lifted to edge-hover (mix(edge, text, 0.35)): the face step alone is 1/255 on neutral |
| pressed | `:active`, `.is-pressed` | bevel hi/lo swapped, face −1 step, glow off |
| selected | existing `.selected` `.active` | as pressed, plus accent ring and accent glow at hover strength (a resting state that must stand out from identical neighbours) |
| armed (two-step confirm) | `.is-armed`; `#tower-panel button.confirming` rule sets the same vars | currency edge, strong currency glow |
| disabled | `:disabled`, `.is-disabled`, existing `.disabled` `.locked` `.maxed` | face-disabled, ink text-dim, glow none, `cursor:not-allowed` |
| focus | `:focus-visible` | 1u accent outline, offset −2u |

Existing state classes are aliases, so no JS renames are needed. Existing `pointer-events:none` rules on disabled controls are kept verbatim.

Variants:
- neutral: panel-edge ring, text ink
- `--primary`: accent ring and ink
- `--danger`: danger ring, ink chosen to pass the contrast test
- `--currency`: gold ring and ink

`#pause-btn.paused` stays a bespoke bright-gold state that only sets vars.

### Fonts and late loading
- `FONTS.heading` = `"Orbitron", "Bahnschrift", "Segoe UI", system-ui, sans-serif`. Every fallback is narrower than Orbitron, so a failed load can't overflow.
- `FONTS.body` = `"Rajdhani", "Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", sans-serif-condensed, "Bahnschrift SemiCondensed", "Helvetica Neue", Arial, sans-serif`. That's today's condensed HUD stack, so the failure layout is today's.
- Orbitron only for titles ≥ 16 px. Smaller names (tower panel, inspector) use Rajdhani 700.
- **fitLabels gap:** `watchRailLabels` refits on `document.fonts.ready`, but `ready` resolves at once when nothing is pending. The rails are `display:none` at boot, so Rajdhani 700 may start loading only when a level shows them. Labels would then be fitted to the fallback, and the swap would leave them wrong. Fix: also refit on `doc.fonts` `loadingdone` (optional-chained) and when `loadThemeFonts` settles.
- **Phaser text** rasterises with whatever face is loaded at render time and doesn't re-render when a font arrives. Not gating boot is acceptable: canvas text in levels is created after map select, by which point R5 has loaded every face. Pooled damage/gold text re-renders on every `setText`.

### Rollout (this task)
- **Kit surfaces:**
  - `.hud-rail` (both rails become `.ui-panel`; the `#rail-left/right` brass inset edges are removed)
  - every rail `<button>` (`ui-btn` plus a variant in markup):
    - `.tower-btn` neutral
    - `#pause-btn` currency
    - `#speed-btn` neutral (no green in the UI palette)
    - `#open-codex` and `.ability-btn` primary
    - `#cancel-btn`, `#exit-btn` and `#wave-btn` danger
  - `.hud-val` → currency ink, `.hud-lbl` → text-muted
  - `#tower-panel` panel and its buttons:
    - `.upgrade-btn` and `.branch-choose-btn` currency
    - `.sell-btn` danger
    - `.reposition-btn` primary
    - `.maxed` → disabled
    - `GameScene` className strings at ~1594–1664 gain the kit classes
  - `#tower-tooltip`, `#inspect-peek`, `.inspector-panel` (panel). `.ability-card` and `.wave-preview` use panel `--primary`.
  - `#codex-overlay-inner`, `.codex-tab`, `#codex-close`, `.codex-entry` (`CodexOverlay.js:110`)
  - `#settings-overlay-inner`, `#settings-close` danger
  - `.story-dialog-card`, `#story-dialog-next` primary, `#story-dialog-skip`, `.story-banner`, `#story-dismiss`
  - `#story-log-inner`, `.story-log-entry` (`MapSelectScene.js:256`), `#story-log-close`
  - `#game-msg` panel, `#msg-btn` primary, `#msg-cancel-btn`
  - Adopted rules lose their own background/border/colour declarations. Their 9–10 px font sizes rise to `--ui-fs-xs` (11 px), because Rajdhani's thin strokes vanish below that on navy.
- **Font only:** map select and its buttons (3.4), upgrade and hero-management overlays, `.game-toast`, wave banners.
- **Headings** (`--ui-font-heading`): `#map-select-title`, `#game-msg h2`, `#codex-overlay-title`, `#settings-overlay-title`, `#story-log-inner h3`, `#upgrade-overlay-title`, `#hero-mgmt-overlay-title`, `#paused-overlay`, `#wave-banner`, `#wave-banner-boss`, `.wp-title`.
- **Phaser:**
  - `loadingBar.js`: colours via `hexToInt(PALETTE.*)`, font `FONTS.body`
  - `Tower.js:30` icon, `GameScene.js:1922-1923` IN/OUT: `FONTS.body`
  - `DamageNumberOverlay` `STYLES` and `juice.js` `GOLD_POP`: `FONTS.body` (today they use Phaser's default Courier)
- **Untouched:** matchup/armour line colours (`.mu-*`, `.ar-*`, `.tt-line-*`; content semantics that 3.3 redesigns), hero/speaker colours set from data, branch-card internals (3.3), `#hero-section` bars.

### Docs (`docs/art-bible.md` §2 UI)
- Type table: role → family/weight/size token → where used, plus the "Orbitron ≥ 16 px only" rule and the fallback stacks.
- Derived-token table: name → formula (mix of bible tokens) → resolved hex.
- Component table: variants × states.
- Rules: "kit paints, surfaces lay out" and the `--ui-u` constraint.
- The existing UI token table stays the source the sync test reads.

## Edge cases

- **Font load fails or is blocked:** the fallback stacks above apply, rails fall back to today's condensed stack, and `loadThemeFonts` resolves anyway. Verified by blocking `*.woff2` in Playwright. The layout audit must still pass.
- **Late face (FOUT after the rails show):** the `loadingdone` refit covers it. The rail label goes from fallback to Rajdhani without overflow.
- **Vertical fit:** a 3-line `.tower-btn` (icon/cost/name) or `.ability-btn` at `line-height:1.05` with Rajdhani's vertical metrics must not overflow its 88 / 52 cell. fitLabels only fits width, so this gets a browser probe (`scrollHeight ≤ clientHeight`).
- **Orbitron width:** titles in a flex header (`#codex-overlay-title` beside the tabs) on 750×340 must not wrap or push the tabs off. Captures check this.
- **Glyphs outside the latin subset** (▶ ⏸ ✕ ★ ⚙ ⚠, emoji): per-glyph fallback to system fonts, as today. `×` (U+00D7, used in `heroes.js`) is inside the latin subset.
- **Ability on cooldown** is `:disabled`. The disabled look must keep the countdown `.ability-cd` at ≥ text-muted contrast, and the conic wedge (`::after`) still renders above the face.
- **High-DPR / fractional-scale moiré:**
  - desktop rails: 3u ≈ 2.7 CSS px at DPR 1
  - phone: 3u ≈ 2.8 CSS px at DPR 3
  - mitigated by the soft gradient profile and alpha ≤ 0.04, with `EFFECTS.scanlineAlpha` as the one-line kill switch
  - judged on desktop1080 and iphone captures at 100 % zoom
- **Reduced motion:** the kit adds no animation, only the existing 120 ms colour/shadow transitions. Nothing new is needed under `prefers-reduced-motion`.
- **Scrolling panels** (`#tower-panel`, codex list): the inset ring and scanline stay fixed to the box (default `background-attachment`) and don't shimmer while scrolling.
- **Pre-JS paint** (portrait phone, rotate prompt): literal `var()` fallbacks keep it readable.
- **Relative base (6.2 `--base=./`) / offline / itch:** fonts are same-origin, hashed relative URLs, with no CDN. A future CSP needs only `font-src 'self'`.
- **jsdom:** no `document.fonts`. Every font call is optional-chained, and CSS imports resolve to empty modules in Vitest.

## Tests (each guard proven to fail by planting a violation first)

1. `src/ui/theme.test.js`:
   - `mixHex` endpoints and midpoint
   - `contrastRatio('#fff','#000') = 21` and symmetry
   - `hexToInt`
   - `themeCssVars` keys all `--ui-*`
   - `applyTheme` sets them on a jsdom root
   - `loadThemeFonts` resolves without `fonts` and when `load` rejects
2. **Contrast:** each ink on its face is ≥ 4.5:1 after compositing the scanline/sheen alpha over the face. Pairs: text, text-muted, accent, currency and danger on panel; each variant's ink on its normal and hover face. Disabled is exempt (WCAG), but text-dim on face-disabled must be ≥ 3:1.
3. **Bible sync:** parse the §2 UI table in `docs/art-bible.md` and compare it to `PALETTE`. Derive the values, don't hardcode them.
4. `src/ui/themeCss.test.js` (node env, parses the `index.html` `<style>`):
   - no `Georgia` / `Courier New` in `index.html` or non-test `src/**/*.js`
   - every `font-family` is `var(--ui-font-*)`, `var(--hud-label-font)` or `inherit`
   - `--hud-label-font` starts with `"Rajdhani"`
   - every `var(--ui-*)` referenced exists in `themeCssVars()` (catches silent typos)
   - `.ui-*` rules contain no `px` and no hex literal
5. `railCss.test.js`: add that `.hud-rail` declares `--ui-u` as `calc(2px * var(--hud-k))`.
6. **Font sync:** every `FONT_FACES` entry has a matching `@fontsource/<family>/latin-<weight>.css` import in `src/ui/theme.js`, and vice versa.
7. `fitLabels.test.js`: `watchRailLabels` refits on a fake `doc.fonts` `loadingdone` event.
8. **Phaser font guard:** no quoted `fontFamily:` literal in `src/` except `MapEditorScene.js` (named exemption with its reason).

## Acceptance / browser verification

- Full suite green; report the count.
- `npm run build`: `dist/assets` contains the 3 latin woff2 files.
- `vite build --base=./`, served from a sub-path: fonts load with HTTP 200 and no 404s.
- `npm run capture -- --screens` before/after on desktop, desktop1440, iphone, pixel, ipad, plus `npm run matrix`: zero layout problems.
- Frozen-frame probes on phone and desktop:
  - `document.fonts.check('700 24px Rajdhani')`
  - each rail label's computed family starts with Rajdhani
  - text width ≤ available and `scrollHeight ≤ clientHeight` per rail button
  - computed box-shadow and face differ across normal / `.is-pressed` / disabled
- Repeat the probes with woff2 blocked.

## Out of scope

Radial menus (3.3), title/logo/starfield and map-select redesign (3.4), portraits and typewriter (3.5), results/stars (3.6), the upgrade and hero-management overlay redesign, matchup/content colours, `MapEditorScene`, light theme, and a glow pulse animation.

## Open questions

None blocking. Decided by the palette rule: the brass `#8b6914` frames and the green speed/upgrade buttons become panel-edge, neutral and currency. Flag in review if green upgrade affordance is missed.
