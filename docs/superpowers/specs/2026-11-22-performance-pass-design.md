# Roadmap 6.1: performance pass

**Date:** 2026-11-22 · **Branch:** `perf/6.1-performance-pass` off `origin/visual/integration` (b88712a)
**Roadmap text:** "Profile with Playwright traces; pool everything hot; confirm 60 fps desktop, ≥ 30 fps on a mid-range phone capture; quality toggle in settings (bloom/grade/particles)."

## Intent

Phase 6 is the v1 release. Before the game goes on itch.io, it has to run smoothly on the desktop and on ordinary phones, and a player on a weak device needs a switch to make it lighter. Success is measured, not felt: a repeatable script proves the frame rate, and an on-screen counter lets the user check their own phone at the next playtest.

## What the measurements say (2026-11-22, recon)

Probe: the capture build, Chromium on the real GPU (`--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, renderer "ANGLE Metal Renderer: Apple M4"), the `defaultCaptureBuild` tower set, frame intervals from `requestAnimationFrame` over 12 s. A phone is approximated by CDP `Emulation.setCPUThrottlingRate`.

| Setup | fps | p95 frame |
|---|---|---|
| desktop1440x2 (2976×1440), map 9 w10, 1x CPU | 60.1 | 16.7 ms |
| iphone (3264×1440), map 9 w10, 4x CPU | 45.3 | 33.4 ms |
| iphone, map 9 w12, 6x CPU (single recon reading) | 25.8 | 50.0 ms |
| same, `_staticLayers` hidden | **59.8** | 16.8 ms |
| same, `_staticLayers` + `_padGlow` + ambient hidden | 60.0 | 16.7 ms |
| desktop1440x2, map 9 w18, 4x CPU, grade + ambient on / off | 44.5 / 50.0 | 33.4 / 33.4 ms |

- **Desktop already meets 60 fps.** The earlier 47.6 fps reading was load from the probe's own build.
- **CPU profile at 6x** (iphone, map 9 w12): 74% of samples are in `GraphicsWebGLRenderer`, 57% in `batchFillPath`, 47% in **earcut**. Game logic (`update`, projectiles, damage) is about 5%, and garbage collection 2.2%.
- **Why:** Phaser's WebGL Graphics renderer re-triangulates every filled path on every frame, even when the Graphics never changes. A census of one busy frame found 490 filled paths:
  - 348 in `GameScene._staticLayers`, a one-shot layer (blockers, platforms, legacy path) that only repaints on build, sell or move;
  - 70 in the ambient layer;
  - 56 in `_padGlow`;
  - 16 elsewhere.
- **No bloom exists** anywhere in the code. The map grade is a ColorMatrix preFX on the backdrop plus a baked vignette image.

## Goals

1. **Bake the static layer.** `_staticLayers` is drawn once into a texture at render scale k, shown as one image at depth 10, and re-baked whenever `_repaintStaticLayers` runs today. It must look the same: at k = 1 and k = 2, a frame-diff against the base shows no change beyond the ambient noise of two base runs.
2. **A performance gate, `npm run perf`** (`scripts/perf.mjs`). It runs the capture build on the real GPU and fails (exit 1) unless:
   - **desktop:** `desktop1440x2` at 1x CPU, mean fps ≥ 57 and p95 ≤ 20 ms;
   - **phone proxy:** `iphone` at 4x CPU, mean fps ≥ 30 and p95 ≤ 34 ms;
   - on every map, at the map's last wave.
   - Thresholds live in `src/data/perfBudget.js`.
   - It refuses to run while the 1-minute load average is ≥ 6 (CPU contention makes the numbers meaningless). It prints each run's fps, p95, p99, peak enemy count and canvas size, and writes `report.json`.
   - It is **not** part of `npm test`, which runs in jsdom with no GPU.
3. **An fps counter.** `?fps=1` shows a small readout (fps and p95 over the last 2 s) **in every build, production included**, so the user can open the Vercel preview on their phone. The frame statistics are a pure function. The perf gate reads the same numbers from the page (`window.__fps`), so the gate and the counter can't disagree.
4. **A Graphics setting: Auto / High / Low** in the settings overlay. It replaces the "Map grade" checkbox.
   - Low turns off the map grade and the in-game ambient particles, and halves particle bursts.
   - High turns them all on.
   - Auto is today's behaviour: grade on desktop, off on touch and Canvas; ambient particles on; full particles.
   - **Reduce motion stays its own checkbox** (user, 2026-11-22). Today's "Ambient motion" checkbox is renamed "Reduce motion" and inverted (checked = `ambientMotion: false`). It keeps every job it has today: the title starfield, world-map flights, story-dialog slam, coin arcs and the in-game ambient layer. The in-game ambient layer draws only when motion is allowed AND Graphics allows it.
5. **Record the before/after** for each gate run in the PR and in the notes.

## Non-goals

- **Pooling for its own sake.** The roadmap says "pool everything hot", but the profile shows allocation and GC at about 2%. Pool only if the gate finds a frame-time cause in allocation; otherwise record the measurement and stop.
- **Bloom.** Nothing to toggle, and adding a bloom pass to then switch off is backwards.
- **Pad glow and the ambient layer redraws.** They are the next two Graphics costs, but hiding them gained nothing measurable once the static layer was gone. If the gate fails on some map because of them, fix them in this branch. Otherwise leave them.
- **Menus** (title starfield, world map). They are not in a level, and nobody reported them as slow.
- **A real-phone automated test.** The user checks a real phone with `?fps=1` at playtest.

## Anti-goals

- **Changing what the game looks like.** A baked layer that is blurrier at k = 2, misaligned by a pixel, or that misses an occupancy change counts as a failure even if the fps number is great.
- **Turning off visuals by default to pass the gate.** The gate runs at the Auto setting.
- **A perf gate that passes vacuously.** The gate's failure was proven on the pre-bake base (1a0aa52) at 8x (23.1 fps, exit 1) and 10x (18.4 fps, exit 1); 6x passed there at 31.3 fps, so 6x is not a failure proof. After the bake, 10x passes (43.9 fps) and the gate is shown failing at 20x (22.4 fps, exit 1).

## Constraints

- Phaser 3.90, WebGL1 (no NPOT mipmaps), render scale k ∈ {1, 2} from `getRenderScale()`; world size `WORLD_WIDTH × WORLD_HEIGHT`. The road texture already follows the same bake-at-k pattern (`bakeRoad`, `RoadRenderer.js`, key carries `@k`, `evictOtherRoads`).
- Tunables live in `src/data/`. Pure logic gets Vitest tests; scenes stay testable through the `gameSceneHarness.js` mocks.
- Allowed dependencies: nothing new (Playwright is already a dev dependency).
- Settings persist through `SaveManager` (`lastlight_save`, envelope version 5). Load merges saved settings over the defaults, so a new key needs only a default.
- The capture harness and the device matrix must keep passing (`npm run matrix`).
- Memory: a world-size texture at k = 2 is 2560×1440×4 ≈ 14.7 MB of GPU memory. Replays should reuse or replace it, not stack copies.

## Approaches

**Picked (user, 2026-11-22): profile first, fix only what the profile shows, gate it, add Auto/High/Low.** The user approved this after seeing the baseline numbers.

Others considered:
- **Pool everything first**, as the roadmap reads. Rejected by the profile: allocation is about 2% of the frame, and the 6x run reaches 60 fps with the static layer alone removed.
- **Lower the default quality on phones to pass.** Rejected (anti-goal); it hides the cause, and the cause is one layer.
- **Replace Graphics circles with Canvas2D baking (like `bakeRoad`)** versus **a Phaser RenderTexture that draws the existing Graphics.** The blocker and platform draw helpers (`BLOCKER_TYPES[].draw(g, …)`, `renderPlatforms(g, …)`) take a Phaser Graphics. A RenderTexture or `generateTexture` reuses them unchanged; a Canvas2D port would rewrite them. **Builder's call between RenderTexture and generateTexture**, as long as goal 1's no-visual-change test holds at both k.

## Decisions

- **The Graphics setting key** is `graphics: 'auto' | 'high' | 'low'`, default `'auto'`. A pure `resolveGraphics(setting, { webgl, touch })` returns `{ mapGrade, ambientFx, particleScale }`. The `mapGrade` registry key stays as it is, so its consumer doesn't change; `ambientFx` and `particleScale` are new registry keys. `ambientMotion` is untouched: it is still resolved from the saved value and the OS reduced-motion preference by `resolveAmbientMotion`. *(Controller's call, shaped by the user's Reduce motion answer.)*
- **Particle bursts at Low** scale by `particleScale` (0.5), rounded up so a burst never drops to zero. *(Controller's call.)*
- **Migration** of the old `mapGrade` boolean only: a saved `false` becomes `graphics: 'low'`, a saved `true` becomes `'high'`, and `null` becomes `'auto'`. The saved `ambientMotion` is left as it is, because it is now the Reduce motion checkbox. *(Controller's call.)*
- **Reaching the last wave:** the capture build already takes `?debug=1&map=N&wave=W&build=…` (`captureUrl` in `scripts/capture.mjs`). The gate uses `wave = MAP_WAVES[map].length`. No new hook is needed, and nothing new ships in production except the `?fps=1` counter.
- **If a map still fails the gate after the bake:** fix the next Graphics costs (pad glow, the ambient layer) in this branch. **No per-map threshold overrides.** If a map still fails after that, stop and report it to the user as a scope question; don't loosen the budget. *(Controller's call.)*
- **Visual equivalence (goal 1)** is a one-off frozen-frame A/B against the base at k = 1 and k = 2, recorded in the PR with its numbers. It is not a committed image-diff test: that would need a GPU and a stable tolerance. A Vitest test does pin that the bake reruns on every `_repaintStaticLayers`. *(Controller's call.)*
- **When changes apply:** the grade applies from the next level, as today, and the settings label says so. Ambient and particles apply live.
- **The phone proxy is `iphone` at 4x CPU** on the M4 GPU, not a guarantee about any real handset. The real check is the user's own phone with `?fps=1`.

## Left to the builder

- RenderTexture vs `generateTexture` for the bake, the texture key and eviction (follow `bakeRoad`'s `@k` key rule).
- The counter's position and style (small, top-left of the map area, theme tokens, out of the way of the rails).
- How `perf.mjs` shares setup with `capture.mjs` (`captureDevices.mjs`, `defaultCaptureBuild`, the capture dist).
