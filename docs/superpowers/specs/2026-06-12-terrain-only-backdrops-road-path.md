# Terrain-Only Backdrops + Road-Style Path — Design Spec (map 0 pilot)

**Date:** 2026-06-12
**Follow-up to:** PR #26 (AI bitmap backdrops), PR #27 (natural-fit paths), the map-0 blocker/path tuning on `feature/map0-path-fit`
**Related spec:** `2026-06-06-space-themed-backgrounds-design.md`, `2026-06-12-natural-fit-paths-slots-design.md`

## Problem & root cause

The gameplay path never lines up with the "road" in the AI-painted backdrops. Investigation (in-browser pixel probe of `map_0_outpost_sigma.png`) showed **the art has no single separable road** — just a honeycomb mesh of valleys between mounds. Hand-tracing waypoints and an automatic valley-pathfinder both confirmed: there is no unique road to follow, so "make the path follow the road" has no well-defined answer.

The mismatch exists because there are **two roads**: the one the AI painted into the terrain, and the procedural path the engine draws. They were authored independently.

## The fix (chosen direction)

Eliminate the conflict at the source: backdrops become **terrain only** (no painted roads/paths/trails). The engine's procedural path becomes **the** road. Result: the road and the gameplay path are the same line by construction — they can never mismatch, on any map — and paths are authored purely for gameplay.

For this to look intentional, the procedural path must read as a believable **worn road**, not the current thin dashed line. That is the engine half of this work.

## Goals

- Upgrade the path renderer so the procedural path renders as a worn road (roadbed + dust berms + wheel ruts), theme-tunable.
- Pilot the whole loop on **map 0 (Outpost Sigma)** only: terrain-only backdrop + road-style path + verify, then roll the proven recipe to the other 9 in a follow-up.
- Provide the exact terrain-only image-generation prompt for map 0.

## Non-goals

- Generating the AI art (done externally via ChatGPT/Midjourney — this environment has no image-gen tool). This spec supplies the prompt; the user produces the PNG.
- Touching maps 1–9 rendering/data in this pass (their `pathRenderStyle` stays as-is).
- Removing the existing per-theme path styles — the road capability is additive.

## Architecture

### Road rendering — additive layers in `src/systems/PathRenderer.js`

`renderPath(gfx, points, style)` currently draws up to three stacked strokes from `STYLE_SPEC[style]`: halo, main, dashed. We extend the `STYLE_SPEC` schema with **optional** road fields. When present, `renderPath` draws these layers first (bottom to top), under the existing halo/main/dash accents:

1. **Dust berms** — a wide, soft, low-alpha stroke along the centerline (kicked-up dust at the road edges).
   Fields: `bermWidth`, `bermColor`, `bermAlpha`.
2. **Roadbed** — the main wide packed-earth stroke.
   Fields: `roadbedWidth`, `roadbedColor`, `roadbedAlpha`.
3. **Wheel ruts** — two thin darker lines offset by `±rutOffset` px along the curve **normals** (worn-track wear).
   Fields: `rutOffset`, `rutWidth`, `rutColor`, `rutAlpha`.

All road fields are optional. A style that omits them renders exactly as today (existing `planet-dust`, `station-strip`, `space-nav`, `organic-glow` are untouched).

**Normal-offset geometry.** Ruts are parallel curves offset from the sampled centerline. Implement a helper that, given the sampled curve points (from `samplePath`), computes a unit normal at each point (perpendicular to the local tangent `pₙ₊₁ − pₙ₋₁`) and emits an offset polyline at `+d` and `−d`. Draw each offset polyline as a smooth stroke. This reuses the existing `samplePath`; only the offset + normal math is new.

Draw order within `renderPath` (bottom → top): **berms → roadbed → ruts → existing halo → main → dashes**. The whole path layer continues to render in the static layer at **depth 10** (under enemies/towers), unchanged.

### New style: `planet-road`

Add a `planet-road` entry to `STYLE_SPEC` and to the exported `PATH_STYLES` array. It carries the road fields tuned for desert/packed-earth plus a faint themed center accent:

