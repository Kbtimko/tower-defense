# Roadmap 4.1b: 2x sprite sheets for the 2x canvas

Status: design · 2026-11-21 · branch `visual/4.1b-2x-sprite-rebake` (stacked on 4.1a, PR #133)

## Intent

Roadmap 4.1: "re-bake at 2x cell size … so on-screen size is unchanged but crisp on
retina/phones." 4.1a (PR #133) made the canvas render at k = 2 on high-DPI screens.
Today's sheets (64px cells; 48 for soldier/sentry; 96 for mage/archer/colossus; 128 for
titan) now supply fewer texels than a k = 2 screen draws, e.g. a skitter is 33 world
px → 67 device px from a 64px cell whose silhouette is ~52px. 4.1b supplies sheets with
twice the texels so sprites are as sharp as the 2x canvas allows.

The user said "move forward" (2026-11-21): Claude settles the design.

## Findings that shape the design (measured 2026-11-21)

1. **Reproducible source.** The 42 references (1024px) in
   `.claude/worktrees/tower-art-42/.art-cache/sprites` rebuild **all 81 shipped source
   sheets byte-identical** with `build-sprite-sheets.py --all` (cutout via `rembg`, which
   only `/usr/bin/python3` has on this Mac; the anaconda `python3` lacks it). The drone is
   `NOT_REPRODUCIBLE` and skipped. So a 2x build is a faithful higher-resolution version
   of the shipped art, not new art. The primary checkout's `.art-cache` is stale (pre-4.2
   towers): never use it.
2. **2x sheets look worse at k = 1.** Phaser 3.90 runs WebGL1 (`getContext('webgl')`) and
   mipmaps only power-of-two textures; our sheets are not POT. Sampling a 128px cell down
   to ~33px (3.4x) with plain bilinear skips texels: a simulated skitter at k = 1 is visibly
   speckled with broken legs, while at k = 2 the 128px cell is clearly sharper than 64.
   (Simulation: GPU-style bilinear point sampling of the real sheets.)
3. Sprite bytes today: 83 PNGs, 1.6 MB. A 2x sheet is ~3.5x the bytes (skitter move
   40 KB → 141 KB), so a 2x set is ≈ 5.6 MB.

## Goals

1. At k = 2, every entity with reproducible art draws from a sheet with twice the cell
   size, at half the manifest scale: same on-screen size, position, anchor, ground line
   and animation timing; visibly sharper.
2. At k = 1, nothing changes: same files, same bytes, same textures.
3. A device downloads one set: k = 1 loads the 1x sheets only, k = 2 loads the 2x sheets
   (falling back per entity to 1x where no 2x exists).
4. Future art changes (`npm run art:apply`) keep the two sets in step.

## Non-goals

- New art, regenerated references, Draw Things use.
- Fixing the drone (`NOT_REPRODUCIBLE`): it keeps its 1x sheets at k = 2.
- Portraits, backdrops, overworld art, FX textures, particles (separate pipelines).
- Mipmaps / POT padding (approach C, rejected).
- Changing tier-look scaling, ground metrics, footprints or any balance number.

## Anti-goals

- Any entity changes on-screen size or position at k = 2 (pad-fit, contact shadows,
  overlays laid out from `getDisplaySize()` must be identical).
- An entity drops to its Graphics fallback at k = 2 because a 2x file is missing or
  404s.
- The 1x and 2x sets drift (an art pick updates one and not the other).
- k = 1 devices download any 2x bytes.

## Approaches considered

- **A. Replace the sheets with 2x for everyone.** Simplest, but finding 2: k = 1 gets
  grainier. Rejected.
- **B. Two sets, picked by k at boot (chosen).** Keeps k = 1 byte-identical; the cost is
  ~5.6 MB more in the repo/build and a resolver every consumer goes through.
- **C. POT-padded sheets + Phaser `mipmapFilter`.** One set, but it changes filtering for
  every texture in the game and wastes padding memory. Rejected.

## Design (Claude's calls)

### Files and naming
- 2x source sheets: `assets-src/sprites/<dir>/<name>@2x.png`; shipped (normalized):
  `public/assets/sprites/<dir>/<name>@2x.png`. Same frame count and order as 1x.
- Cell size is exactly twice the entry's 1x `frameWidth`/`frameHeight` (so 128, 96, 192,
  256 per the current table).

### Which sheets have 2x art
- A generated data module `src/data/sprite2x.js` exports the set of 1x sheet paths that
  have a 2x sibling (e.g. `'assets/sprites/towers/archer_idle.png'`). It is written by
  the 2x build step, never by hand, mirroring the generated `spriteVariants.js`.
- Resolution is per entity-variant, all-or-nothing: an entry (or one tier variant) uses
  2x only if **every** state sheet it declares is in the set; otherwise all its states
  stay 1x. That keeps one scale per sprite (EntitySprite applies one `scale`).

### One resolver
- Pure `spriteSheetFor(entryOrVariant, k)` (in `src/systems/spriteKeys.js` or a sibling
  module) returns `{ scale, states: { [state]: { path, frameWidth, frameHeight, frames,
  frameRate } } }`: at k = 2 with full 2x coverage → `@2x` paths, doubled frame sizes,
  `scale / 2`; otherwise the 1x values unchanged. `anchor` and `ground` are not touched
  (fractions and display px).
