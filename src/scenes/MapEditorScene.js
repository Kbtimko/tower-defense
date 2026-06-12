// src/scenes/MapEditorScene.js
import Phaser from 'phaser';
import { MAPS } from '../data/maps.js';
import { renderPath } from '../systems/PathRenderer.js';
import { renderPlatforms } from '../systems/PlatformRenderer.js';
import { slotInPathCorridor } from '../systems/mapEditorUtils.js';

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
  }

  create() {
    const { width, height } = this.scale;
    this.W = width; this.H = height;
    const map = MAPS[this.mapId];

    this.cameras.main.setBackgroundColor(map.background);
    const bgKey = `bg_map_${map.id}`;
    if (this.textures.exists(bgKey)) {
      this.add.image(width / 2, height / 2, bgKey).setDisplaySize(width, height).setDepth(0);
    }

    this.layer = this.add.graphics().setDepth(10);   // curve + platforms + corridor
    this.handles = this.add.graphics().setDepth(20); // waypoint/slot handles
    this.labelLayer = this.add.container(0, 0).setDepth(21);
    this.hud = this.add.text(8, 8, '', {
      fontSize: '13px', color: '#fff', fontFamily: 'monospace',
      backgroundColor: '#000a', padding: { x: 6, y: 4 },
    }).setDepth(30);

    console.log(`[MapEditor] editing map ${this.mapId} (${map.name})`);
    this._render();
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
    renderPath(this.layer, wpPx, map.pathRenderStyle);
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

  _label(x, y, text, color) {
    this.labelLayer.add(this.add.text(x, y, text, {
      fontSize: '11px', color, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5));
  }

  _renderHud() {
    const map = MAPS[this.mapId];
    const target = 6 + map.id;
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
}
