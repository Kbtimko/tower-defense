import Phaser from 'phaser';
import { SaveManager } from '../systems/SaveManager.js';
import { getOrCreateAudioManager } from '../systems/AudioManager.js';
import { MAPS } from '../data/maps.js';
import { resolveAmbientMotion } from '../systems/AmbientBackgroundLayer.js';
import { SPRITE_MANIFEST } from '../data/sprites.js';
import { spriteTextureKey } from '../systems/spriteKeys.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    const sm = new SaveManager();
    this.game.registry.set('save', sm);
    const prefersReduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    this.game.registry.set('ambientMotion',
      resolveAmbientMotion(sm.getSettings().ambientMotion, prefersReduced));
    const am = getOrCreateAudioManager(this.game, sm);
    am.loadAssets(this);
    this.load.image('spark', 'particles/spark.png');

    // Preload all 10 map backdrop PNGs. Missing files log a 404 but
    // don't crash — GameScene falls back to the solid map.background color.
    for (const m of MAPS) {
      this.load.image(`bg_map_${m.id}`, `assets/backgrounds/${m.backgroundImage}`);
    }

    // Preload entity sprite art declared in the manifest. Missing files log a
    // 404 but don't crash (same as map backdrops). Keys whose PNG is absent
    // simply never register, so the entity keeps its Graphics fallback.
    for (const entry of SPRITE_MANIFEST) {
      for (const [state, def] of Object.entries(entry.states ?? {})) {
        const key = spriteTextureKey(entry.category, entry.type, state);
        if (def.frames && def.frames > 1) {
          this.load.spritesheet(key, def.path, { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
        } else {
          this.load.image(key, def.path);
        }
      }
    }
  }

  create() {
    // Record which manifest textures actually loaded so the pure resolver can
    // tell "registered" from "fall back". Textures are guaranteed present by
    // the time create() runs.
    const registeredSpriteKeys = [];
    for (const entry of SPRITE_MANIFEST) {
      for (const state of Object.keys(entry.states ?? {})) {
        const key = spriteTextureKey(entry.category, entry.type, state);
        if (this.textures.exists(key)) registeredSpriteKeys.push(key);
      }
    }
    this.game.registry.set('spriteKeys', registeredSpriteKeys);

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
