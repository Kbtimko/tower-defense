import Phaser from 'phaser';
import { SaveManager } from '../systems/SaveManager.js';
import { getOrCreateAudioManager } from '../systems/AudioManager.js';
import { MAPS } from '../data/maps.js';
import { resolveAmbientMotion } from '../systems/AmbientBackgroundLayer.js';
import { spriteManifest } from '../data/sprites.js';
import { spriteTextureKey, variantTextureKey } from '../systems/spriteKeys.js';
import { STORY_SPEAKERS } from '../data/story.js';
import { portraitPath, registerPortraits } from '../systems/portraitFallback.js';
import { backgroundUrl, pickBackgroundVariant, mapCssWidth } from '../systems/backgroundAsset.js';
import { attachLoadingBar } from '../ui/loadingBar.js';
import { resolveGraphics } from '../systems/graphicsQuality.js';
import { parseDebugParams } from '../systems/debugCapture.js';
import { MAP_WAVES } from '../data/waves.js';
import { TOWER_DEFS } from '../data/towers.js';
import { HERO_ORDER } from '../data/heroes.js';
import { generateFxTextures } from '../systems/fxTextures.js';
import { generateSoldierTierTextures } from '../systems/soldierTierTextures.js';
import { BACKDROP_ART } from '../data/worldMap.js';

// Existence probe only: the world map draws the art on its own 2D canvas.
const WORLD_BACKDROP_KEY = 'wm_backdrop';

// Distinct portrait keys across all story speakers (deduped: two speakers may
// legitimately share a portrait).
const PORTRAIT_KEYS = [...new Set(
  Object.values(STORY_SPEAKERS).map(sp => sp.portraitKey).filter(Boolean),
)];

