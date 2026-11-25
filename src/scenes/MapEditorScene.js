// src/scenes/MapEditorScene.js
import Phaser from 'phaser';
import { MAPS } from '../data/maps.js';
import { bakeRoad } from '../systems/RoadRenderer.js';
import { roadRendererFor, ROAD_DEPTH } from '../data/roads.js';
import { renderPath } from '../systems/PathRenderer.js';
import { renderPlatforms } from '../systems/PlatformRenderer.js';
import { serializeMapArrays, slotInPathCorridor } from '../systems/mapEditorUtils.js';
import { WORLD_WIDTH, WORLD_HEIGHT, RAIL_WIDTH } from '../data/layout.js';
import { applyWorldCamera } from '../systems/worldCamera.js';
import { getRenderScale } from '../systems/renderScale.js';
import { addText } from '../ui/hiDpiText.js';

/**
 * Dev-only overlay editor. Activated by BootScene when the URL has
 * `?edit=1&map=N`. Renders the real path/platform pipeline over the map
 * bitmap with draggable handles and exports maps.js-ready arrays.
 */
export default class MapEditorScene extends Phaser.Scene {
  constructor() { super('MapEditorScene'); }

  init(data) {
    this.mapId = data?.mapId ?? 0;
    const map = MAPS[this.mapId];
    // Local editable copies (normalized) — never mutate MAPS directly.
    this.waypoints = map.waypoints.map(([x, y]) => [x, y]);
    this.slots = map.towerSlots.map(([x, y]) => [x, y]);
    // The baked road is expensive; it is re-baked only when the waypoints settle.
    this._roadDirty = true;
    this._roadImage = null;
  }

  create() {
    // Same world viewport as GameScene, so pointer.worldX/Y and the
    // normalized coords the editor exports are world coordinates.
    this.W = WORLD_WIDTH; this.H = WORLD_HEIGHT;
    const map = MAPS[this.mapId];

    applyWorldCamera(this.cameras.main, { x: RAIL_WIDTH, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT }, getRenderScale());
    this.cameras.main.setBackgroundColor(map.background);
    const bgKey = `bg_map_${map.id}`;
    if (this.textures.exists(bgKey)) {
      this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, bgKey).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(0);
    }

    this.layer = this.add.graphics().setDepth(10);   // curve + platforms + corridor
    this.handles = this.add.graphics().setDepth(20); // waypoint/slot handles
    this.labelLayer = this.add.container(0, 0).setDepth(21);
    this.hud = addText(this, 8, 8, '', {
      fontSize: '13px', color: '#fff', fontFamily: 'monospace',
      backgroundColor: '#000a', padding: { x: 6, y: 4 },
    }).setDepth(30);

    console.log(`[MapEditor] editing map ${this.mapId} (${map.name})`);
    this._render();

    this.drag = null; // { kind: 'wp'|'slot', index }
    this.input.mouse?.disableContextMenu();

    this.input.on('pointerdown', this._onPointerDown, this);

    this._bindPointer();

