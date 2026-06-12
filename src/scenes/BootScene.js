import Phaser from 'phaser';
import { SaveManager } from '../systems/SaveManager.js';
import { getOrCreateAudioManager } from '../systems/AudioManager.js';
import { MAPS } from '../data/maps.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    const sm = new SaveManager();
    this.game.registry.set('save', sm);
    const am = getOrCreateAudioManager(this.game, sm);
    am.loadAssets(this);
    this.load.image('spark', 'particles/spark.png');

    // Preload all 10 map backdrop PNGs. Missing files log a 404 but
    // don't crash — GameScene falls back to the solid map.background color.
    for (const m of MAPS) {
      this.load.image(`bg_map_${m.id}`, `assets/backgrounds/${m.backgroundImage}`);
    }
  }

  create() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('edit') === '1') {
      const mapId = Math.max(0, Math.min(MAPS.length - 1,
        Number.parseInt(params.get('map') ?? '0', 10) || 0));
      this.scene.start('MapEditorScene', { mapId });
      return;
    }
    this.scene.start('MenuScene');
  }
}
