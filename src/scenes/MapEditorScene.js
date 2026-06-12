// src/scenes/MapEditorScene.js
import Phaser from 'phaser';
import { MAPS } from '../data/maps.js';

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
    // Rendering + interaction added in Tasks 6-7.
    console.log(`[MapEditor] editing map ${this.mapId} (${MAPS[this.mapId].name})`);
  }
}