    this.input.keyboard?.on('keydown-E', () => this._export());
  }

  _bindPointer() {
    this.input.on('pointermove', this._onPointerMove, this);
    this.input.on('pointerup', this._onPointerUp, this);
    // A release off the canvas fires only pointerupoutside; without it the drag sticks.
    this.input.on('pointerupoutside', this._onPointerUp, this);
  }

  _onPointerMove(pointer) {
    if (!this.drag) return;
    // The mouse-up was lost (window blur, alt-tab): end the drag instead of following a free cursor.
    if (!pointer.isDown) { this._onPointerUp(); return; }
    // pointer.worldX/Y go stale over a HUD rail; converting by hand keeps the handle following the cursor, and the clamp pins it to the edge.
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const nx = Phaser.Math.Clamp(world.x / this.W, 0, 1);
    const ny = Phaser.Math.Clamp(world.y / this.H, 0, 1);
    const arr = this.drag.kind === 'wp' ? this.waypoints : this.slots;
    arr[this.drag.index] = [nx, ny];
    if (this.drag.kind === 'wp') this._roadDirty = true;
    this._render();
  }

  // Ending a waypoint drag is when the baked road catches up with the line.
  // Releasing the right button mid-drag must not end a left drag; no pointer = the lost-mouse-up path.
  _onPointerUp(pointer) {
    if (pointer && !pointer.leftButtonReleased()) return;
    const wasWp = this.drag?.kind === 'wp';
    this.drag = null;
    if (wasWp) this._render();
  }

  _onPointerDown(pointer) {
    // A press mid-drag (e.g. a right-click) would splice the dragged waypoint out from under it.
    if (this.drag) return;
    // Over a HUD rail Phaser fires with no camera and a stale worldX/Y.
    if (!pointer.camera) return;
    const { worldX: x, worldY: y } = pointer;
    const hit = this._hitTest(x, y);
    if (pointer.rightButtonDown()) {
      if (hit?.kind === 'wp' && this.waypoints.length > 2) {
        this.waypoints.splice(hit.index, 1);
        this._roadDirty = true;
        this._render();
      }
      return;
    }
    if (hit) { this.drag = hit; return; }
    // Click on empty space near the path inserts a waypoint there.
    this._insertWaypointAt(x, y);
  }

  // Normalized [x,y] -> pixel {x,y}.
  _toPx([nx, ny]) { return { x: nx * this.W, y: ny * this.H }; }

  // Normalized corridor half-width matching the 80px-wide faint band drawn below.
  _corridorMargin() { return 80 / Math.max(this.W, this.H) / 2; }

  _render() {
    const map = MAPS[this.mapId];
    const wpPx = this.waypoints.map(p => this._toPx(p));

    // Curve + platforms (reuse the real renderers).
    this.layer.clear();
    // Mid-drag the bake is stale and too slow to redo per frame, so a live line
    // stands in until the drag ends.
    const live = this.drag?.kind === 'wp';
    if (roadRendererFor(map) === 'procedural' && !live) {
      this._showBakedRoad(wpPx, map);
    } else {
      this._roadImage?.setVisible(false);
      renderPath(this.layer, wpPx, map.pathRenderStyle);
    }
    const zones = this.slots.map(p => {
      const px = this._toPx(p);
      return { cx: px.x, cy: px.y, radius: 22, occupied: false };
    });
    renderPlatforms(this.layer, zones, map.id);

    // No-build corridor (faint band along each straight segment).
    this.layer.lineStyle(80, 0xff3333, 0.06);
    this.layer.beginPath();
    this.layer.moveTo(wpPx[0].x, wpPx[0].y);
    for (let i = 1; i < wpPx.length; i++) this.layer.lineTo(wpPx[i].x, wpPx[i].y);
    this.layer.strokePath();

    // Handles + index labels.
    this.handles.clear();
    this.labelLayer.removeAll(true);
    const margin = this._corridorMargin();
    wpPx.forEach((p, i) => {
      this.handles.fillStyle(0x33ff66, 1).fillCircle(p.x, p.y, 7);
      this._label(p.x, p.y - 14, `w${i}`, '#33ff66');
    });
    this.slots.forEach((s, i) => {
      const p = this._toPx(s);
      const bad = slotInPathCorridor(s, this.waypoints, margin);
      this.handles.lineStyle(3, bad ? 0xff3333 : 0x66ccff, 1).strokeCircle(p.x, p.y, 22);
      this._label(p.x, p.y - 28, `s${i}`, bad ? '#ff5555' : '#66ccff');
    });

    this._renderHud();
  }

  _showBakedRoad(wpPx, map) {
    if (this._roadDirty) {
      // Same k-carrying key scheme as GameScene; bakeRoad reuses an existing key,
      // so the stale texture must go first.
      const k = getRenderScale();
      const roadKey = `road_editor@${k}`;
      if (this.textures.exists(roadKey)) this.textures.remove(roadKey);
      const key = bakeRoad(this, {
        key: roadKey, resolution: k, waypoints: wpPx,
        styleKey: map.pathRenderStyle, seed: map.blockerSeed, width: WORLD_WIDTH, height: WORLD_HEIGHT,
      });
      if (this._roadImage) this._roadImage.setTexture(key);
      else this._roadImage = this.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, key).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(ROAD_DEPTH);
      this._roadDirty = false;
    }
    this._roadImage.setVisible(true);
  }

  _label(x, y, text, color) {
    this.labelLayer.add(addText(this, x, y, text, {
      fontSize: '11px', color, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5));
  }

  _renderHud() {
    const map = MAPS[this.mapId];
    const target = map.towerSlots.length;
    const ok = this.slots.length === target;
    const margin = this._corridorMargin();
    const inCorridor = this.slots.filter(s => slotInPathCorridor(s, this.waypoints, margin)).length;
    this.hud.setText([
      `Map ${map.id} — ${map.name}`,
      `waypoints: ${this.waypoints.length}`,
      `slots: ${this.slots.length} / ${target} ${ok ? 'OK' : 'MISMATCH'}`,
      `slots in corridor: ${inCorridor}`,
      `[E] export to clipboard+console`,
      `drag handle = move · click path = add waypoint · right-click waypoint = delete`,
    ].join('\n'));
  }

  // Returns { kind, index } for the closest handle within its radius, else null.
  _hitTest(x, y) {
    for (let i = 0; i < this.waypoints.length; i++) {
      const p = this._toPx(this.waypoints[i]);
      if (Math.hypot(p.x - x, p.y - y) <= 10) return { kind: 'wp', index: i };
    }
    for (let i = 0; i < this.slots.length; i++) {
      const p = this._toPx(this.slots[i]);
      if (Math.hypot(p.x - x, p.y - y) <= 22) return { kind: 'slot', index: i };
    }
    return null;
  }

  // Insert a waypoint on the segment nearest the click (only if reasonably close).
  _insertWaypointAt(x, y) {
    let best = { dist: Infinity, index: -1 };
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const a = this._toPx(this.waypoints[i]);
      const b = this._toPx(this.waypoints[i + 1]);
      const dx = b.x - a.x, dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lenSq));
      const cx = a.x + t * dx, cy = a.y + t * dy;
      const d = Math.hypot(cx - x, cy - y);
      if (d < best.dist) best = { dist: d, index: i + 1 };
    }
    if (best.index >= 0 && best.dist <= 40) {
      this.waypoints.splice(best.index, 0, [
        Phaser.Math.Clamp(x / this.W, 0, 1),
        Phaser.Math.Clamp(y / this.H, 0, 1),
      ]);
      this._roadDirty = true;
      this._render();
    }
  }

  _export() {
    const snippet = serializeMapArrays(this.waypoints, this.slots);
    console.log(`\n=== Map ${this.mapId} (${MAPS[this.mapId].name}) ===\n${snippet}\n`);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(snippet).then(
        () => { this.hud.setText(this.hud.text + '\n✓ copied to clipboard'); },
        () => { /* clipboard blocked; console output still available */ },
      );
    }
  }
}
