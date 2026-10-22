import { FX_FAMILIES } from './ambientFxFamilies.js';
import { SeededRandom } from './SeededRandom.js';
import { AMBIENT_LAYERS } from '../data/ambient.js';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../data/layout.js';

/**
 * Resolve the effective ambient-motion flag. An explicit saved boolean always
 * wins; when unset (null/undefined), default to the inverse of the OS
 * prefers-reduced-motion preference.
 * @param {boolean|null|undefined} saved
 * @param {boolean} prefersReduced
 * @returns {boolean}
 */
export function resolveAmbientMotion(saved, prefersReduced) {
  if (typeof saved === 'boolean') return saved;
  return !prefersReduced;
}

/**
 * Owns one Graphics per AMBIENT_LAYERS entry (far under the road, near above
 * it) and runs the map's fx family on each, seeded differently so the layers
 * never mirror each other. Reads the `ambientMotion` registry flag every
 * update so the settings toggle takes effect live.
 */
export class AmbientBackgroundLayer {
  constructor(scene, ambientFx) {
    this._scene = scene;
    this._family = FX_FAMILIES[ambientFx.family];
    if (!this._family) {
      throw new Error(`AmbientBackgroundLayer: unknown family "${ambientFx.family}"`);
    }
    this._layers = AMBIENT_LAYERS.map((layer) => {
      const state = this._family.init(new SeededRandom(ambientFx.seed + layer.seedOffset), WORLD_WIDTH, WORLD_HEIGHT);
      const gfx = scene.add.graphics().setDepth(layer.depth).setAlpha(layer.alpha);
      if (this._family.blendMode) gfx.setBlendMode(this._family.blendMode);
      // Allocated once so update() never creates per-frame objects.
      return { state, gfx, speed: layer.speed, drawOpts: { sizeMult: layer.size } };
    });
  }

  update(dtMs) {
    if (!this._layers) return;
    const off = this._scene.registry.get('ambientMotion') === false;
    for (const layer of this._layers) {
      layer.gfx.clear();
      if (off) continue;
      this._family.step(layer.state, dtMs * layer.speed);
      this._family.draw(layer.gfx, layer.state, layer.drawOpts);
    }
  }

  destroy() {
    if (!this._layers) return;
    for (const layer of this._layers) layer.gfx.destroy();
    this._layers = null;
  }
}
