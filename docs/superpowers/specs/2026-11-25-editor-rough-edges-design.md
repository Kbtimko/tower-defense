# Map editor rough edges (backlog #88) — design

**Status:** self-approved (`[auto]` item), 2026-11-25.

## Intent

`MapEditorScene` (`?edit=1&map=N`) is the dev tool for placing a map's waypoints and tower slots. The #39c reviews found six older rough edges in it. Each one either shows wrong information or corrupts the map being edited. This change fixes the five that can happen and closes the sixth.

## Goals (one per backlog letter)

- **(a) The slot target is stale.** The HUD compares the slot count against `6 + map.id`. Slot counts have been calibrated per map in `src/data/maps.js` since the difficulty pass, so map 3 reads "12 / 9 MISMATCH" for its shipped board. The target becomes the map's own shipped count, `MAPS[mapId].towerSlots.length`, so the HUD flags a slot that was added or removed against the data.
- **(b) A right-click during a drag.** Today it splices the waypoint being dragged, so the next move writes to a stale or out-of-range index and appends a point. Any pointerdown while a drag is active is ignored.
- **(c) Moving over a HUD rail.** Over a rail Phaser leaves `pointer.camera` undefined and `worldX/Y` stale, so a dragged handle freezes where the cursor left the map. The move handler converts the pointer through the main camera (`this.cameras.main.getWorldPoint(pointer.x, pointer.y)`) and then clamps, so the handle follows the cursor to the map's edge.
- **(d) Pointer-up ignores the button.** Releasing the right button while the left still drags ends the drag. A pointer-up ends the drag only when `pointer.leftButtonReleased()`. A call with no pointer (the lost mouse-up path inside `_onPointerMove`) still ends it.
- **(e) Production reach.** `?edit=1` starts the editor in production builds. The editor's own doc comment says it is dev-only. BootScene opens it only under `import.meta.env.DEV || import.meta.env.MODE === 'capture'`, the same gate as the `?debug=` entry. In production `?edit=1` is ignored and the game boots to the title.
- **(f) The `road_editor@k` texture is never freed on shutdown.** Closed without a code change: nothing stops `MapEditorScene`, which has no `scene.start` or `stop`, so it lives until the page reloads. A shutdown handler for a scene that never shuts down would be dead code.

## Non-goals

- The road preview from #39c, the export format, the corridor band and the hit-test radii are unchanged.
- A middle-button drag start is left as is.

## Approaches

For (c):
1. **Convert through the main camera (chosen).** This is the same conversion Phaser uses inside the viewport, and it keeps working outside it, so clamping pins the handle to the edge.
2. Ignore moves with no camera. Simpler, but the handle sticks short of the edge you dragged toward.

For (e):
1. **Gate the route at boot (chosen).** One condition, matching the existing debug gate.
2. Leave the editor out of the production bundle. Saves bytes, but needs a dynamic import for a dev tool. Not worth it.

## Left to the builder

Test fixture shapes and local names.
