# Map editor previews the real road (backlog #39c) — design

**Status:** self-approved (`[auto]` item), 2026-11-25.

## Intent

`MapEditorScene` (the dev tool at `?edit=1&map=N`) draws the road with the legacy Graphics `renderPath`. Since roadmap 1.7, every map in the game draws a baked, textured road (`bakeRoad` in `src/systems/RoadRenderer.js`, at `ROAD_DEPTH`). So the editor shows a road that doesn't match the game: its width, edges and texture all differ. That makes the editor misleading for the one thing it is for, which is placing waypoints and slots against the road.

## Goals

- For a map whose `roadRendererFor(map)` is `'procedural'`, the editor shows the same baked road the game shows: same `styleKey` (`map.pathRenderStyle`), `seed` (`map.blockerSeed`), world size, and render scale `k`.
- While a **waypoint** is being dragged, the editor shows a cheap live preview (the legacy `renderPath` line), and hides the baked road, which is stale. The road is re-baked once, when the drag ends.
- Inserting or deleting a waypoint re-bakes immediately (a single event, not a stream).
- Dragging a **slot** never re-bakes: the road didn't change.
- A map with `roadRenderer: 'legacy'` keeps today's `renderPath` look.

## Non-goals

- The 80 px red no-build corridor band, the handles, labels, HUD and export are unchanged.
- No change to `bakeRoad`, `GameScene` or any map data.

## Anti-goals

- Never bake on every `pointermove`. A full 1280×720 (×k) canvas paint per move would make dragging stutter.
- Never leave a stale baked road visible after the waypoints changed.

## Approaches

1. **Bake when the edit settles, live line while dragging (chosen).** The editor matches the game whenever nothing is moving, and drags stay smooth.
2. **Bake on every move.** It matches the game at all times, but each move costs a full-canvas paint. Rejected by the anti-goal.
3. **Keep the legacy look and widen it to the road's width.** Cheap, but it still isn't the game's road. Rejected.

## Design

- The road texture key is `road_editor@${k}`, baked at `resolution: k` with the waypoints in world px (as `GameScene._setupRoad` does). `bakeRoad` reuses an existing key, so a re-bake first calls `this.textures.remove(key)`.
- A single road image at `ROAD_DEPTH`, created on the first bake and re-pointed with `setTexture(key)` after each re-bake. It is hidden during a waypoint drag and shown otherwise.
- A `_roadDirty` flag starts `true`. It is set by a waypoint drag move, a waypoint insert and a waypoint delete. `_render()` bakes only when the map is procedural, no waypoint drag is in progress, and `_roadDirty` is set. It then clears the flag.
- The `pointerup` handler moves into a `_onPointerUp()` method so it can be tested. When the drag that ended was a waypoint drag, it calls `_render()`.

## Left to the builder

Local helper names. The live line's style stays as `renderPath` draws it.