```js
'planet-road': {
  // Dust berm (soft light edge)
  bermWidth: 34, bermColor: 0x9a8362, bermAlpha: 0.30,
  // Packed-earth roadbed
  roadbedWidth: 26, roadbedColor: 0x6b5740, roadbedAlpha: 0.78,
  // Worn wheel ruts
  rutOffset: 6, rutWidth: 2, rutColor: 0x4a3c2c, rutAlpha: 0.55,
  // Existing accent fields — faint center dashes on top of the roadbed
  haloColor: 0x000000, haloAlpha: 0, haloWidth: 0,
  mainColor: 0x000000, mainAlpha: 0, mainWidth: 0,
  dashColor: 0x3a2e20, dashAlpha: 0.45, dashWidth: 2, dashOn: 5, dashOff: 9,
},
```

(Exact numbers are the starting point; tuned during browser verification.)

### Map 0 data (`src/data/maps.js`)

- `pathRenderStyle: 'planet-road'` (was `'planet-dust'`).
- `blockerVocab: []` and the re-fit `waypoints` (already committed on this branch) stay — the path is now the road shape.
- `backgroundImage` filename unchanged; the user overwrites the PNG with the terrain-only version.

### Terrain-only backdrop — generation prompt (map 0)

Delivered to the user (not code). Recorded here for reproducibility:

> **Prompt:** Top-down / high-angle view of a war-torn Martian desert battlefield surface — cracked reddish-tan dirt, scattered impact craters, rocky rubble mounds, ruined fortifications and debris around the edges, a dramatic hazy fiery horizon along the top. Painterly game-art style, high detail, even readable mid-tone lighting across the central play area.
>
> **Negative / must-NOT-contain:** road, path, trail, track, dirt road, walkway, line, river, channel, any continuous lane crossing the scene. Terrain must be unbroken — no routes painted in. Avoid large pure-black or blown-out white regions in the center.
>
> Aspect 4:3, exported to `assets/backgrounds/map_0_outpost_sigma.png` (the engine scales to the canvas).

Until the new PNG is dropped in, the current backdrop remains as fallback (BootScene already 404-tolerant). The road renderer works over either.

## Testing

- **`PathRenderer` (unit, gfx-proxy mock):**
  - `PATH_STYLES` now includes `'planet-road'`.
  - `renderPath(gfx, path, 'planet-road')` issues drawing calls without throwing and uses only whitelisted gfx methods (catches Canvas-API confusion, per existing test pattern).
  - A style with road fields draws strictly more strokes than one without (berm + roadbed + 2 ruts present).
  - Existing four styles' output is unchanged (no road fields → no extra strokes).
  - Normal-offset helper: given a straight horizontal centerline, the `+d`/`−d` offsets are vertically displaced by `d` (deterministic geometry check).
- **`maps.test`:** map 0 `pathRenderStyle` is a supported style (already asserted against `PATH_STYLES`; passes once `planet-road` is added).
- Full suite green.

## Verification (browser, map 0)

- The path reads as a believable worn road (roadbed + soft berms + ruts), not a thin dashed line.
- Road sits under towers/enemies/projectiles (depth 10) — no legibility regression; ruts/berms don't bleed over units.
- Looks coherent over both the current backdrop (interim) and, once supplied, the terrain-only PNG.
- Confirm with a screenshot at the heaviest curvature (ruts should follow the bends cleanly via the normal offset).

## Scope

- **In:** road-layer rendering capability + `planet-road` style + map 0 switched to it + map 0 terrain-only prompt + tests.
- **Out (follow-up):** rolling road styles to maps 1–9 (each needs a per-theme road palette and a terrain-only backdrop), and any per-map tuning beyond map 0.

## Rollout note (future)

Each remaining map gets: a terrain-only backdrop (themed prompt), a `*-road` style entry (or road fields added to its existing style) tuned to the theme (e.g. station = metal walkway, space = lit nav-lane), and `pathRenderStyle` switched over. The capability built here makes that a per-map data exercise.
