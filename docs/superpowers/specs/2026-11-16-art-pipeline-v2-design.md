# Art Pipeline v2: design

Roadmap task **4.0 [AUTO] Pipeline v2** (`docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md` §4 Phase 4, §5).
Branch `visual/4.0-art-pipeline-v2` → PR into `visual/integration`.

## Intent

Every Phase 4 art batch (4.1–4.5, and the 3.2 icon set later) ends at gate G2: the user picks the art. Today, getting from "Draw Things made an image" to "it's in the game" is hand work: re-run with new seeds, eyeball files, run `build-sprite-sheets.py` with per-entity flags remembered from notes, run `normalize.py`, hand-edit `src/data/sprites.js`. The roadmap's goal is **minutes, not hours, of the user's time per batch**:

1. Generate N candidates per asset unattended (overnight is fine), resumable.
2. Cut out each candidate's background automatically.
3. The user opens one review page, clicks a favourite per asset, downloads `picks.json`.
4. One command installs the winners into the game and runs the checks.

The first real consumer is **4.2 (tower tier art)**, which needs per-tier **variants**. The user chose (option A) that 4.0 supports variants end to end, so 4.2 is only "write the prompts, run the batch, pick".

## Goals

- Job files (`scripts/art/jobs/<batch>.json`) that describe a batch: which assets, how many candidates, and per-asset generation/build settings.
- `npm run art -- --job <batch> [--candidates N]`: generates candidates into `.art-cache/candidates/<batch>/<assetId>/`, resumable (skips existing files), rotating seeds so rerolls stay on style.
- Automatic background removal of every candidate (`rembg`, `isnet-general-use`) for review.
- `npm run art:review -- <batch>`: builds `.art-cache/review/<batch>/index.html`, **layout C** (user pick, see below).
- `npm run art:apply -- <picks.json>`: installs winners per asset kind (below), then runs `npm run assets` and `npm test` and reports.
- Tier **variants** (`t2`, `t3`, `t4a`, `t4b`, the keys #49 already loads) for sprite entities: generation, sheet building, normalisation and the manifest `variants` entry, all automatic.
- A **fake generator** so the whole loop (generate → review → pick → apply) runs and is tested with Draw Things off.

## Non-goals

- Writing the 4.2 tower prompts or running the 4.2 batch (4.2's job). 4.0 may add **one** first-draft variant prompt for the live check (see Verification).
- Icons (3.2) or pads/props (4.4) asset kinds. The kind registry must make adding one a small, local change, but 4.0 ships only `sprite`, `overworld`, `portrait`.
- Replacing `npm run art` without `--job`. It keeps working exactly as today (option A: the two paths coexist).
- Hosting the review page anywhere. It is a local file.
- Auto-committing. Apply changes files and stops.

## Anti-goals (a failure even if it "works")

- **Placeholder art reaching `public/`** on a real branch. Fake candidates must be impossible to install by accident.
- **Prompts in two places.** `PROMPTS.md` stays the single source of every prompt (it has regression tests for the quoted-noun and merged-blockquote traps). Job files reference prompt entries; they never contain prompt text.
- **Silently shipping art that never renders.** The two known traps (bullet name ≠ runtime type; inline span picked over a fence) must stay covered, and a variant whose files are missing must fail `npm run assets -- --strict`, not 404 at boot.
- **Losing the only copy of a reference.** `.art-cache/sprites/*.png` is gitignored and cannot be regenerated identically. Apply must back up any reference it overwrites.
- Breaking shipped art: running apply on a base entity must reproduce the same pipeline (cutout → mirror → sheets → normalize) as today.

## Constraints

- Vanilla JS ES modules, Vitest + jsdom; Python 3 for image work (`pillow`, `numpy`, `scipy`, `rembg`, `onnxruntime` are installed; `isnet-general-use.onnx` is cached). No new dependencies.
- Pure logic lives in `src/assets/` and is Vitest-tested; `scripts/` holds thin CLIs (project rule: logic testable without a canvas).
- Draw Things HTTP API (A1111 style): `POST /sdapi/v1/txt2img` works today. `/sdapi/v1/img2img` is **unverified** on this build.
- FLUX.1 [schnell]: 1024×1024, 4 steps, CFG 0, `Euler a`. Negative prompts are inert. One image at a time (24 GB Mac; generating with Chrome open has wedged Draw Things twice).
- `.art-cache/` is gitignored and lives in the **primary checkout**; worktrees don't have it. Commands resolve it from the repo root they run in; generation and apply are run from a checkout that has (or will build) the cache.
- Runtime art must live under `public/assets/` (Vite ships only `public/`).

## Approaches considered

- **A. New job-driven pipeline beside today's generator (picked by the user).** Pure modules in `src/assets/`, thin CLIs, Python for image steps, `build-sprite-sheets.py` and `normalize.py` gain variant support; `npm run art` without `--job` unchanged. Trade: two generation paths for now.
- B. Rewrite `generate-art.mjs` as one job-driven tool and migrate today's kinds into job files. Rejected: rewrites a working tool and risks shipped art for no 4.0 need.
- C. All in Python. Rejected: duplicates the JS `PROMPTS.md` parser and its trap tests, and breaks the Vitest rule.

## Decisions the user made

- **Variants in scope** (option A).
- **Review layout C**: a contact sheet, one row per asset, today's art at the left for comparison, then the N candidates; **every candidate tile also shows the candidate at real in-game size on a map-pad backdrop**, so a sprite that vanishes against the ground (the old archer problem) is visible while picking. Dark/light background toggle, a picked count, and a "Download picks.json" button.
- **Build approach A** (above).
- Uses Draw Things (the user's local install) as the generator.
- **A variant reuses its base entity's tone parameters** in `normalize.py` (luminance/contrast/saturation computed from the base entry's first state), so the tiers of one tower stay one family. A variant that comes out much darker or brighter shows that on the review page and gets rerolled.

## Calls made by Claude (after the builder check)

- **Facing is recorded in code, not notes.** `build-sprite-sheets.py` gains a per-entity facing table built from `.claude/notes.md` (enemies mirror; of the towers/heroes/units only the cannon and pyro mirror, the other 11 are built with `--no-mirror`). The job's `mirror` becomes an optional override; a variant inherits its base's facing. Candidates are shown in the review page as they'd be built with that default, and each tile has a **Flip** toggle for a candidate that came out facing the other way; flips go into `picks.json` and apply inverts the mirror for that asset.
- **Variant files become required assets.** `requiredAssets()` today walks `entry.states` only and marks every sprite `required: false`. 4.0 adds each declared variant's state files with `required: true` (a declared variant whose PNG is missing 404s at boot and fails captures); base sprites stay `required: false` (they have a Graphics fallback). Apply runs `npm run assets -- --strict`.
- **Cache root is a setting.** Every command takes `--cache <dir>` (env `ART_CACHE`), default `<repo>/.art-cache`. The live check copies the primary checkout's references into the worktree's cache, so test picks never overwrite the only copies; the backup-before-overwrite rule still applies wherever the cache is.
- **Base-behaviour check compares against the committed sheets.** Rebuild every entity that has a reference, with the facing table, into a temp directory and compare with `assets-src/sprites/`. A mismatch is reported per entity (it means a flag the table doesn't know), never "fixed" by touching shipped art.
- **The game-size strip shows a normalised preview**, not the raw cutout: the navy outline and tone lift are what decide contrast against the pad. `normalize.py` gains a single-image preview mode (base entity's tone parameters for variants, the candidate's own for a base entity) used only to build review tiles.
- **Variants are towers-only in 4.0.** The validator refuses variants on other categories: a soldier variant switches off the code-drawn 4A shield (`Soldier.js`) and replaces the generated tier recolours, which is 4.5's call. Widening it later is a one-line change plus that review.

## Design

### Job file

`scripts/art/jobs/<batch>.json`, committed. Example:

```json
{
  "batch": "towers-t4",
  "candidates": 8,
  "seed": 77021,
  "assets": [
    { "kind": "sprite", "entity": "tower_archer", "variant": "t4a",
      "mirror": false, "init": "base", "strength": 0.45 },
    { "kind": "sprite", "entity": "tower_cannon" },
    { "kind": "overworld", "id": "overworld_5" }
  ]
}
```

- `assetId` is derived: `tower_archer.t4a`, `tower_cannon`, `overworld_5`. It names folders, review rows and `picks.json` keys.
- Sprite settings per asset, all optional overrides: `mirror` (default: the entity's entry in the facing table), `keepDebris` (default `false`). A `cell` override is rejected for now (final-review ruling): apply does not rewrite the manifest's `frameWidth`/`scale`, so a different cell would be sliced wrong; cells come from the script's `PLAN`/`CELL_OVERRIDES`.
- `init: "base"` + `strength` asks for img2img from the entity's base reference (variants only). Omitted → txt2img.
- A pure validator rejects: unknown kind, an entity/variant with no `PROMPTS.md` entry, an unknown variant key (allowed: `t2`, `t3`, `t4a`, `t4b`), a variant on a non-tower entity, duplicate `assetId`s, `candidates` outside 1–16, `strength` outside 0–1, `init` on a non-variant.

### Variant prompts in `PROMPTS.md`

A variant is a bullet in the same category section named `type.variant`, holding a **full** subject (no automatic merging with the base prompt):

```
- **archer.t4a** — `<full subject for the T4A look>`
```

`parseSpritePrompts` returns `{ category, type, variant?, subject }`. Existing bullets parse exactly as today (regression tests stay green). New tests: a variant bullet parses with the runtime type; a fenced variant prompt beats an inline span; the soldier/sentry `default` mapping applies to variants too.

### Generation (`npm run art -- --job <batch>`)

- Resolves the job against `PROMPTS.md`, then for each asset and candidate index `i` writes `.art-cache/candidates/<batch>/<assetId>/<i>.png` (raw) and `<i>.json` (prompt, seed, mode `txt2img`/`img2img`/`fake`, timestamp).
- **Seeds:** candidate `i` of reroll round `r` uses `seed + r * 1000 + i`. Round 0 is the first run; each reroll (below) starts the next round and writes new indices after the existing ones, so earlier candidates stay viewable.
- **Resumable:** an existing `<i>.png` is skipped. Interrupting and re-running continues.
- **img2img:** the init image is the base reference `.art-cache/sprites/<entity>.png`; if that is missing, the committed original `assets-src/sprites/<dir>/<type>_idle.png` (or `_move` for enemies), upscaled to 1024. If the server answers img2img with an HTTP error, the run **falls back to txt2img with the base asset's seed** for that asset and records `mode: txt2img` (the roadmap's fallback). The review page shows the mode per row.
- **`--fake`:** no server. Writes deterministic placeholder candidates (today's art for the entity, hue-shifted per index, with a visible "FAKE" stripe; a plain labelled card for kinds with no current art) and `mode: fake` metadata.
- `--dry-run` keeps today's meaning: print the resolved plan, write nothing.
- Port discovery, the "switch on the HTTP API Server" help text and FLUX settings are reused from `generate-art.mjs` (extract to a shared module rather than copy).

### Cutout

After generation, `scripts/art/cutout.py` (new) writes `<i>.cut.png` beside each raw candidate whose kind wants a cutout (`sprite`: yes; `overworld`/`portrait`: no), using the same `isnet-general-use` + largest-component logic as `build-sprite-sheets.py` (import or extract it so the two can't drift). Batch, resumable. Review shows the cutout; apply uses the **raw** image for sprites, because `build-sprite-sheets.py` cuts out itself.

### Review page (`npm run art:review -- <batch>`)

Static HTML at `.art-cache/review/<batch>/index.html` with relative image paths, built by a pure function from the job + candidate metadata (Vitest-tested on its output).

- One row per asset: label (`entity` + variant, kind, generation mode), **today's art** (first frame of the shipped sheet; for a variant, the base art; "none yet" if absent), then every candidate.
- Each candidate tile: the large image (shown with the default facing applied), a **Flip** toggle (sprites only), plus a **game-size strip** for sprite assets: the normalised preview scaled so its silhouette matches the entity's on-screen size (from the manifest's `scale` and `ground.width`, or the category footprint for entities without one), on a crop of a real map backdrop with a pad ellipse. Overworld/portrait tiles show the image at its shipped display size instead.
- Click picks (one per row). Each row also has **"None — reroll"**.
- Dark/light background toggle; picked count; **Download picks.json**.
- Picks persist in `localStorage` keyed by batch, so closing the tab loses nothing (read/write wrapped in try/catch; the page works without it).

### `picks.json`

```json
{ "batch": "towers-t4",
  "picks":  { "tower_archer.t4a": 3, "tower_cannon": 0 },
  "flip":   ["tower_cannon"],
  "reroll": ["overworld_5"] }
```

`flip` lists picked sprite assets whose mirror setting is inverted relative to the default.

A pure validator checks: batch matches a job; every key is an `assetId` in it; every index has a candidate file; no asset is both picked and rerolled. `npm run art -- --job <batch> --reroll picks.json` generates a new round for the rerolled assets only.

### Apply (`npm run art:apply -- <picks.json>`)

A pure planner turns picks into an ordered list of file operations and commands; a thin CLI executes it and prints each step. Per kind:

- **sprite, base entity** (`tower_cannon`)
  1. Back up the existing reference to `.art-cache/sprites/backup/<entity>-<timestamp>.png`, then copy the raw pick to `.art-cache/sprites/<entity>.png`.
  2. `build-sprite-sheets.py <entity> [--keep-debris]` from the job settings (facing comes from `scripts/art/facing.json`).
  3. `normalize.py --only <category>/<type>`.
  4. Update the entry's `ground` in `src/data/sprites.js` from normalize's measured values, via a pure text transform that rewrites only that entry's `ground: { footY, width }` line and fails loudly unless it matches exactly once.
- **sprite, variant** (`tower_archer.t4a`)
  1. Copy the raw pick to `.art-cache/sprites/<entity>.<variant>.png` (backup as above if present).
  2. `build-sprite-sheets.py` builds the base entity's states under variant names: `assets-src/sprites/towers/archer_t4a_idle.png`, `archer_t4a_attack.png`.
  3. `normalize.py` normalises variant sheets too (it currently iterates base states only), **using the base entry's tone parameters**, and prints their `ground`.
  4. Write/update the variant in **`src/data/spriteVariants.js`**, a generated data module (`export const SPRITE_VARIANTS = { 'tower/archer': { t4a: { ground, states: {...} } } }`) that `sprites.js` merges into the matching `SPRITE_MANIFEST` entries' `variants`. Generated, not hand-edited; header comment says so. `scale`/`anchor` are not written: a variant always shares its base's cell.
- **overworld / portrait**: resize the raw pick to the asset's expected size (from `requiredAssets()`) into its `public/assets/...` path.

Then: `npm run assets -- --strict` (which, after this task, requires every declared variant's files), then `npm test`; print a summary of files changed and both results. **Apply refuses any pick whose metadata says `mode: fake`** unless `--allow-fake` is passed, and `--allow-fake` is only used by tests against a temp directory.

### Code layout (builder may adjust names)

| Where | What |
|---|---|
| `src/assets/artJob.js` | parse + validate job files; derive `assetId`s; resolve prompts via `promptParser` |
| `src/assets/candidates.js` | candidate paths, seed schedule, resume/next-index logic, reroll rounds |
| `src/assets/picks.js` | validate `picks.json` |
| `src/assets/reviewPage.js` | job + metadata → HTML string |
| `src/assets/applyPlan.js` | picks → ordered steps; the `ground`-line transform; `spriteVariants.js` writer |
| `src/assets/promptParser.js` | + variant bullets |
| `scripts/art/drawThings.mjs` | server discovery, txt2img/img2img, extracted from `generate-art.mjs` |
| `scripts/generate-art.mjs` | `--job`, `--candidates`, `--fake`, `--reroll` route to the job path |
| `scripts/art/review.mjs`, `scripts/art/apply.mjs` | thin CLIs; `package.json` gains `art:review`, `art:apply` |
| `scripts/art/cutout.py` | batch cutout, sharing logic with `build-sprite-sheets.py` |
| `scripts/build-sprite-sheets.py`, `scripts/art/normalize.py` | + variant names |
| `src/data/spriteVariants.js` + `src/data/sprites.js` | generated variants + merge |
| `src/assets/assetManifest.js` | + declared variant files, `required: true` |
| `scripts/art/jobs/` | committed job files incl. a small smoke job |

## Edge cases to cover

- Job: empty `assets`; unknown kind; entity with no prompt; variant with no variant prompt; duplicate asset; `candidates` 0 or >16.
- Generation: server down (help text, exit 1, nothing written); interrupted mid-batch then resumed; img2img unsupported (fallback recorded); base reference missing for img2img (`assets-src` fallback; neither present → clear error for that asset, others continue).
- Review: an asset with zero candidates (row says so); missing cutout (show raw with a warning); no current art; `localStorage` unavailable.
- Picks: index with no file; asset both picked and rerolled; batch mismatch; empty picks (apply does nothing, says so).
- Apply: fake pick refused; `ground` line not found or found twice (fail before writing anything else); variant on an entity with no base manifest entry (refuse); `spriteVariants.js` absent (created) vs present (merged, other entries kept); re-applying the same picks is a no-op apart from timestamps (idempotent); Python step fails (stop, report, leave earlier steps' files for inspection; nothing to roll back because nothing is committed).
- Runtime: `SPRITE_VARIANTS` empty → manifest identical to today (no boot 404s; captures unchanged).

## Verification

- Vitest for every `src/assets/` module, written test-first; regression tests for the existing prompt traps stay green; full suite and `npm run build` green.
- A Vitest **end-to-end with `--fake`** in a temp directory: job → fake candidates → review HTML → picks → apply plan (Python steps stubbed at the command boundary).
- **Python:** rebuild every entity that has a reference (with the facing table) into a temp directory and compare pixel-for-pixel with the committed `assets-src/sprites/` sheets, and run `normalize.py` the same way against `public/assets/sprites/`. Proves variant support and the facing table didn't change base behaviour; any mismatch is reported per entity.
- `src/assets/assetManifest.js` tests: a declared variant's files appear as required; an empty `SPRITE_VARIANTS` leaves the inventory unchanged.
- **Live, with Draw Things (the user switches on the HTTP API Server and quits Chrome first):** a small smoke job (`scripts/art/jobs/smoke.json`): one base tower and one variant (`tower_archer.t4a`, with a first-draft variant prompt in `PROMPTS.md` that 4.2 will refine), 3 candidates each. Generate → review page opened and **looked at** on both backgrounds → pick → apply → run the production build and see the variant render in the game at tier 4A → then discard the applied art (`git checkout` the art files) so no test pick ships. Records whether this Draw Things build supports img2img.

## Left to the builder

- Module/file names within the layout above, CLI flag spellings beyond those named, and how `cutout.py` shares code with `build-sprite-sheets.py`.
- The exact look of the review page within layout C (the brainstorm mockup `.superpowers/brainstorm/*/content/review-layout.html`, option C, is the reference), and which map backdrop crop serves as the pad.
- The fake candidate's exact appearance (must read as fake at a glance).
- Whether the `ground` transform targets the line by regex or by locating the entry's object literal, as long as it fails loudly on ambiguity.
