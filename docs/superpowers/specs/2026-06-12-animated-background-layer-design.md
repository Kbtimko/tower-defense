# Animated Background Layer (per map) — Design Spec

**Date:** 2026-06-12
**Backlog item:** #6 — Animated background layer (per map)
**Follow-up to:** PR #26 (AI-painted bitmap backdrops), PR #27 (natural-fit paths + slots)
**Sister specs:** `2026-06-06-space-themed-backgrounds-design.md`, `2026-06-12-natural-fit-paths-slots-design.md`

## Problem

Every map backdrop is a static PNG (`assets/backgrounds/map_<N>_<slug>.png`, depth 0)
composited under a procedural overlay (static layers at depth 10). The scene never
moves. We want **one subtle motion layer per theme** to make each map feel alive
without distracting from gameplay or hurting performance.

## Goals

- One reusable, theme-keyed, deterministic animated layer system — no new art assets.
- Five fx families covering the 10 maps; assign every map a family.
- Motion reads as ambient environment; never competes with enemies / towers / path / projectiles.
- Strict performance ceiling on a Phaser canvas game; measure before/after.
- Respect a user motion toggle and OS `prefers-reduced-motion`.

## Non-goals

- No new art assets — everything drawn procedurally with `Graphics` primitives.
- No `?edit=1` map-editor integration — per-map review happens live in-game.
- No gameplay interaction — purely cosmetic backdrop.
- MapSelect / menu scenes unchanged — this is GameScene-only.

## Architecture

Mirrors the existing seeded-renderer pattern (`BlockerPlacement` + `SeededRandom`,
`PathRenderer`). Two new modules:

### `src/systems/ambientFxFamilies.js` — pure, Phaser-free

A registry (`FX_FAMILIES`) keyed by family name. Each family is a small, isolated
unit exposing three pure functions:

- `init(rng, width, height) → state` — seeds the element array deterministically
  using the existing `SeededRandom` instance. Returns a plain state object
  (arrays of element records: position, phase, size, alpha, etc.).
- `step(state, dtMs) → void` — advances motion in place (drift, twinkle, pulse,
  wrap/respawn). Pure w.r.t. external state; mutates only the passed `state`.
- `draw(gfx, state) → void` — issues `Graphics` calls only (`fillStyle` +
  `fillCircle`, `lineStyle` + `lineBetween`). No Phaser scene access; testable
  against a mock gfx using the established gfx-proxy mock pattern.

Each family owns its palette and element-count constants. Element counts are fixed
and well under the per-map cap (see Performance).

### `src/systems/AmbientBackgroundLayer.js` — Phaser glue

A class owning the lifecycle:

- Constructs one `Graphics` object at **depth 5** (between bitmap depth 0 and the
  static layers depth 10), so motion reads as deep environment and never overlaps
  enemies/towers/path.
- Looks up the family from `map.ambientFx.family`; builds a `SeededRandom` from
  `map.ambientFx.seed`; calls `init` once.
- Each frame (`update(dtMs)`): if motion enabled → `step` → `gfx.clear()` → `draw`.
  If disabled → ensures gfx is cleared and skips step/draw.
- Reads the enabled flag from the registry each frame (cheap boolean read).
- Destroys its gfx on scene shutdown.

**Module decomposition choice (A):** registry-of-pure-functions over a monolithic
`switch` class or one-class-per-family. Rationale: each family stays a small unit
testable without Phaser; all lifecycle/glue lives in one place.

## The five fx families

All deterministic from a seed, drawn with `Graphics` primitives, palettes matched to
each theme's existing path style. `ADD` blend only where glow is needed.

| Family | Maps | Look | Primitives (approx) |
|---|---|---|---|
| `dust` | 0 Outpost Sigma, 1 Lunar Gate, 2 The Crater, 5 Titan's Reach | Slow warm motes drifting on a shared "wind" vector + slight sinusoidal sway; wrap at edges | ~40 faint filled circles (r 1–2, α 0.08–0.18, warm `0x9a8c70`) |
| `electrical` | 3 Orbital Station, 6 Deep Space Corridor | Blinking station lights (alpha oscillates on a per-node phase) + occasional brief spark arcs along seeded conduit segments | ~20 additive glow dots + a few flashing line segments, cool `0x3a8ad0` |
| `stars` | 4 Asteroid Belt, 7 The Void Frontier | Two parallax layers drifting one direction + subtle twinkle; far = tiny/dim/slow, near = brighter/faster | ~60 far + ~25 near points, white / blue-white |
| `bio-pulse` | 8 Enemy Homeworld | Large soft radial blobs "breathing" — radius + alpha oscillate slowly out of phase; faint drift | ~6–8 big low-α filled circles, teal `0x00ffc8` / `0x4affd0` |
| `embers` | 9 Last Light | Warm embers rising with horizontal sway, fading as they climb, respawning at the bottom | ~35 additive dots, orange `0xff8844` / `0xffaa44` |

