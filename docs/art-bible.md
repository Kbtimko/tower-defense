# Last Light — Art Bible

**Status:** APPROVED at gate **G1** (Keith, 2026-10-21). Seeded from Appendix A of
`docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md`, then checked
against what the game ships today (measurements dated 2026-10-21, see §9).
The G1 decisions are recorded inline as **[G1 ✓]**.

Every visual task in the roadmap (1.2 grounding, 1.3 normalization, 1.4
grading, 1.5–1.6 FX, 3.x UI, 4.x art) is judged against this page. Where a
number here becomes code, it lives in `src/data/` (or a script constant for
offline tools), never hardcoded in entity logic.

---

## 1. Camera & light

| Rule | Value |
|---|---|
| Camera | High-angle top-down, ~60° pitch ("top-down 3/4"). Units show their top and a sliver of their front face. |
| Facing | Art is authored facing **right** (`baseFacing: 'right'`); the game mirrors for left. Never author a left-facing reference. |
| Key light | Upper-left. Lit faces point up-left; rim light on the upper-left edge. |
| Shadows | Fall lower-right. Contact shadow is a **soft ellipse, 50 % black at its core** **[G1 ✓]**, width = the silhouette width, height = 0.35× that, **centred on the contact point** and offset +3 px x / +1 px y (1× design px). A 35 % ellipse ending at the feet was hidden by the unit's own body in captures. Source of truth: `src/data/grounding.js`. |
| Flyers | Detached shadow: 0.65× the ground opacity (0.5× vanished on sand), offset by the hover height (12 px down), no contact with the sprite. |
| Baked shadows | **Forbidden** in sprite art. The game draws every shadow so they all agree; a generator's ground shadow gets cut out (rembg `isnet-general-use`). |

## 2. Palettes

### Factions
| Faction | Base | Accent | Notes |
|---|---|---|---|
| **Human** (towers, heroes, soldiers, sentries) | Cool steel `#5b6b7a` → `#a9b6c2`, teal hull `#2f6f78` | Amber lights `#ffb000` | Saturation stays low (0.20–0.35): humans read as engineered metal. Per-tower identity comes from the accent emissive, not the hull. |
| **Veth** (enemies) | Dark chitin `#1c1a22` → `#3a3442` | Per-type emissive (below) | Saturation runs high on the emissive only (0.35–0.70 mean). Veth glow; humans reflect. |

**Veth emissives** — the source of truth is `color` in `src/data/enemies.js`; this table must match it.

| Enemy | Emissive | Role |
|---|---|---|
| drone | `#33ff66` | baseline swarm |
| skitter | `#ff6600` | fast |
| brute | `#9a7b4f` | armoured — dull bronze **[G1 ✓]**, replacing `#667766`, which read as "no glow" next to the others. |
| colossus | `#880044` | heavy |
| phantom | `#9b59b6` | flyer |
| titan | `#e74c3c` | boss |

### Tower accent emissives
One hue per tower, used for muzzle flashes, projectile cores and tier glow (1.5).
Archer `#ffb000` (amber), Mage `#dd00ff` (violet), Cannon `#ff7a2f` (ember),
Ice `#00eeff` (cyan), Sniper `#ff3355` (red tracer), Barracks `#ffd34d` (gold).
Compared with today's `PROJ_COLORS` in `GameScene`, mage and ice keep their
hues. Archer moves from tan `#cd853f` to amber, and cannon moves from grey
`#888888` to ember so its shells read against the ground.

### Status-effect colour language
Shared by FX, damage numbers and UI icons, and never reused for anything else:
**slow** = cyan `#7fe9ff` with frost crystals, **burn** = orange `#ff8a1f`,
**stun** = yellow `#ffe14d` with stars, **armour absorbed** = steel `#9fb3c8`,
**heal/regen** = green `#5dff9a`, **gold** = `#ffd700`.

### UI
| Token | Value | Use |
|---|---|---|
| panel | `#0f1424` | deep navy panel fill |
| panel-edge | `#2a3a4a` | 1 px bevel/border (already common in `index.html`) |
| accent | `#4fc3f7` | cyan-teal: focus, selection, links (already the HUD accent) |
| currency | `#ffd700` | gold only (already the HUD gold) |
| danger | `#f07a7a` | lives lost, sell, defeat |
| text | `#e8e0d0` | body text (current `body` colour) |

