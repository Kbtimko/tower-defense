# Theme module (roadmap 3.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared UI kit — tokens, bundled Orbitron/Rajdhani, procedural CSS panels/buttons with states — published from JS as `--ui-*` CSS vars and adopted by the in-level HUD and its overlays; Georgia removed everywhere.

**Architecture:** Token values in `src/data/theme.js`; pure helpers + publishing + font loading in `src/ui/theme.js` (called from `main.js` beside `applyHudLayerSize`). Kit CSS (`.ui-panel`, `.ui-btn` + variants/states) lives in the existing `index.html` `<style>`, paints only, and sizes every length as `calc(N * var(--ui-u))` (`--ui-u` = 1px at root, `calc(2px * var(--hud-k))` in rails, 2px in `.wave-preview`). Surfaces keep their geometry and opt in via classes.

**Tech Stack:** vanilla JS, Vite 5, Vitest + jsdom, `@fontsource/orbitron@5.3.0`, `@fontsource/rajdhani@5.3.0`, Phaser 3.88.

**Spec:** `docs/superpowers/specs/2026-10-23-theme-module-design.md` — binding. Its Rollout section is the exact surface list; its Design table is the state contract.

## Global Constraints

- Palette = art-bible §2 UI tokens exactly (panel `#0f1424`, panel-edge `#2a3a4a`, accent `#4fc3f7`, currency `#ffd700`, danger `#f07a7a`, text `#e8e0d0`) + §2 status colours; no new hues, only `mixHex` derivations. **User decision: strict palette** — brass `#8b6914` frames → panel-edge, speed button neutral, Upgrade/Choose currency gold.
- Fonts: Orbitron 700 (headings ≥ 16 px only), Rajdhani 500 + 700 (body, HUD labels, story, codex), latin subset, imported as `@fontsource/<family>/latin-<weight>.css`. No Georgia / Courier New anywhere.
- Kit paints only (background-color, background-image, box-shadow, color, cursor, transition); never the `background` shorthand; no px or hex literal inside `.ui-*` rules.
- Rail CSS lengths stay `calc(Npx * var(--hud-k))` (guard `src/ui/railCss.test.js`). Touch targets unchanged; phone rail geometry unchanged.
- `loadThemeFonts` never rejects and never gates boot; every `document.fonts` use is optional-chained (jsdom has none).
- Comments explain why. Only the two `@fontsource` packages are new dependencies.

## Review Focus

1. A webfont arriving after the rails show leaves labels fitted to the fallback → Task 2's `loadingdone` refit test.
2. A `--ui-u`-derived value pre-composed on `:root` leaks 1px into the rails → Task 3 guard: `.ui-*`/root rules contain no `--ui-u`-composed custom property; Task 3 railCss extension.
3. Contrast silently failing after the scanline/sheen overlay → Task 1 composited contrast test (≥ 4.5:1; disabled ≥ 3:1).
4. A mistyped `var(--ui-…)` rendering as nothing → Task 3 guard: every referenced `--ui-*` exists in `themeCssVars()`.
5. Three-line rail buttons overflowing vertically with Rajdhani metrics → controller browser probe (`scrollHeight ≤ clientHeight`) after Task 4.

---

### Task 1: Tokens, helpers, publishing, fonts

**Files:**
- Create: `src/data/theme.js`, `src/ui/theme.js`, `src/ui/theme.test.js`
- Modify: `src/main.js` (call `applyTheme(document)` next to `applyHudLayerSize(document)`; start `loadThemeFonts(document)` without awaiting), `package.json` / `package-lock.json` (`npm install @fontsource/orbitron@5.3.0 @fontsource/rajdhani@5.3.0`)

**Interfaces:**
- Produces (`src/data/theme.js`): frozen `PALETTE` (keys `panel, panelEdge, accent, currency, danger, text, slow, burn, stun, armour, heal, gold`), `MIX`, `FONTS = { heading, body }` (exact stacks from spec "Fonts and late loading"), `FONT_FACES = [{family:'Orbitron',weight:700},{family:'Rajdhani',weight:500},{family:'Rajdhani',weight:700}]`, `TYPE_SCALE` (incl. `xs: 11`), `SPACING`, `EFFECTS` (`scanlineAlpha ≤ 0.04`, sheen, bevel, glow alphas).
- Produces (`src/ui/theme.js`): `mixHex(a,b,t) -> '#rrggbb'`, `contrastRatio(fg,bg) -> number`, `hexToInt(hex) -> number`, `deriveShades(PALETTE, MIX) -> object`, `themeCssVars() -> { '--ui-…': string }` (includes `--ui-u: '1px'`, `--ui-font-heading`, `--ui-font-body`, `--ui-fs-xs`, per-variant `--ui-face-*`/`--ui-edge-*`/`--ui-glow-*`/`--ui-ink-*`, `--ui-face-disabled`, `--ui-text-muted`, `--ui-text-dim`, `--ui-bevel-hi`, `--ui-bevel-lo`, `--ui-scanline-alpha`), `applyTheme(doc)`, `loadThemeFonts(doc) -> Promise<void>`.