export default class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    attachLoadingBar(this);
    const sm = new SaveManager();
    this.game.registry.set('save', sm);
    const prefersReduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    this.game.registry.set('ambientMotion',
      resolveAmbientMotion(sm.getSettings().ambientMotion, prefersReduced));
    // A coarse pointer, not "has touch": touch-screen laptops still grade.
    const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    // graphicsEnv lets the settings overlay re-resolve live without re-detecting.
    const graphicsEnv = { webgl: this.game.renderer?.type === Phaser.WEBGL, touch: coarse };
    const gfx = resolveGraphics(sm.getSettings().graphics, graphicsEnv);
    this.game.registry.set('graphicsEnv', graphicsEnv);
    this.game.registry.set('mapGrade', gfx.mapGrade);
    this.game.registry.set('ambientFx', gfx.ambientFx);
    this.game.registry.set('particleScale', gfx.particleScale);
    // Only an explicit false opts out, so a missing key keeps the default on.
    this.game.registry.set('autoSend', sm.getSettings().autoSend !== false);
    const am = getOrCreateAudioManager(this.game, sm);
    am.loadAssets(this);
    this.load.image('spark', 'particles/spark.png');

    // Preload all 10 map backdrops (WebP derived by `npm run optimize-assets`).
    // Missing files log a 404 but don't crash — GameScene falls back to the
    // solid map.background color.
    const bgVariant = pickBackgroundVariant({
      mapCssWidth: mapCssWidth(this.game.canvas?.getBoundingClientRect().width),
      dpr: window.devicePixelRatio,
    });
    for (const m of MAPS) {
      this.load.image(`bg_map_${m.id}`, backgroundUrl(m.backgroundImage, bgVariant));
    }

    // Preload story-speaker portraits. Missing files log a 404 but don't crash
    // (same as map backdrops); keys whose PNG is absent simply never register,
    // so the speaker keeps its coloured-initial fallback.
    for (const key of PORTRAIT_KEYS) {
      this.load.image(key, portraitPath(key));
    }

    // World-map vista art (deferred asset, spec 4.4). Only a filled slot loads:
    // probing a file that doesn't exist logs a load error on every boot.
    if (typeof BACKDROP_ART === 'string') this.load.image(WORLD_BACKDROP_KEY, BACKDROP_ART);

    // Preload entity sprite art declared in the manifest. Missing files log a
    // 404 but don't crash (same as map backdrops). Keys whose PNG is absent
    // simply never register, so the entity keeps its Graphics fallback.
    // Declared tier variants (#49 R2) load under their variant key the same way.
    const loadState = (key, def) => {
      if (def.frames && def.frames > 1) {
        this.load.spritesheet(key, def.path, { frameWidth: def.frameWidth, frameHeight: def.frameHeight });
      } else {
        this.load.image(key, def.path);
      }
    };
    for (const entry of spriteManifest()) {
      for (const [state, def] of Object.entries(entry.states ?? {})) {
        loadState(spriteTextureKey(entry.category, entry.type, state), def);
      }
      for (const [variant, vdef] of Object.entries(entry.variants ?? {})) {
        for (const [state, def] of Object.entries(vdef.states ?? {})) {
          loadState(variantTextureKey(entry.category, entry.type, state, variant), def);
        }
      }
    }
  }

  create() {
    // Before any scene.start so every later scene (incl. debug/capture entry) has the textures.
    generateFxTextures(this);

    // Record which manifest textures actually loaded so the pure resolver can
    // tell "registered" from "fall back". Textures are guaranteed present by
    // the time create() runs.
    const registeredSpriteKeys = [];
    for (const entry of spriteManifest()) {
      for (const state of Object.keys(entry.states ?? {})) {
        const key = spriteTextureKey(entry.category, entry.type, state);
        if (this.textures.exists(key)) registeredSpriteKeys.push(key);
      }
      for (const [variant, vdef] of Object.entries(entry.variants ?? {})) {
        for (const state of Object.keys(vdef.states ?? {})) {
          const key = variantTextureKey(entry.category, entry.type, state, variant);
          if (this.textures.exists(key)) registeredSpriteKeys.push(key);
        }
      }
    }
    // After the scan: loaded tier art already exists, so generation skips it (E14);
    // a declared variant that 404'd gets the generated copy instead (E15).
    // Failures are surfaced here, not logged: a console warning fails captures.
    const soldierTiers = generateSoldierTierTextures(this, registeredSpriteKeys);
    this.game.registry.set('spriteKeys', [...registeredSpriteKeys, ...soldierTiers.added]);
    this.game.registry.set('soldierTierFailed', soldierTiers.failed);

    // Same idea for portraits, but the consumer is a DOM <img> rather than a
    // Phaser texture, so the load above is purely an existence probe.
    registerPortraits(PORTRAIT_KEYS.filter(key => this.textures.exists(key)));
    this.game.registry.set('worldBackdrop', this.textures.exists(WORLD_BACKDROP_KEY) ? BACKDROP_ART : false);

    const params = new URLSearchParams(window.location.search);
    // Dev tool: same gate as the ?debug= entry below, so production ignores ?edit=1.
    if ((import.meta.env.DEV || import.meta.env.MODE === 'capture') && params.get('edit') === '1') {
      const mapId = Math.max(0, Math.min(MAPS.length - 1,
        Number.parseInt(params.get('map') ?? '0', 10) || 0));
      this.scene.start('MapEditorScene', { mapId });
      return;
    }
    // Screenshot harness entry (scripts/capture.mjs): straight into a level.
    if (import.meta.env.DEV || import.meta.env.MODE === 'capture') {
      const debug = parseDebugParams(window.location.search, {
        maps: MAPS, waves: MAP_WAVES, towerTypes: Object.keys(TOWER_DEFS), heroes: HERO_ORDER,
      });
      if (debug) {
        this.scene.start('GameScene', { mapId: debug.mapId, heroId: debug.heroId, debug });
        return;
      }
    }
    this.scene.start('TitleScene', {});
  }
}
