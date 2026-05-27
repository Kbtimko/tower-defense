const SHAKES = {
  'boss-died':        { duration: 600, intensity: 0.020 },
  'airstrike-impact': { duration: 250, intensity: 0.012 },
  'emp-pulse':        { duration: 200, intensity: 0.008 },
};

export class ShakeController {
  constructor(scene) {
    this._scene = scene;
    this._handlers = {};
    for (const [evt, cfg] of Object.entries(SHAKES)) {
      const fn = () => scene.cameras.main.shake(cfg.duration, cfg.intensity);
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