- [ ] **Step 1: Failing tests** in `src/ui/theme.test.js`: `mixHex('#000000','#ffffff',0)==='#000000'`, `…,1)==='#ffffff'`, midpoint `'#808080'` (state the rounding); `contrastRatio('#ffffff','#000000')===21` (±0.01) and symmetric; `hexToInt('#0f1424')===0x0f1424`; every `themeCssVars()` key starts `--ui-`; `applyTheme(document)` sets each on `documentElement.style`; `loadThemeFonts({})` resolves; with `fonts.load` rejecting it still resolves. **Contrast:** for each ink/face pair listed in the spec Tests §2, composite the scanline + sheen alphas over the face (white at `EFFECTS` alphas) and assert `≥ 4.5`; disabled text-dim on face-disabled `≥ 3`. **Bible sync:** parse the §2 UI table in `docs/art-bible.md` and assert each token equals `PALETTE` (no hardcoded hexes in the test). **Font sync:** read `src/ui/theme.js` source; the set of `@fontsource/<family>/latin-<weight>.css` imports equals `FONT_FACES` (lowercased family).
- [ ] **Step 2: Run** `npx vitest run src/ui/theme.test.js` — FAIL (modules missing).
- [ ] **Step 3: Implement** both modules (CSS imports are side-effect imports at the top of `src/ui/theme.js`; Vitest resolves them as empty), wire `main.js`, install the packages. If a contrast pair fails, adjust the `MIX` ratios (derived shades), never the bible tokens.
- [ ] **Step 4: Run** the file, `npm run test` (baseline: report it), `npm run build` — and confirm `dist/assets` contains exactly 3 `*.woff2`.
- [ ] **Step 5: Commit** `feat(theme): tokens, helpers, publishing and bundled fonts (3.1)`.

### Task 2: fitLabels refits when a late face arrives

**Files:** Modify `src/ui/fitLabels.js` (`watchRailLabels`), `src/main.js` (refit when `loadThemeFonts` settles — use whatever refit hook `watchRailLabels` exposes or add one); Test: `src/ui/fitLabels.test.js`.

**Interfaces:** Consumes `loadThemeFonts(doc)` from Task 1.

