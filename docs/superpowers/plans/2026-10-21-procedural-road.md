# Procedural Road — Implementation Plan (roadmap 1.7)

**Spec:** roadmap task 1.7 in `docs/superpowers/plans/2026-10-21-visual-overhaul-roadmap.md`:
"New `RoadRenderer` replacing the stroked-line styles: textured, edge-feathered road baked once into
a RenderTexture per map from the existing path polyline, with junction/curve caps, a **spawn
portal** and a **base beacon** (animated). Procedural texture per biome (noise + gradient) as the
default; swaps to generated tiles in 4.5. Old `PathRenderer` stays behind a flag until all maps
pass. *Accept:* road reads as part of the terrain on all 10 maps; pad/road overlap checks pass."
Art direction: `docs/art-bible.md` (§1 light from upper-left; §2 biome moods table; §3 outline).

**Today:** `src/systems/PathRenderer.js` `renderPath(gfx, waypoints, style)` strokes berm / roadbed /
ruts / dashes into GameScene's `_staticLayers` Graphics (depth 10), repainted on every tower
placement (`_repaintStaticLayers`). Each map's `pathRenderStyle` (src/data/maps.js) is one of
`planet-road` (maps 0, 5), `lunar-road` (1, 2), `station-road` (3, 6), `space-lane` (4, 7),
`organic-road` (8), `scorched-road` (9); `PATH_STYLES` also lists four older styles
(`planet-dust`, `station-strip`, `space-nav`, `organic-glow`) no map uses. Static text labels
"IN"/"OUT" sit at the path ends (GameScene.create). Measured today: the closest tower-slot centre
to any road centreline is 25.5 px (maps 4 and 8); the legacy roadbed is 26 px wide.

## Global Constraints (bind every task)

1. **Visual only.** Enemy movement, path geometry, waypoints, tower slots and every gameplay value
   are untouched. The road is drawn from the existing waypoints with the existing
   `src/systems/pathGeometry.js` helpers (`samplePath`, `offsetPolyline`, …).
2. **Baked once per map.** The road is painted once into a texture (a Phaser `CanvasTexture` is the
   chosen form of "RenderTexture": canvas 2D gives round joins/caps, dashes and pattern fills for
   free), keyed per map, reused if it already exists, and drawn as one Image. It is NOT repainted
   on tower placement. Depth 8: above the backdrop (0), area effects (2) and ambient layer (5),
   below the static blockers/pads layer (10).
3. **Pads stay clear of the road.** Each style's solid half-width ≤ 13 px (the legacy roadbed half),
   and a test over the REAL map data asserts every tower-slot centre is at least
   `solidHalfWidth + ROAD_PAD_GAP` (10 px) from the sampled road centreline. Feathered edges may
   extend further (pads draw on top at depth 10).
4. **Tunables in `src/data/roads.js`** (colours, widths, feather, noise scale/contrast, lane
   markings, portal/beacon look). No magic numbers in renderer logic.