The six tokens above are the source of truth: `PALETTE` in `src/data/theme.js`
must equal them (a test parses this table). Everything below is derived from
them by mixing, so the UI never grows a hue this table doesn't name.

#### Type
Bundled OFL faces via `@fontsource`, latin subset only (3 woff2, ~36 KB).
`TYPE_SCALE` in `src/data/theme.js` gives the sizes (`--ui-fs-xs` 11 px … `--ui-fs-title` 32 px).

| Role | Family / weight | Size | Where |
|---|---|---|---|
| Heading | Orbitron 700 (`--ui-font-heading`) | ≥ 16 px only | map-select title, game-message title, codex/settings/story-log/upgrade/hero-management titles, paused overlay, wave banners, wave-preview title |
| Body | Rajdhani 500 (`--ui-font-body`) | `--ui-fs-xs` (11 px) minimum | body text, story narration, codex lore, overlays |
| Emphasis / small names | Rajdhani 700 | < 16 px | tower panel and inspector names (Orbitron is too wide this small) |
| HUD rail labels | Rajdhani (`--hud-label-font`) | `calc(24px * var(--hud-k))` | every rail button and stat |

- **Orbitron ≥ 16 px only.** It is a wide display face; smaller titles use Rajdhani 700.
- **Nothing below 11 px.** Rajdhani's thin strokes vanish on navy below that size.
- Fallback stacks, so a blocked or missing font can't overflow:
  - heading: `"Orbitron", "Bahnschrift", "Segoe UI", system-ui, sans-serif` (every fallback is narrower than Orbitron)
  - body: `"Rajdhani", "Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", sans-serif-condensed, "Bahnschrift SemiCondensed", "Helvetica Neue", Arial, sans-serif` (the pre-3.1 condensed HUD stack, so the failure layout is the old layout)
- No serif and no monospace anywhere in the game UI (the map editor, a dev tool, keeps monospace).

#### Derived tokens
`deriveShades(PALETTE, MIX)` in `src/ui/theme.js`; `mix(a, b, t)` moves `t` of the
way from `a` to `b`. Ratios live in `MIX` (`src/data/theme.js`). Published as
`--ui-<kebab-name>` (e.g. `faceHover_primary` → `--ui-face-hover-primary`). If a
ratio changes, regenerate the hexes here from `deriveShades`.

| Token | Formula | Resolved |
|---|---|---|
| text-muted | mix(text, panel, 0.3) | `#a7a39c` |
| text-dim | mix(text, panel, 0.55) | `#717071` |
| face-disabled | mix(panel, panel-edge, 0.12) | `#121929` |
| bevel-hi | mix(panel-edge, text, 0.4) | `#767c80` |
| bevel-lo | mix(panel, black, 0.55) | `#070910` |
| face-neutral | mix(panel, panel-edge, 0.3) | `#171f2f` |
| face-primary / -danger / -currency | mix(panel, hue, 0.06) | `#131f31` / `#1d1a29` / `#1d2022` |
| face-hover-* | mix(face, hue, 0.04) | neutral `#182030`, primary `#152639`, danger `#251e2c`, currency `#262721` |
| face-pressed-* | mix(face, panel, 0.5) | neutral `#131a2a`, primary `#111a2b`, danger `#161727`, currency `#161a23` |
| glow-* | mix(face, hue, 0.45) | neutral `#202b3b`, primary `#2e698a`, danger `#7c454d`, currency `#837213` |
| edge-* | the variant hue | neutral = panel-edge, primary = accent, danger = danger, currency = currency |
| ink-* | the variant ink | neutral = text, primary = accent, danger = danger, currency = currency |

Hue per variant: neutral = panel-edge, primary = accent, danger = danger,
currency = currency. Effect strengths (`EFFECTS`): scanline alpha 0.03 (≤ 0.04;
0 is the moiré kill switch), sheen 0.05, glow 50 % at rest / 80 % hover / 90 %
armed. A test holds every ink at ≥ 4.5:1 on its normal and hover face after the
scanline and sheen are composited, and text-dim at ≥ 3:1 on face-disabled.