- [ ] **Step 1: Failing test:** with a fake `doc.fonts` (EventTarget + `ready` resolved), dispatching `loadingdone` schedules a full rail refit (assert `fitLabels` ran over all rail labels, via the module's existing seams; stub `requestAnimationFrame`). Absent `doc.fonts` → no throw.
- [ ] **Step 2: Run** `npx vitest run src/ui/fitLabels.test.js` — FAIL.
- [ ] **Step 3: Implement** `doc.fonts?.addEventListener?.('loadingdone', …)` → full refit; refit once more after `loadThemeFonts` settles. Comment why (`ready` resolves immediately while rails are hidden).
- [ ] **Step 4: Run** the file + `npm run test`. **Commit** `fix(hud): refit rail labels when a late webfont lands (3.1)`.

### Task 3: Kit CSS, global font swap, guards, art bible

**Files:** Modify `index.html` (`<style>` only in this task), `src/ui/railCss.test.js`, `docs/art-bible.md`; Create `src/ui/themeCss.test.js` (`// @vitest-environment node`).

**Interfaces:** Consumes `themeCssVars()` keys (Task 1).

- [ ] **Step 1: Failing guards** in `themeCss.test.js` (parse the single `<style>` like `railCss.test.js`): no `Georgia`/`Courier New` in `index.html` or non-test `src/**/*.js`; every `font-family` value is `var(--ui-font-heading…)`, `var(--ui-font-body…)`, `var(--hud-label-font)` or `inherit`; `--hud-label-font` begins `"Rajdhani"`; every `var(--ui-…)` referenced exists in `themeCssVars()`; rules whose selector contains `.ui-` have no `\d+px` and no `#[0-9a-f]{3,6}`; no `:root`/`html` custom property composes `var(--ui-u)`. Extend `railCss.test.js`: `.hud-rail` declares `--ui-u: calc(2px * var(--hud-k))`. Run — FAIL.
- [ ] **Step 2: Implement** the kit rules exactly per spec "Surface recipe" + state table (variants `--primary/--danger/--currency`, aliases `.selected .active .disabled .locked .maxed .confirming`, `.is-pressed`, `.is-armed`, `.is-disabled`, `:focus-visible`, hover under `@media (hover:hover)`), `--ui-u` scoping (`.hud-rail`, `.wave-preview`), the global font swap (body, `button, input, select, textarea { font-family: inherit; }`, `--hud-label-font`, heading selectors from spec Rollout), delete every Georgia/Courier declaration. No markup or JS changes in this task.
- [ ] **Step 3: Prove each guard bites** (plant one violation per guard, see it fail, remove). Run both test files + `npm run test` + `npm run build`.
- [ ] **Step 4: Art bible** §2 UI: Type table, derived-token table (resolved hexes from `deriveShades`), component variants × states table, the two rules ("kit paints, surfaces lay out"; `--ui-u` constraint); replace "Georgia is the stopgap". Bible-sync test must stay green.
- [ ] **Step 5: Commit** `feat(theme): ui kit css, font swap and guards (3.1)`.

### Task 4: Roll the kit out to the HUD and overlays

**Files:** Modify `index.html` (markup classes + remove the adopted rules' own background/border/colour declarations; raise 9–10 px text on adopted surfaces to `var(--ui-fs-xs)`), `src/scenes/GameScene.js` (panel button className strings ~1594–1664), `src/ui/CodexOverlay.js` (~110), `src/scenes/MapSelectScene.js` (~256).

**Interfaces:** Consumes the kit classes from Task 3.

- [ ] **Step 1:** Apply exactly the spec's Rollout "Kit surfaces" list with the stated variants (rails `.ui-panel`, brass inset edges removed; tower buttons neutral; pause currency; speed neutral; codex/ability primary; cancel/exit/wave danger; `.hud-val` currency ink, `.hud-lbl` muted; tower panel buttons upgrade/choose currency, sell danger, reposition primary, maxed → disabled; tooltip/peek/inspector panels; ability card + wave preview panel primary; codex, settings, story dialog/banner/log, game-msg). Font-only surfaces get nothing beyond Task 3. Rail declarations you add must be `calc(Npx * var(--hud-k))`.
- [ ] **Step 2:** Run `npm run test` (railCss, themeCss, mobile, fitLabels, touchInput suites must stay green; fix markup/CSS, never loosen a guard) and `npm run build`.
- [ ] **Step 3:** Run `npm run matrix` and `npm run capture -- --screens --devices desktop,desktop1440,iphone,pixel,ipad --no-build` (rebuild first if needed): zero failures / LAYOUT problems. Report outputs.
- [ ] **Step 4: Commit** `feat(theme): hud and overlays adopt the ui kit (3.1)`.

### Task 5: Phaser text and colours from the theme

**Files:** Modify `src/ui/loadingBar.js`, `src/entities/Tower.js` (~30), `src/scenes/GameScene.js` (IN/OUT labels ~1922), the damage-number overlay `STYLES` and `src/data/juice.js` `GOLD_POP`; Create/extend a guard test (e.g. `src/ui/themeCss.test.js` or `src/ui/phaserFonts.test.js`).

- [ ] **Step 1: Failing guard:** no quoted `fontFamily:` string literal in non-test `src/**/*.js` except `src/scenes/MapEditorScene.js` (named exemption: dev tool, monospace). Run — FAIL.
- [ ] **Step 2: Implement:** those consumers take `FONTS.body` and, where they hardcode palette colours, `hexToInt(PALETTE.*)`. Keep existing tests green (update only assertions that pinned the old font string, deriving from `FONTS`).
- [ ] **Step 3: Run** `npm run test` + `npm run build`. **Commit** `feat(theme): phaser text uses theme fonts (3.1)`.

### After Task 5 (controller)

Browser verification per spec "Acceptance": production + `--base=./` sub-path build (fonts 200), before/after captures, frozen-frame probes (Rajdhani loaded, label width/height fit, button state shadows differ), the same with `*.woff2` blocked; `npm run matrix`. Commit curated captures to `docs/captures/3.1-theme-module/`, tick roadmap 3.1, notes, PR into `visual/integration`.
