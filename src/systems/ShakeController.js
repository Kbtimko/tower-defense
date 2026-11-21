import { getRenderScale } from './renderScale.js';

export const SHAKES = {
  'boss-died':        { duration: 600, intensity: 0.020 },
  'airstrike-impact': { duration: 250, intensity: 0.012 },
  'emp-pulse':        { duration: 200, intensity: 0.008 },
};

export class ShakeController {
  constructor(scene) {
    this._scene = scene;
    this._handlers = {};
    for (const [evt, cfg] of Object.entries(SHAKES)) {
      // Phaser's shake offset is intensity * camera.width * zoom, then translated
      // after the zoom is applied, so on-screen it scales with k^2 on the k-times
      // wider, k-zoomed world camera. Divide by k^2 to keep the k=1 tuning.
      const fn = () => {
        const k = getRenderScale();
        scene.cameras.main.shake(cfg.duration, cfg.intensity / (k * k));
      };
      scene.events.on(evt, fn);
      this._handlers[evt] = fn;
    }
  }

  destroy() {
    for (const [evt, fn] of Object.entries(this._handlers)) {
      this._scene.events.off(evt, fn);
    }
  }
}