5. **Deterministic.** Noise is seeded (use the map's existing `blockerSeed` or id) so a map's road
   looks the same every load and in every capture.
6. **iOS Safari-safe canvas 2D only:** no `ctx.filter` (blur) — feather with layered strokes /
   gradients instead.
7. **Flag:** the legacy `PathRenderer` remains and is selectable per map; default is procedural.
8. **No per-frame allocation** in the portal/beacon animation (transforms on objects created once).
9. **Phaser 3.90** — verify APIs in `node_modules/phaser/src`. Tests: Vitest + jsdom, Phaser mocked,
   jsdom has no real canvas 2D — test pure helpers for real and the painter against a recording
   stub context. Derive allow-lists from source data (`MAPS`, `PATH_STYLES`).
10. Vanilla JS ES modules; match surrounding style; comments explain *why*.

---

### Task 1: Road data and pure helpers

**Files:** create `src/data/roads.js`, `src/systems/roadMath.js`, `src/systems/roadMath.test.js`.

- `ROAD_STYLES` keyed by every key in `PATH_STYLES` (the four unused legacy keys may alias a family):
  each `{ kind: 'road' | 'lane', halfWidth, feather, base, edge, noise: { scale, contrast, colors:
  [dark, light] }, wear (centre lightening, 0..1), lane?: { color, alpha, width, dash, gap } }`.
  Families and look (art bible biome moods): planet-road = packed red-orange earth; lunar-road =
  grey regolith; station-road = steel deck plates with cyan lane dashes; space-lane = `kind:
  'lane'`, a soft glowing nav corridor (no solid bed, faint glow + bright dashes); organic-road =
  dark veined flesh with teal glow edge; scorched-road = cooled basalt with faint ember cracks.
  `halfWidth` ≤ 13 for every style (constraint 3).
- `ROAD_PAD_GAP = 10`; `ROAD_DEPTH = 8`.
- `ENDPOINT_FX`: `portal` (spawn) and `beacon` (base) per family — colours (Veth emissive feel for
  the portal: violet/green; human amber `0xffb000` for the beacon), sizes, spin / pulse speeds.
- `roadMath.js` (pure): `makeNoise(seed)` → `(x, y) => value in [0,1]` (seeded value noise with
  smooth interpolation; deterministic); `noiseTile(seed, size, style)` → `Uint8ClampedArray` RGBA
  for a tileable pattern (mix `noise.colors` by noise value and contrast); `featherSteps(halfWidth,
  feather, steps)` → list of `{ width, alpha }` strokes from outermost to innermost producing a soft
  edge (alphas small, widths decreasing to `2*halfWidth`); `roadClearance(waypoints, slots)` →
  minimum distance from any slot centre `{cx, cy}` to the sampled curve (use `samplePath`).
- Tests: every `PATH_STYLES` key has a style; halfWidth ≤ 13; **for every map in MAPS:
  `roadClearance(map waypoints scaled like PathManager does, its slots) ≥ style.halfWidth +
  ROAD_PAD_GAP`** (build via `new PathManager(map.waypoints, map.towerSlots, 1280, 720)` and its
  `waypoints` / `buildZones`); `makeNoise` deterministic per seed and different across seeds, values
  in [0,1]; `noiseTile` length = size²·4, alpha 255, deterministic; `featherSteps` monotonic.

### Task 2: RoadRenderer — bake the road texture

**Files:** create `src/systems/RoadRenderer.js` + `src/systems/RoadRenderer.test.js`.

- `paintRoad(ctx, { curve, style, tile })` — pure painter over a 2D context (testable with a
  recording stub): round `lineJoin`/`lineCap` (curve caps + joins), the feather strokes from
  `featherSteps`, the textured bed (stroke with a `createPattern` of the noise tile canvas, or fill
  the bed then composite the pattern with `source-atop`), darker edge band, lighter centre wear,
  optional lane dashes (`setLineDash`), and for `kind: 'lane'` a glow corridor instead of a bed.
  Light from the upper-left: offset the edge-darkening stroke by (+1, +1.5) px so the lower-right
  edge reads as shadow.
- `bakeRoad(scene, { key, waypoints, styleKey, seed, width, height })` → texture key: return early
  if `scene.textures.exists(key)`; otherwise `createCanvas(key, width, height)`, build the noise
  tile on a small offscreen canvas (`document.createElement('canvas')` + `putImageData`), sample
  the curve with `samplePath`, call `paintRoad`, `refresh()`.
- Tests: `paintRoad` against a stub ctx — round joins/caps set; feather strokes drawn outermost
  first with the computed widths; bed width = 2·halfWidth; lane dashes only for styles with
  `lane`; `kind: 'lane'` draws no bed. `bakeRoad` reuses an existing key (no second createCanvas).

### Task 3: Spawn portal and base beacon

**Files:** create `src/systems/PathEndpoints.js` + test.

- `class PathEndpoints { constructor(scene, { start, end, family }) ; update(dtSeconds) ; destroy() }`.
  Built ONCE from the `fx-ring` / `fx-glow` textures (src/systems/fxTextures.js) as a few Images
  each (portal: two counter-rotating rings + a pulsing inner glow, Veth colours; beacon: a pulsing
  amber glow + a slow ring), at depth 9 (above the road, below pads), tinted from `ENDPOINT_FX`.
  `update` advances rotation/scale/alpha in place (no allocation). Position the portal at the
  first path point and the beacon at the last, pulled inside the canvas if the end point lies on
  the edge (use the existing `clampToBounds` idea) so neither is half off-screen.
- Tests with a stub scene: images created once; update changes rotation/alpha deterministically
  for a given dt; destroy destroys all; positions clamped inside the canvas.

### Task 4: GameScene integration behind the flag

**Files:** `src/scenes/GameScene.js`, `src/data/roads.js` (flag), tests.

- Flag: `ROAD_RENDERER = 'procedural'` default in `src/data/roads.js`, overridable per map by an
  optional `roadRenderer: 'legacy' | 'procedural'` on a map entry (no map sets it today).
- `create()`: when procedural, `bakeRoad(...)` with key `road_map_<id>` and add the Image at
  `ROAD_DEPTH`; create `PathEndpoints` (and drop the "IN"/"OUT" text labels for procedural maps);
  `_renderStaticLayers` skips `renderPath` for procedural maps (blockers and platforms unchanged).
  When legacy, behaviour is exactly today's.
- `update()`: `this._endpoints?.update(dt)` (real or sim dt — either; say which).
- `shutdown()`: destroy the endpoints and the road Image (keep the texture for reuse on replay —
  baked once per map per session).
- Tests: flag resolution (default procedural; per-map legacy override); procedural create bakes once
  and adds the image at ROAD_DEPTH; legacy path still calls `renderPath`; replaying the level does
  not re-bake; shutdown destroys endpoints.
