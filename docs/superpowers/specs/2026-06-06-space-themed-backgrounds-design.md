# Space-Themed Backgrounds + Restricted Tower Placement — Design Spec

**Date:** 2026-06-06
**Backlog item:** "Space-themed backgrounds per level" (notes.md prior-backlog #5)
**Status:** Approved (brainstorm phase complete; ready for implementation plan)

---

## 1. Goal

Replace each map's flat-color background (`map.background = 0x1a2e1a` etc.) with a Kingdom Rush-style scene: an AI-generated painted bitmap backdrop plus a procedural overlay (curved path, thematic blockers at every bend, hand-placed tower build platforms). Restrict tower placement to designated platforms. Apply across all 10 maps.

The visual transformation should make each map feel like a *place*, not a colored rectangle — the player should immediately know they're on a cratered moon, in a derelict ship, or in a bioluminescent alien jungle.

## 2. Scope decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Hybrid** — AI-generated bitmap backdrop per map + procedural overlay (path, blockers, platforms) | Bitmaps buy painted depth; procedural overlay keeps interactivity (hover/select/range) and lets us tweak gameplay state without re-generating art. |
| 2 | **Curved bezier path** through existing `waypoints` data | Renders Kingdom Rush-style organic curves with zero gameplay change — pathfinding still uses straight segments under the hood. |
| 3 | **Thematic blockers at every path bend** (procedural) | Justifies why the path turns where it does — diegetic, not arbitrary. |
| 4 | **Restricted tower placement** — only on `towerSlots`, snap-to-nearest | Matches Kingdom Rush. Forces strategic positioning. |
| 5 | Slot count: **`6 + map.id`** | Inherits the existing difficulty curve (waves and max tier already scale with `id`). 6 on Outpost Sigma → 15 on Last Light. |
| 6 | **No tower-type restrictions per slot** | Any tower on any slot. Keeps gameplay simple. |
| 7 | **Static backgrounds in v1** (no animation) | Ship the visual transformation; animation deferred to backlog #7. |

## 3. Visual identity (per map)

Distinct palette and blockers per map; story arc reads through palette progression: warm/familiar (0-2) → industrial (3-5) → cold/alone (6-7) → hostile/alien (8-9).

| ID | Name | Palette | Blockers vocabulary |
|---|---|---|---|
| 0 | Outpost Sigma | Scorched-Earth ochre/brown/orange dust | blast craters, sandbag berms, fuel drums |
| 1 | Lunar Gate | Grey moon + Earth on horizon + purple sky | crater rims, rock formations |
| 2 | The Crater | Deep crater interior, shadow + Earthlight rim | crater walls, fallen boulders, ice patches |
| 3 | Orbital Station | Metal-grate deck, glowing blue conduit | bulkheads, sealed doors, machinery banks |
| 4 | Asteroid Belt | Open void with floating rocks + mining beacons | asteroids, drill rigs, anchored shuttles |
| 5 | Titan's Reach | Orange methane haze, Saturn in sky | methane lakes, ice ridges, broken landers |
| 6 | Deep Space Corridor | Derelict ship interior, cold blue-grey, hull breach | collapsed bulkheads, sparking conduits, hull breach |
| 7 | The Void Frontier | Pure deep space, purple/blue nebula, isolated | drifting debris, dead satellites, frozen wrecks |
| 8 | Enemy Homeworld | Bioluminescent teal/magenta jungle | alien flora, glowing pools, organic spires |
| 9 | Last Light | Burning alien fortress, red/orange dramatic | fallen pillars, fire pits, alien wreckage |

## 4. Rendering pipeline

Top-to-bottom Phaser depth order:

| Depth | Layer | Source |
|---|---|---|
| 100+ | HUD / inspect overlays | existing |
| 50-99 | Towers / enemies / projectiles / particles | existing |
| 20 | **Path** (curved bezier through waypoints, theme-styled) | new — procedural |
| 15 | **Tower build platforms** (theme-styled discs) | new — procedural, from `towerSlots` |
| 10 | **Thematic blockers** at path bends | new — procedural, placed deterministically per `blockerSeed` |
| 0 | **Bitmap backdrop** (800×600 PNG) | new — loaded by `BootScene` |
| -1 | Solid-color fallback (`map.background`) | existing — used if PNG fails to load (dev / offline) |

### 4.1 Path rendering

Curved through existing waypoints using `Phaser.Curves.Path` + quadratic interpolation between successive waypoints (Catmull-Rom or "Q from-to" bezier — implementation choice). Rendered as three stacked strokes:

1. **Halo / soft underlay** (~22px, low opacity) — sells the worn/weathered look
2. **Main stroke** (~12-14px) — theme-tinted (dust brown for planets, dim blue for stations, sparse dashed line for space)
3. **Footprint dashes** (~2px, dashed, low opacity) — adds tactile detail

Four `pathRenderStyle` styles, each with its own three-stroke palette:

| `pathRenderStyle` | Used by maps | Look |
|---|---|---|
| `planet-dust` | 0, 1, 2, 5, 9 | warm packed-dust trail with footprints |
| `station-strip` | 3, 6 | dim guidance light strip down a metal corridor |
| `space-nav` | 4, 7 | thin dashed nav route (no halo); waypoint markers visible |
| `organic-glow` | 8 | bioluminescent glowing trail (theme tint per map) |

### 4.2 Tower platforms

Drawn per-frame at each `towerSlots[i]` position. Theme-styled disc with hover/locked/selected states (same UX shell as today's tower-placement preview).

| Platform style | Used by maps |
|---|---|
| Rocky outcrop | 0, 1, 2, 5 |
| Metal grille pad | 3, 6 |
| Floating debris pad | 4, 7 |
| Glowing organic disc | 8 |
| Scorched stone pad | 9 |

A small `+` glyph (theme-tinted) marks empty slots, mirroring Kingdom Rush. Occupied slots show the tower as today.

### 4.3 Blockers

Placed deterministically at every interior waypoint (path bend) using `blockerSeed` for repeatability. For each bend, the algorithm:

1. Computes the "outside" of the bend (the side away from the path's continuation).
2. Picks a blocker type from `blockerVocab` using seeded RNG.
3. Renders it via a per-type procedural draw function (crater, rocks, machinery, asteroid, etc.).

Blocker types share a small vocabulary across themes (a `crater` looks the same on Maps 0/1/2, just tinted differently). Each map's `blockerVocab` lists the 2-3 types it draws from.

## 5. Data shape changes — `src/data/maps.js`

Each map entry gains four new fields:

```js
{
  // existing fields preserved unchanged ...
  background: 0x1a2e1a,                        // KEPT as fallback color

  // NEW
  backgroundImage: 'map_1_lunar_gate.png',     // path under assets/backgrounds/
  pathRenderStyle: 'planet-dust',              // one of 4 styles (§4.1)
  blockerVocab: ['crater', 'rocks'],           // pool for procedural blocker placement
  blockerSeed: 4291,                           // deterministic — same seed = same placements
  towerSlots: [                                // hand-placed, length === 6 + id
    [0.18, 0.35], [0.32, 0.62], ...
  ],
}
```

**`maps.test.js` additions** — every map must have:
- `backgroundImage` (non-empty string)
- `pathRenderStyle` in `['planet-dust', 'station-strip', 'space-nav', 'organic-glow']`
- `blockerVocab` (array, length ≥ 1, all strings)
- `blockerSeed` (number)
- `towerSlots` (array, length `=== 6 + id`, each entry `[x, y]` with `0 ≤ x,y ≤ 1`)

## 6. Gameplay rule change — restricted placement

### 6.1 `TowerPlacementManager` updates

- New method `getNearestSlot(worldX, worldY, snapPx = 24)` — returns `{slotIndex, x, y}` or `null` if no free slot within snap range.
- `canPlace(type, worldX, worldY)` now requires: (a) a snap-eligible free slot, (b) tower not already there, (c) tier/cost rules (unchanged).
- `place(type, worldX, worldY)` snaps to the resolved slot before placing; emits same events as today.
- Hover preview shows the nearest valid slot's position + range circle (instead of the mouse position).

### 6.2 Barracks reposition

`Barracks.reposition()` snaps to the nearest **free** slot. If the player drags a barracks toward an occupied slot, hover state shows it's invalid (same red-tint UX as a failed tower placement today).

### 6.3 No save/migration needed

Towers don't persist between matches. Slot positions are static map data, not player state. Existing `lastlight_save` envelope is untouched. SaveManager version does not bump.

## 7. Asset pipeline

### 7.1 File layout

```
assets/
  backgrounds/
    PROMPTS.md              # all 10 prompts, committed for reproducibility
    map_0_outpost_sigma.png
    map_1_lunar_gate.png
    map_2_the_crater.png
    map_3_orbital_station.png
    map_4_asteroid_belt.png
    map_5_titans_reach.png
    map_6_deep_space_corridor.png
    map_7_the_void_frontier.png
    map_8_enemy_homeworld.png
    map_9_last_light.png
```

### 7.2 Generation

- **Tool:** Midjourney (v6+). Other tools (DALL-E 3, SDXL) acceptable if Midjourney unavailable — style prefix is portable.
- **Resolution:** generate at native MJ output, downscale to 800×600 (canvas size). Crop center-weighted to 4:3 if MJ output is square.
- **Optimization:** run through `pngquant --quality=70-85` before committing. Target ~200-400 KB per file. **Total bundle add: ~3 MB.**
- **Loading:** `BootScene` preloads all 10 PNGs (`this.load.image('bg_map_0', 'assets/backgrounds/map_0_outpost_sigma.png')`). Each is loaded once per session.

### 7.3 Locked style prefix

Every prompt opens with this prefix (commits to a single visual language across all 10 maps):

> `Top-down view, painted concept art for a tower defense game, Kingdom Rush style, layered atmospheric depth, dramatic lighting, vibrant illustrated palette, high detail, no characters, no text, no UI, empty terrain ready for path overlay`

Every prompt closes with these parameters:

> `--ar 4:3 --style raw --no text characters figures vehicles towers buildings platforms structures fences walls railings`

The `--no` block prevents the AI from drawing things our procedural overlay handles (path, platforms, tower props).

### 7.4 Per-map prompts

These are the 10 prompts committed to `assets/backgrounds/PROMPTS.md`. The `{STYLE}` and `{PARAMS}` tokens stand in for §7.3 above.

**Map 0 — Outpost Sigma**
> `{STYLE}, scorched Earth military base battlefield at twilight, blast craters in dirt, sandbag berms, scattered fuel drums, war-torn ground, distant ruined city silhouette on the horizon, fallen scaffolding, dust haze, military green and ochre and burnt-orange palette, end-of-the-world atmosphere {PARAMS}`

**Map 1 — Lunar Gate**
> `{STYLE}, cratered grey lunar surface, planet Earth glowing blue and white on the horizon, dark purple starry sky, weathered crater rims, scattered rocks, deep crisp shadows, NASA photography feel, calm and vast sci-fi atmosphere {PARAMS}`

**Map 2 — The Crater**
> `{STYLE}, interior view from inside a giant deep lunar crater, towering crater walls on three sides, deep shadow pooling on the floor, golden Earthlight catching the upper rim, dust on the floor, scattered boulders, dim ice patches, claustrophobic and grand {PARAMS}`

**Map 3 — Orbital Station**
> `{STYLE}, top-down view of an orbital wheel space station interior deck, polished metal corridors with diamond-plate floor, glowing blue conduit strips along the walls, bulkhead doors flanking the corridor, status panel lights, viewports showing distant stars at the edges, clean industrial sci-fi, operational and pristine {PARAMS}`

**Map 4 — Asteroid Belt**
> `{STYLE}, asteroid mining field in deep space, large rocky asteroids floating with shadowed and sunlit sides, industrial mining beacons and amber warning lights, anchored cargo shuttles, scattered drill rigs, dark space background with sparse stars, blackwork and amber palette {PARAMS}`

**Map 5 — Titan's Reach**
> `{STYLE}, surface of Saturn's moon Titan, thick orange-amber methane haze atmosphere, dark methane lakes reflecting the sky, ice ridges and frozen rocks, Saturn looming huge in the orange sky with visible rings, sepia and amber tones, alien and mysterious and melancholy {PARAMS}`

**Map 6 — Deep Space Corridor**
> `{STYLE}, interior of a derelict abandoned alien capital ship, top-down view of damaged corridors, collapsed bulkheads, sparking exposed conduits, hull breach in one corner showing the void of space with stars, cold blue-grey palette, dangerous and lifeless, scattered debris {PARAMS}`

**Map 7 — The Void Frontier**
> `{STYLE}, empty deep space scene, purple and deep blue nebula clouds drifting, dense star field with bright and dim stars, drifting space debris and dead satellites, frozen wreckage of old ships, sense of isolation and vast distance, cosmic horror atmosphere, deep midnight palette {PARAMS}`

**Map 8 — Enemy Homeworld**
> `{STYLE}, alien bioluminescent jungle planet surface, glowing teal and magenta plants and glowing pools, organic alien spires twisted upward, twisted alien flora, low fog rising from glowing pools, dark purple sky with two moons, mysterious and hostile alien biology, Pandora aesthetic {PARAMS}`

**Map 9 — Last Light**
> `{STYLE}, final apocalyptic battlefield, burning alien fortress courtyard at night, dramatic red and orange firelight, fallen broken pillars, fire pits, alien wreckage and debris, smoke rising into a dark sky, distant explosions on the horizon, epic finale lighting, deeply dramatic, blood-red and ember-orange palette {PARAMS}`

### 7.5 Iteration workflow

For each map: generate 4-8 variants → pick best → crop/downscale → `pngquant` → commit. If consistency drifts (e.g., Map 4 comes out looking like Map 7), regenerate with stronger theme keywords. **Estimated time: ~30 min per map = ~5h all-in for 10 maps.**

## 8. Tests to add

| Test | What it covers |
|---|---|
| `maps.test.js` — schema additions | Every map has `backgroundImage`, `pathRenderStyle`, `blockerVocab`, `blockerSeed`, `towerSlots` with correct shape and length `=== 6 + id` |
| `BootScene` smoke test | All 10 background PNGs are listed in the preload manifest (mock `this.load.image` and assert calls) |
| `TowerPlacementManager` — slot snapping | `getNearestSlot` returns nearest free slot within snap range; returns `null` otherwise |
| `TowerPlacementManager` — slot rejection | `canPlace` returns `false` when no eligible slot in range |
| `TowerPlacementManager` — occupied slot | `canPlace` returns `false` when the snapped slot already has a tower |
| `Barracks.reposition` — slot snap + free check | Reposition snaps to nearest free slot; rejects occupied |
| Path render unit test | `_renderPath(map)` calls the expected stroke sequence per `pathRenderStyle` |
| Blocker placement determinism | Same `blockerSeed` → same blocker placements across runs |

## 9. Out of scope

- **Animated background layer** (drifting dust, sparking conduits, blinking lights) → backlog #7
- **Per-platform tower-type restrictions** (e.g., snipers only on high ground)
- **Map-progression overworld UI** → backlog #6
- **Re-skinning enemies / towers / hero** (already done in prior phases)
- **Tutorial / onboarding** for the new placement rule (a simple in-HUD hint is fine)

## 10. Risks

| Risk | Mitigation |
|---|---|
| AI-generated assets drift in style across the 10 maps | Locked style prefix in §7.3; iterate by re-generating outliers, not by re-tuning the prefix mid-batch |
| Bundle bloat exceeds budget | `pngquant` at quality 70-85; if any map exceeds 500 KB after compression, re-generate at lower MJ stylize value |
| Bitmap fails to load in production (CDN, offline, asset missing) | Solid-color fallback via existing `map.background` (already coded; behavior unchanged) |
| Restricted placement makes some old strategies impossible | Slot count `6 + id` is generous; hand-tune outliers if specific map plays poorly after first playthrough |
| AI-art licensing for commercial use | Midjourney commercial terms confirmed before generation; alternative tools (DALL-E 3, SDXL Hugging Face) noted as portable fallback |

## 11. Estimated effort

- AI prompt iteration + asset generation (your time, outside Claude): **~3-5h**
- Spec + plan refinement: **~2h**
- Implementation (data, render layers, placement code, tests): **~6-8h**
- **Total: ~12-15h dev + ~3-5h art generation**