#### Components
`.ui-panel` (optionally `.ui-panel--primary`) and `.ui-btn` with a variant
class (`.ui-btn--primary`, `--danger`, `--currency`; neutral is the default).
Surface recipe, back to front: face colour → soft scanline (period 3u) → vertical
sheen → inset 1u edge ring → 1u upper-left bevel highlight / lower-right shade
(the §1 key light) → 6u inner glow. Panels add an outer drop shadow.

| State | Selectors | Neutral | Primary | Danger | Currency |
|---|---|---|---|---|---|
| normal | `.ui-btn` | panel-edge ring, text ink | accent ring and ink | danger ring and ink | gold ring and ink |
| hover (fine pointers) | `:hover` under `@media (hover: hover)` | face-hover, glow 80 % | same | same | same |
| pressed / selected | `:active`, `.is-pressed`, `.selected`, `.active` | face-pressed, bevel swapped, glow off | same | same | same |
| armed (two-step confirm) | `.is-armed`, `.confirming` | gold ring, gold glow 90 % | same | same | same |
| disabled | `:disabled`, `.is-disabled`, `.disabled`, `.locked`, `.maxed` | face-disabled, text-dim ink, panel-edge ring, no glow, `not-allowed` | same | same | same |
| focus | `:focus-visible` | 1u accent outline, offset −2u | same | same | same |

States stack in that order: disabled beats armed beats pressed beats hover.

#### Kit rules
- **The kit paints, surfaces lay out.** Kit rules set only `background-color`,
  `background-image`, `box-shadow`, `color`, `cursor`, `transition` and the focus
  outline, plus a zero-specificity border reset on buttons. Size, padding, radius
  and font-size belong to the surface. Surfaces restyle by setting `--btn-*` /
  `--panel-*` vars, never by repainting. The kit never uses the `background`
  shorthand (it would reset `background-clip`, which the rail's transparent touch
  gutter relies on) and never draws its ring with `border`.
- **Every kit length is `calc(N * var(--ui-u))`.** `--ui-u` is 1 px at `:root`,
  `calc(2px * var(--hud-k))` on `.hud-rail` (so a 1u ring equals the old rail
  ring) and 2 px in `.wave-preview`. Anything built on `--ui-u` (scanline period,
  bevel offset, glow blur) is written inside the `.ui-*` rule, never composed in a
  `:root` custom property: a custom property resolves `var()` where it is
  declared, so a root-composed value would carry the 1 px unit into the rails.
  `src/ui/themeCss.test.js` enforces both rules.

### Biome moods (feeds 1.4 grading and 1.9 ambient FX)
| Map | Name | Ambient family | Grade direction |
|---|---|---|---|
| 0 | Outpost Sigma | dust | warm, low contrast, clean — the tutorial should feel safe |
| 1 | Lunar Gate | dust | cool grey, high-key |
| 2 | The Crater | dust | cool grey, deeper shadows |
| 3 | Orbital Station | electrical | teal/steel, crisp |
| 4 | Asteroid Belt | stars | neutral, dark vignette |
| 5 | Titan's Reach | dust | amber haze |
| 6 | Deep Space Corridor | electrical | blue-violet, cold |
| 7 | The Void Frontier | stars | near-black, strong vignette |
| 8 | Enemy Homeworld | bio-pulse | magenta-green, organic, sickly |
| 9 | Last Light | embers | red-black, hot highlights — the finale |

## 3. Outline

- **1.5 px dark navy `#0b1020` at 1×** (3 px on 2× source art), outside the
  silhouette, fully opaque. It separates a unit from any background, so it's
  what keeps a dark sprite readable on map 9 lava or map 7 void.
- The outline is applied by `scripts/art/normalize.py` (1.3), not drawn by the
  generator. Prompts ask for "no outline".
- **[G1 ✓] Plain navy for every unit**, enemies included. Faction is carried
  by the emissive colours, not the outline.

## 4. On-screen size

**Footprint** = the longest side of the opaque silhouette at 1× design
resolution (1280×720), **not** the frame cell. A 96 px cell that holds a 36 px
wide tower is a 36 px-wide tower.

Note: the HTML HUD bars take ~136 px of the window today, so FIT scaling draws
the 1280×720 canvas at about **0.81×** in a 1280×720 browser window and much
smaller on phones (see §9). Sizes below are design px; the touch rule in §6 is
checked after scaling.

