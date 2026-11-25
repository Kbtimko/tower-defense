# Backlog #39(b): ground effects drawn under the road

**Date:** 2026-11-24 · **Branch:** `fix/39-ground-fx-depth` off `origin/visual/integration` (90c61d8)
**Tag:** `[auto]`. Spec and plan self-approved under the global `[auto]` rule.
**Raised by:** the roadmap 1.7 final review (2026-10-22).

## Intent

Roadmap 1.7 made the road an opaque baked texture at `ROAD_DEPTH` (8). Three hero-ability visuals were left below it, so the road cuts a road-shaped gap through each one exactly where enemies walk, which is where the player aims them:

| Effect | Where | Depth today |
|---|---|---|
| Pyro fire field (and any `AreaEffectsManager` effect, e.g. Immolate's ring) | `AreaEffectsManager.add` | 2 |
| Pyro flame-wave cone | `GameScene._handleFlameWave` | 5 |
| Volley lines | `GameScene._handleVolley` | 5 |

The backlog named only the fire field. The other two have the same defect and the same fix, so they are in scope.

## Goal

All three draw above the road. They take one shared constant, `GROUND_FX_DEPTH`, in `src/data/roads.js` (tunables live in `src/data/`). Its value is **8.75**:
- above the road (8) and the near ambient layer (8.5);
- below the path endpoints (`ENDPOINT_LOOK.depth`, 9) and the static pad/blocker layer (10).

They stay ground effects, under the pads and the unit band (11+), the same as today.

## Non-goals and rulings

- **#39(a), evicting old road textures: already done** (`evictOtherRoads` in `GameScene._setupRoad`, tested in `GameScene.road.test.js`). Close it.
- **#39(c), the map editor's legacy road preview: stays on the backlog.** The editor re-renders on every pointer move, and baking a canvas road per move needs its own design (bake on pointer-up?). It is a dev-only tool.
- **#39(d), optional per-style `featherAlpha`: stays on the backlog.** It is optional, with no visual ask behind it.
- No change to what the effects draw, their timing or their damage.

## Verification

- A test pins `ROAD_DEPTH < 8.5 (ambient near) < GROUND_FX_DEPTH < ENDPOINT_LOOK.depth < 10`.
- Tests pin that each of the three effects sets `GROUND_FX_DEPTH`. Each test fails on the old literal.
- Live: a frozen frame with a fire field cast on the road shows the fire continuous across the road bed, with a before/after screenshot.
