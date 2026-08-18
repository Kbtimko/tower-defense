import { FX_FAMILIES } from './ambientFxFamilies.js';
import { SeededRandom } from './SeededRandom.js';

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
 * Owns one depth-5 Graphics object and runs a single fx family each frame.
 * Reads the `ambientMotion` registry flag every update so the settings toggle
 * takes effect live.
 */
export class AmbientBackgroundLayer {
  constructor(scene, ambientFx) {
    this._scene = scene;
    this._family = FX_FAMILIES[ambientFx.family];
    if (!this._family) {
      throw new Error(`AmbientBackgroundLayer: unknown family "${ambientFx.family}"`);
    }
    const w = scene.scale.width;
    const h = scene.scale.height;
    this._state = this._family.init(new SeededRandom(ambientFx.seed), w, h);
    this._gfx = scene.add.graphics().setDepth(5);
    if (this._family.blendMode) this._gfx.setBlendMode(this._family.blendMode);
  }

  update(dtMs) {
    if (!this._gfx) return;
    if (this._scene.registry.get('ambientMotion') === false) {
      this._gfx.clear();
      return;
    }
    this._family.step(this._state, dtMs);
    this._gfx.clear();
    this._family.draw(this._gfx, this._state);
  }

  destroy() {
    this._gfx?.destroy();
    this._gfx = null;
  }
}