| Entity | Target (Appendix A) | Today (measured W×H) | Gap |
|---|---|---|---|
| drone | 44 | 31×29 | −30 % |
| skitter | 38 | 23×28 | −26 % |
| brute | 54 | 30×48 | −11 % |
| colossus | 72 | 39×44 | **−39 %, and shorter than the brute** — breaks the size hierarchy |
| phantom | 46 | 29×21 | −37 % |
| titan | 104 | 53×112 | +8 % (fine) |
| towers | ~80 | archer 36×81; others 31–33 × 43–67 | archer is tall; the other five are ~45 px |
| heroes | ~56 | 23–30 × 40–41 | −27 % |
| soldiers | ~36 | 9×14 | **−61 %, barely visible** |
| sentries | ~36 | 13×23 | −36 % |

Hierarchy rule (must hold whatever the final numbers are):
skitter < drone ≈ phantom < brute < colossus < titan, and soldier < hero < tower.

**[G1 ✓] The Appendix A targets are adopted.** Most units scale up 25–60 %,
which needs the 2× re-bake (4.1) to stay crisp. The colossus inversion and the
soldier size are fixed first because they hurt readability most. Watch for
crowding on the narrow paths of maps 7–9 in captures.

## 5. Tone targets (for normalization, 1.3)

Measured over each sprite's opaque pixels (luminance 0–1; "contrast" = std-dev
of luminance; saturation = HSV mean). Today's outliers are in bold.

| Metric | Target | Today's outliers |
|---|---|---|
| Mean luminance | 0.22–0.40 | **titan 0.11, colossus 0.12, scout 0.15, archer 0.17**; ice 0.48 is high |
| Contrast | ≥ 0.12 | **archer 0.07, colossus 0.07, titan 0.08, scout 0.08** |
| Saturation, human | 0.20–0.35 | **cannon 0.13** (the "washed-out cannon"); heroes run hot at 0.52–0.60, which is OK because they're named characters |
| Saturation, Veth | 0.35–0.70 | **brute 0.17** (its art predates the bronze emissive in §2) |

## 6. Touch & legibility

- Minimum touch target: **44 px after FIT scaling on a 390 px-high
  viewport** (iPhone 14 landscape), for anything tappable: pads, towers, HUD
  buttons, ability buttons.
- Legibility means **contrast against the pad and the map**, not size alone.
  Always judge sprites on a dark background and on map 9 (dark) and map 5
  (bright).
- Health bars, damage numbers and status icons must stay readable at 0.5×
  canvas scale.

## 7. Generation style (Draw Things, FLUX.1 [schnell])

Settings: 1024×1024, 4 steps, CFG 0, Euler a.

FLUX at CFG 0 **ignores negative prompts** and does **not** understand A1111
weighting such as `(…:1.2)`; it reads it as literal text. The current anchor in
`public/assets/sprites/PROMPTS.md` uses both. Proposed replacement, to adopt in
4.0 (put exclusions in the positive prompt):

```
high-angle top-down game sprite of {subject}, sci-fi tower defense, painterly
vector shading, bold readable silhouette, lit from the upper left with a rim
light, single subject centered, plain flat mid-grey background, no ground
shadow, no outline, no text, no lettering
```

Review checklist per candidate: one subject; faces right; no stray lettering;
no baked shadow; silhouette reads at 32 px; palette matches §2.

## 8. Motion (summary; details in 1.5–1.9)

Animation is transforms + FX (`scripts/build-sprite-sheets.py`): bob, rock,
squash, flash. There's no limb articulation. Heavy hits get a squash and a
brief hit-stop. Deaths scale with size class (pop → burst + debris → boss
sequence). Ambient motion stays under the gameplay layers and below 20 %
opacity so it never reads as an enemy.

## 9. Measurement notes

- Sizes and tones were measured from frame 0 of each sheet listed in
  `src/data/sprites.js` (alpha > 32), times the manifest `scale`.
- Captures: `npm run capture -- --devices desktop,iphone,pixel,ipad`
  (roadmap 0.1). Playwright's iPhone 14 landscape viewport is 750×340 CSS px
  (browser chrome included). There the canvas renders about 360 CSS px wide
  between the HUD bars, roughly **0.28× design scale**, so a 45 px tower is
  about 13 CSS px on screen and a 44 px touch target would need ~157 design
  px. That's the main input to 2.2 (HUD to canvas) and to the size decision in
  §4.