## Data shape (`src/data/maps.js`)

One new field per map, mirroring `blockerVocab` / `blockerSeed`:

```js
ambientFx: { family: 'dust', seed: 7341 },
```

- `family` keys into `FX_FAMILIES`.
- `seed` is explicit (like `blockerSeed`) so the look is reproducible and tunable.
- Optional `density` / `tint` per-map overrides are reserved for later tuning but
  not required in v1.

Map→family assignment:

| Map | Name | pathRenderStyle | ambientFx.family |
|---|---|---|---|
| 0 | Outpost Sigma | planet-dust | dust |
| 1 | Lunar Gate | planet-dust | dust |
| 2 | The Crater | planet-dust | dust |
| 3 | Orbital Station | station-strip | electrical |
| 4 | Asteroid Belt | space-nav | stars |
| 5 | Titan's Reach | planet-dust | dust |
| 6 | Deep Space Corridor | station-strip | electrical |
| 7 | The Void Frontier | space-nav | stars |
| 8 | Enemy Homeworld | organic-glow | bio-pulse |
| 9 | Last Light | planet-dust | embers |

Note map 9 uses path style `planet-dust` but fx family `embers` — proof the fx must
be its **own field**, not derived from `pathRenderStyle`.

## GameScene wiring

In `create()`, after the bitmap backdrop and static layers are built:

```js
if (map.ambientFx) {
  this._ambient = new AmbientBackgroundLayer(this, map.ambientFx);
}
```

In `update(time, delta)`, alongside the other per-frame system updates:

```js
this._ambient?.update(dtMs);
```

On scene shutdown, destroy the layer. Motion freezes naturally on pause (the update
loop early-returns when paused) — acceptable and free.

## Performance budget

Per-frame redraw of one `Graphics` object — same mechanism as the existing depth-30
hover gfx.

- Hard ceiling: **`MAX_ELEMENTS = 90` per map** (heaviest is `stars` at ~85).
- ≤ 90 `fillCircle` / `lineBetween` calls per frame — negligible draw cost.
- `ADD` blend only where glow is required (electrical, embers, stars-near).
- **Verification:** measure frame time on map 4 / 7 (`stars`, the heaviest family)
  before vs after; target **< 1ms added per frame** at 60fps and no visible jank on
  the weakest map.

## Settings & reduced-motion

- New **"Ambient motion"** checkbox in `SettingsOverlay`, default **ON**, persisted
  via `SaveManager` (same path as audio settings), exposed as a registry flag the
  layer reads each frame.
- First-load default seeds from
  `window.matchMedia('(prefers-reduced-motion: reduce)').matches`: if the OS asks for
  reduced motion and the user has no saved preference, default the toggle **OFF**.
- When off: the layer skips `step` / `draw` and clears its gfx (static bitmap alone).
  Toggling is live — no reload.

## Testing

- **Pure families** (jsdom, no Phaser):
  - Same seed → identical initial state.
  - `step` advances deterministically (fixed dt → fixed delta).
  - Element count ≤ `MAX_ELEMENTS`.
  - Wrap / respawn keeps elements on-screen.
  - `draw` issues the expected calls against a mock gfx (gfx-proxy mock pattern).
- **`AmbientBackgroundLayer`** (Phaser `vi.mock` — jsdom canvas crash otherwise):
  - No draws when disabled.
  - Clears + destroys gfx on shutdown.
  - Reads the registry enabled flag.
- **Boot / settings:**
  - `prefers-reduced-motion` seeds the default-off case when no saved pref.
  - Toggling the setting flips rendering live.

## Scope

- **In:** the system + all 5 families + `ambientFx` on all 10 maps + settings toggle.
- **Out:** new art assets; `?edit=1` editor integration; gameplay interaction;
  MapSelect / menu changes.
- Per-map "looks right" review: live game, one map at a time; tweaks are cheap data
  edits to `seed` / element counts afterward.

## Estimated effort

~4h all-in (per backlog estimate).