- Every consumer goes through it with the boot k (`getRenderScale()`):
  - `BootScene` sheet loading (base states and tier variants);
  - `EntitySprite` config (`scale` for base and variant);
  - `soldierTierTextures` (it already sizes from the loaded source image, but takes
    `frameWidth`/`frameHeight` from the manifest def, so it must use the resolved def).
- Grep for any other reader of `SPRITE_MANIFEST` / `frameWidth` / `.scale` of a manifest
  entry and route it through the resolver too.

### Building the 2x set
- `scripts/build-sprite-sheets.py` gains `--scale 2`: doubles the cell for every entity
  (on top of `CELL_OVERRIDES`) and writes `<name>@2x.png`. `--all` keeps skipping
  `NOT_REPRODUCIBLE`.
- `scripts/art/normalize.py` gains the same `--scale 2` pass: reads `@2x` sources, uses
  cell × 2 and manifest scale / 2, so the outline stays `OUTLINE_DISPLAY_PX` (1.5) display
  px and rim light keeps its display width; writes `@2x` outputs. It also re-measures
  `ground` from the 2x sheets and reports any entity whose 2x ground differs from the
  manifest by more than 0.5 display px and fails if so (see builder-check 6; the manifest keeps the 1x values).
- A small step (in the 2x normalize pass or its own script) writes `src/data/sprite2x.js`
  from the 2x files present.
- `npm run art:apply` runs the 2x build + normalize for the picked assets after the 1x
  steps, so both sets always move together (anti-goal: drift).
- `npm run assets` checks every `@2x` sheet is exactly 2x its 1x sibling's dimensions and
  that every path in `sprite2x.js` exists.

### References
- Copy the 42 references from `.claude/worktrees/tower-art-42/.art-cache/sprites` into
  this worktree's `.art-cache/sprites` (gitignored). Run Python steps with
  `/usr/bin/python3` (has `rembg`). Before building 2x, rebuild 1x and confirm the
  byte-identical result (finding 1) in this worktree.

## Builder-check resolutions (Claude's calls)

1. **No runtime 404 fallback.** Static coverage is the guard: `npm run assets -- --strict`
   fails on a missing or missized `@2x` file or a `sprite2x.js` path that doesn't exist,
   and the live check asserts zero 404s at k = 2. The resolver stays pure and boot-time.
2. **Coverage is per entity, all-or-nothing, over base + every tier variant.** An entity
   resolves 2x at k = 2 only if every state sheet of its base AND of all its declared
   variants is in `sprite2x.js`; otherwise the base and all its variants stay 1x. This
   makes mixed resolutions impossible when a variant borrows a base state
   (`EntitySprite._resolve` falls back per state), and keeps one scale per sprite. Soldier
   tier textures are generated from the base sheets, so they follow the base.
3. **Pinned 1x-at-k = 2 list.** A test asserts the set of entities that stay 1x at k = 2 is
   exactly `{ enemy:drone }` (the `NOT_REPRODUCIBLE` one), so any other entity silently
   falling back fails the suite. The manifest's sheets are the 81 reproducible ones plus the
   drone's 2.
4. **Byte-identical gate is a stop.** If the 1x rebuild in this worktree is not
   byte-identical to the committed `assets-src/sprites`, stop and report BLOCKED; do not
   build 2x from a different pipeline.
5. **Commit both 2x sets** (`assets-src/sprites/**/*@2x.png` and
   `public/assets/sprites/**/*@2x.png`, ~11 MB in total), mirroring how 1x is stored:
   normalize reads the committed originals, and the references are not committed.
6. **Ground is checked, not just reported.** The 2x normalize pass fails if any entity's
   2x-measured `ground` (footY or width, display px) differs from the manifest by more than
   0.5; the manifest keeps its 1x values.

## Verification (definition of done)

- Unit tests (failing first):
  - resolver: k = 1 → unchanged def; k = 2 with full coverage → `@2x` paths, doubled
    frames, halved scale; k = 2 with one state missing → all 1x; variant entries resolve
    independently of their base; drone stays 1x at k = 2.
  - every manifest entry/variant: resolved display size (frameWidth × scale) identical
    at k = 1 and k = 2 (derived from `SPRITE_MANIFEST`, not a hardcoded list).
  - `sprite2x.js` paths all exist on disk and each is 2x its 1x sibling (can live in the
    assets check or a vitest over `public/`).
  - Python: `--scale 2` doubles the cell; normalize at 2x keeps outline display width.
- `npm run assets -- --strict`, full vitest suite, Python art tests green;
  `npm run build` green.
- Live (capture build; base = 4.1a head):
  - at `?res=2`, frozen-frame crops of every tower tier, every enemy, heroes, soldiers:
    sharper than 4.1a, same silhouette bounds (overlay diff of alpha masks within 1 px);
  - at `?res=1`, network log shows no `@2x` request and frames match 4.1a within noise;
  - at `?res=2`, no 404s; drone renders (1x) and is not a Graphics fallback;
  - flow matrix green; 0 page errors.
- Report the shipped-byte delta and the k = 2 texture memory delta.

## Left to the builder

- Exact module for the resolver and the shape of `sprite2x.js` (Set vs array).
- Whether 2x normalize shares a code path with 1x or loops twice.
- How `art:apply` wires the 2x steps (a new step in its plan is the expectation).
