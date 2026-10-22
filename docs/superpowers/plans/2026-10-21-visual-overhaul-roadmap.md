# Last Light — Visual Overhaul & Release Roadmap

**Created:** 2026-10-21 · **Owner:** Keith · **Executor:** Claude Code sessions (evenings), human gates marked below
**Goal:** take the working-but-rough game to a polished, portfolio-grade release (web, desktop + phone), with a clean path to commercial later.
**Budget:** ~$0. **Theme:** space (Veth hive vs. human outposts). **Art engine:** Draw Things (FLUX.1 [schnell] only) + code.

> **Honest quality bar.** With FLUX-only generation, scripted animation and no artist, the realistic result is a *cohesive, polished indie look* — not Kingdom Rush parity. Cohesion (one palette, grounded shadows, baked road, real projectiles, themed UI, juice) does most of the work; per-asset artistry does the rest. Phases are ordered so each one visibly improves the game on its own.

---

## 1. Locked decisions (change only at a human gate)

1. **Web release first** (itch.io + Vercel). Desktop and phone browsers from the same build. Store apps / Steam are a post-launch decision (Phase 6 gate).
2. **Keep the existing 10 backgrounds.** Add depth with grading, props, a baked road and shadows rather than regenerating maps.
3. **Fallback-first assets.** Every new art slot goes through the deferred-asset pattern (`spriteKeys.js`, `portraitFallback.js`, manifests) so a missing PNG never breaks the game.
4. **UI is code-drawn** (procedural panels, bundled OFL fonts) so it scales on any screen and needs no art budget. Only icons are generated.
5. **Animation = transforms + FX**, per `scripts/build-sprite-sheets.py` (no limb articulation; FLUX can't hold identity across frames). Quality comes from larger source cells, normalization, shadows, hit reactions and status FX.
6. **Never push to `main`.** Every task is a branch + PR; Vercel preview URLs are the phone-testing path.

## 2. How to run this autonomously

### Task tags
- **[AUTO]** Claude can do it unattended: branch → implement → test → verify → PR.
- **[LOCAL]** Needs your Mac (Draw Things API server on, Python deps). Claude runs it from a local Claude Code session; you only keep the machine awake (`caffeinate -dimsu`).
- **[GATE]** Needs a human decision/pick. Claude prepares everything, writes what it needs under **NEEDS HUMAN** in `.claude/notes.md`, and moves on to the next unblocked task.

### Session prompt (paste at the start of any evening)
```
Read CLAUDE.md, .claude/notes.md and docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md.
Work the roadmap autonomously: take the first unchecked task whose dependencies are done and whose tag
is AUTO (or LOCAL if Draw Things is running — check http://127.0.0.1:7860). For each task:
1. branch visual/<task-id>-<slug> off the latest visual/integration branch (create it from main if missing)
2. write a short spec/plan stub in docs/superpowers/ only when the task says so
3. implement; keep tunables in src/data/; pure logic gets Vitest tests
4. run `npm test` and `npm run build`; run the capture harness (task 0.1) and LOOK at the screenshots
   against the task's acceptance criteria and docs/art-bible.md
5. satisfy CLAUDE.md "Definition of Done" (edge cases enumerated, browser-verified, root cause named)
6. commit, open a PR into visual/integration (never main), tick the box in the roadmap, add a dated line to .claude/notes.md
Continue until 4 tasks are done, a GATE blocks everything left, or tests/build fail twice on the same
issue (then stop and write the blocker in notes). Finish by summarising what is waiting for me.
```

### Branch/PR model
`main` (prod) ← `visual/integration` (you merge when you're happy, after phone-testing the preview URL) ← one branch per task. Claude never merges into `main`.

### Allowed new dependencies
Dev: `playwright`, `sharp`. Runtime: `@fontsource/*` (OFL fonts). Python (local art only): `rembg[cli]`, `onnxruntime`, `pillow`, `numpy`, `scipy` (already used). Anything else → ask via NEEDS HUMAN.

### Stop conditions
Failing tests after two attempts at the same fix; any change that would alter balance numbers outside Phase 5; any request to touch `main`, secrets, or paid services.

## 3. Human gates (total ≈ 4–6 hours over the whole project)

| Gate | When | What you do | Time |
|---|---|---|---|
| G1 | after 0.2 | Approve `docs/art-bible.md` (palette, sizes, light) | 10 min |
| G2 | after each art batch (4.2–4.7) | Open `.art-cache/review/index.html`, click favourites, download `picks.json` | 20–30 min × ~6 |
| G3 | end of Phases 1, 2, 3 | Play the Vercel preview on your phone + desktop; list what feels wrong | 10–15 min × 3 |
| G4 | before 5.4 | Decide map 9 funding / map 2 & 5 difficulty (backlog #35–37) | 10 min |
| G5 | Phase 6 | Approve itch.io page copy, publish, decide on commercial path | 30 min |

## 4. Tasks

**MVP cut line (portfolio v1):** Phases 0–3, tasks 4.1–4.4, and Phase 6. Phase 5 and the remaining art ship as updates. Rough size: ~38 checklist items in total (about 25 in the MVP cut), roughly one evening each → ~8–10 weeks at 3 evenings/week for v1.

### Phase 0 — Harness & art bible
- [x] **0.1 [AUTO] Capture harness.** Playwright script `scripts/capture.mjs` boots `vite preview`, loads `?debug=1&map=N&wave=W&build=<scripted towers>`, waits N sim-seconds, saves a 1280×720 PNG (+ optional 10 s MP4/GIF) to `.art-cache/captures/`. Add the debug query hooks in `GameScene` (disabled in production builds). *Accept:* one command produces a screenshot of maps 0/3/5/9 mid-wave with towers and enemies visible; Claude can open them with Read. Also emulates iPhone/Pixel/iPad viewports with touch.
- [ ] **0.2 [AUTO→G1] Art bible.** Write `docs/art-bible.md` from Appendix A (camera, light, palette, unit sizes, outline rule). *Accept:* G1 sign-off.
- [x] **0.3 [AUTO] Baseline.** Capture baseline screenshots + write `docs/visual-baseline.md`: ranked list of what looks weakest per screen (title, map select, in-game, tower panel, results). Becomes the before/after record for the portfolio.

### Phase 1 — Cohesion in code (no new art)  → G3 at the end
- [x] **1.1 [AUTO] Asset diet.** `scripts/optimize-assets.mjs` (sharp): backgrounds PNG → WebP at 1× and 0.5× (pick by `devicePixelRatio`/canvas width); keep PNG originals in `assets-src/` (git-lfs-free, gitignored if >50 MB). *Accept:* total shipped background weight ≤ 6 MB (from ~34 MB); no visual diff beyond compression; load screen shows progress.
- [x] **1.2 [AUTO] Grounding.** Soft ellipse contact-shadow in `EntitySprite` (data-driven size/offset per entity in `sprites.js`), y-sorted depth for towers/enemies/heroes/soldiers. Unit tests for the depth/shadow math. *Accept:* every unit visibly sits on the ground in captures; flyers have a detached, fainter shadow.
- [x] **1.3 [AUTO] Sprite normalization.** `scripts/art/normalize.py`: unified dark outline (art-bible width), saturation/contrast match, top-left rim light, edge cleanup, applied to all existing sprite sheets/portraits. Idempotent, writes to `public/assets/sprites/` with originals kept in `.art-cache/originals/`. *Accept:* contact sheet of all 36 sheets reads as one family (washed-out cannon fixed).
- [x] **1.4 [AUTO] Map grading & vignette.** Per-map `grade` in `src/data/maps.js` (tint, contrast, vignette, optional bloom); applied through Phaser camera postFX with a quality setting (auto-off on low-end/mobile or Canvas fallback). *Accept:* each of the 10 maps has a distinct mood; FPS impact < 10 % on desktop capture.
- [x] **1.5 [AUTO] FX foundation.** Generate particle textures in code (soft glow, ring, spark, smoke puff, shard, ember) at boot; new `src/data/fx.js` declares per-tower/tier projectile shape, trail, muzzle flash and impact burst; `Projectile.js` + `ParticleSpawner.js` read it. Object-pool projectiles/particles. *Accept:* archer arrows, cannon arcing shells with shadow, mage bolts, ice shards, sniper tracer, soldier muzzle flashes all distinct; unit tests for the fx data contract.
- [x] **1.6 [AUTO] Hit/death/status FX.** Hit squash + brief hit-stop on heavy hits, death effects by size class (small pop / large burst + debris / boss sequence), status overlays (slow = frost tint + crystals, burn, stun), life-loss pulse. *Accept:* each effect visible in a captured sequence; no new per-frame allocations (pooled).
- [ ] **1.7 [AUTO] Procedural road.** New `RoadRenderer` replacing the stroked-line styles: textured, edge-feathered road baked once into a RenderTexture per map from the existing path polyline, with junction/curve caps, a **spawn portal** and a **base beacon** (animated). Procedural texture per biome (noise + gradient) as the default; swaps to generated tiles in 4.5. Old `PathRenderer` stays behind a flag until all maps pass. *Accept:* road reads as part of the terrain on all 10 maps; pad/road overlap checks pass.
- [ ] **1.8 [AUTO] Economy & feedback juice.** Gold pop on kills with arcing coin to the HUD counter, build/upgrade/sell animations (scale-pop + ring burst), wave-incoming banner, boss warning, ability cooldown rings and target reticles, selection ring, pad idle glow. *Accept:* checklist in the PR with a capture per item.
- [ ] **1.9 [AUTO] Ambient life.** Extend `AmbientBackgroundLayer`/`ambientFxFamilies.js`: biome-specific drifting dust/embers/stars with 2-layer parallax; blinking beacons on pads. *Accept:* motion visible in a 10 s capture; negligible CPU.
- [ ] **G3 gate** — phone + desktop playtest of the preview; findings go to `docs/visual-baseline.md`.

### Phase 2 — Touch & responsive  → G3
- [ ] **2.1 [AUTO] Input model.** One pointer-first `InputController`: tap = select/place; long-press = inspect (replaces hover); two-step confirm for upgrade/sell; every keyboard shortcut gets an on-screen equivalent (pause, speed, send wave, abilities). Existing hover tooltips (`AbilityTooltip`, `WavePreviewPopover`, `InspectController`) get tap paths. Tests for the state machine.
- [ ] **2.2 [AUTO] HUD to canvas.** Move the HTML `#hud` into a canvas HUD (scales with FIT, ≥ 44 px targets after scaling to a 360 px-high phone viewport); keep DOM overlays (codex, settings, story) but restyle them with touch-sized CSS. *Accept:* HUD usable at 844×390 and 932×430 landscape captures.
- [ ] **2.3 [AUTO] Mobile shell.** Landscape prompt, fullscreen button, audio unlock on first tap, `touch-action: none`, disable pull-to-refresh/double-tap zoom, safe-area insets, visibilitychange auto-pause, resize handling.
- [ ] **2.4 [AUTO] Device matrix.** Playwright touch-emulation scripts: boot → select map → build → upgrade → send wave → pause, on iPhone 14, Pixel 7, iPad. Screenshots into the PR. *Real-device check is part of G3.*

### Phase 3 — UI kit & screens
- [ ] **3.1 [AUTO] Theme module.** `src/ui/theme.js`: palette, spacing, bundled OFL fonts (e.g. Orbitron for headings, Rajdhani/Exo 2 for body via `@fontsource`), procedural 9-slice panels and buttons (bevel, inner glow, scanline) with normal/pressed/disabled states; document in `docs/art-bible.md`.
- [ ] **3.2 [LOCAL→G2] Icon set.** Generate icons (6 towers, 6 enemies, gold/lives/wave/speed/pause/abilities, 12 hero abilities) via the art pipeline (Section 5), cutout, 128 px. Emoji remain the fallback until the files exist.
- [ ] **3.3 [AUTO] Radial build/upgrade menus.** Replace the tower panel with a radial picker (cost, affordability, range preview) and an upgrade ring that previews the next tier and both branches. Touch-first.
- [ ] **3.4 [AUTO] Title & map select.** Animated starfield + parallax, typographic logo with glow (code, not generated — FLUX renders text badly), overworld nodes with state (locked/open/cleared + stars), polished transitions.
- [ ] **3.5 [AUTO] Story dialogs.** Portrait frames, typewriter text, skip/advance on tap.
- [ ] **3.6 [AUTO] Results screen + stars.** Victory/defeat screens with stats, 3-star rating (lives remaining thresholds in `src/data/`), `SaveManager` extended + tests.

### Phase 4 — Art pass (Draw Things)  → G2 after each batch
- [ ] **4.0 [AUTO] Pipeline v2** (Section 5): job specs, N candidates per asset, auto-cutout, review page, `picks.json` apply step. Dry-run works without Draw Things.
- [ ] **4.1 [LOCAL] Re-bake at 2× cell size.** Re-run `build-sprite-sheets.py` from the 1024 px references (regenerate refs with stored seeds if `.art-cache/` is missing) into 128 px (colossus/titan 192/256) cells; update `sprites.js` scales so on-screen size is unchanged but crisp on retina/phones. *Accept:* sizes pass `npm run assets`; side-by-side capture sharper at 2× DPR.
- [ ] **4.2 [LOCAL→G2] Towers.** 3 looks per tower (T1–T3 share a base, branch 4A, branch 4B) = 18 images × 8 candidates; code adds tier pips/glow/scale for T2/T3. Use `/sdapi/v1/img2img` from the approved T1 reference (strength ≈ 0.4–0.5) for branch variants **if your Draw Things build supports it**, else same-seed txt2img with a prompt delta. Update `sprites.js` with `tier`/`branch` selection in `spriteKeys.js` (+ tests).
- [ ] **4.3 [LOCAL→G2] Enemy refresh.** Only regenerate enemies that still look off after 1.3 (likely skitter/phantom); add a hurt-pose variant per enemy for hit reactions where it pays off.
- [ ] **4.4 [LOCAL→G2] Pads & set dressing.** 4 build-pad variants, 6 biome road tiles (feeds 1.7), ~25 prop cutouts per biome family (rocks, crystals, wrecks, antennae, ruins), placed by a seeded scatter (`src/systems/propScatter.js`, tested) that avoids road/pads/UI.
- [ ] **4.5 [LOCAL→G2] Spawn portal, base beacon, hero & soldier refresh, portraits.** Lower priority; do after the MVP cut if time is short.
- [ ] **4.6 [AUTO] Licence ledger.** `docs/licenses.md`: model (FLUX.1 [schnell], Apache-2.0 — confirm the exact weights Draw Things serves), rembg, fonts (OFL), existing `public/audio/ATTRIBUTIONS.md`. Needed before any commercial release.

### Phase 5 — Gameplay depth (measured with `npm run balance`)  *(post-v1 updates)*
- [ ] **5.1 [AUTO] Map mechanics.** Spec first (brainstorm → spec → plan, per `CLAUDE.md`). Three data-driven mechanics: `altPaths` (forks with weighted spawn), `hazardZones` (telegraphed asteroid impacts, ion storm slows towers), `padRestrictions` (locked/special pads). Teach `src/sim/` the same rules so balance stays measurable. Give each of maps 3–9 one signature mechanic.
- [ ] **5.2 [AUTO] Wave readability.** Flyer/boss warnings, richer wave preview, boss intro beat.
- [ ] **5.3 [AUTO] Replay value.** Difficulty modes (Normal/Veteran), endless mode from the wave generator, per-map best score.
- [ ] **5.4 [GATE→AUTO] Balance debt.** Backlog #35–37 (maps 5, 2, 9) after your decision at G4.
- [ ] **5.5 [AUTO] Onboarding.** Guided first-map hints (place, upgrade, ability, send-early), dismissible, stored in save data.

### Phase 6 — Release
- [ ] **6.1 [AUTO] Performance pass.** Profile with Playwright traces; pool everything hot; confirm 60 fps desktop, ≥ 30 fps on a mid-range phone capture; quality toggle in settings (bloom/grade/particles).
- [ ] **6.2 [AUTO] Build & package.** `vite build --base=./`, `scripts/package-itch.mjs` → zip; auto-generated screenshots + a 15 s gameplay clip from the capture harness.
- [ ] **6.3 [AUTO] Portfolio README.** Before/after gallery, architecture (sim + balance tool + 1,500+ tests), pipeline write-up.
- [ ] **6.4 [GATE G5] Publish.** itch.io page + feedback link; decide after real plays whether to pursue Capacitor (mobile stores: Apple ~$99/yr, Google ~$25 once) or Steam (~$100/app) — verify current fees then.

## 5. Draw Things art pipeline (FLUX.1 [schnell])

The repo already drives Draw Things through `npm run art` (A1111-style `POST /sdapi/v1/txt2img`, auto port discovery, locked seed). Pipeline v2 keeps that and adds a review loop so you spend minutes, not hours, per batch.

**Setup (once):** Draw Things → Advanced → enable the **API Server**; keep the FLUX.1 [schnell] model loaded; `pip3 install 'rembg[cli]' onnxruntime pillow numpy scipy`.

**Settings:** 1024×1024, 4 steps, CFG 0, Euler a. FLUX ignores negative prompts at CFG 0 — put exclusions in the positive prompt ("no text, no ground shadow, plain flat background").

**Flow per batch:**
1. Job spec in `scripts/art/jobs/<batch>.json`: id, prompt (style anchor from the art bible + subject), seeds list, output size, cutout on/off, target manifest path.
2. `npm run art -- --job <batch> --candidates 8` generates into `.art-cache/candidates/<id>/` (resumable, skips existing, rotating seeds so rerolls are on-style).
3. Auto-cutout with `rembg` (`isnet-general-use` — it drops the generator's ground shadow), then `normalize.py`.
4. Builds `.art-cache/review/index.html`: grid of candidates per asset on a dark/light toggle, click to pick, **Download picks.json**. *(G2: this is the only human step.)*
5. `npm run art:apply -- picks.json` copies winners to `public/assets/...`, builds sheets, updates manifests, runs `npm run assets` and the tests.

**Time:** 18 tower looks × 8 candidates ≈ 144 images — expect an hour or two of unattended generation on Apple silicon (depends on your Mac). Run it overnight with `caffeinate`.

**Quality tips baked into the prompts:** one subject, centered, "high-angle top-down game sprite", flat background; check every frame for stray lettering (FLUX likes to write the title); reject anything with a baked ground shadow.

## 6. Risks & fallbacks

| Risk | Fallback |
|---|---|
| FLUX can't keep a tower consistent across tiers | Code-decorated tiers (pips/glow/scale) + two branch looks; no per-tier art |
| Normalization makes sprites look flat | Per-entity opt-out in `normalize.py`; keep originals in `.art-cache/originals/` |
| postFX tanks mobile FPS | Quality setting; default off on touch devices (1.4/6.1) |
| HUD-to-canvas rewrite is bigger than expected (2.2) | Keep DOM HUD, scale with CSS `clamp()` and 44 px minimums; revisit post-v1 |
| Tests coupled to the Graphics fallback | Update alongside each task; never delete coverage to go green |
| Scope creep | Anything not on the MVP cut line waits for v1.1 |

## Appendix A — Art bible seed values (adjust at G1)

- **Camera/light:** high-angle top-down (~60° pitch); light from upper-left; shadows fall lower-right, soft ellipse at ~35 % black.
- **Human palette:** cool steel + teal hulls, amber (#ffb000) accent lights.
- **Veth palette:** dark chitin bases with the per-type emissive from `enemies.js` — drone `#33ff66`, skitter `#ff6600`, brute `#667766`, colossus `#880044`, phantom `#9b59b6`, titan `#e74c3c`.
- **UI palette:** deep navy panels (#0f1424), cyan-teal accent, gold for currency (existing `#ffd700`).
- **Outline:** 1.5 px dark navy (#0b1020) at 1×, 3 px at 2× source.
- **On-screen footprint (1280×720 design px, source authored at 2×):** drone 44, skitter 38, brute 54, colossus 72, phantom 46, titan 104; towers ~80; heroes ~56; soldiers/sentries ~36.
- **Touch:** minimum 44 px target after FIT scaling on a 390 px-high viewport.
