// Phaser-free so it can be unit-tested with plain objects; the factory owns
// construction, the instances own show/hide (reset/deactivate).
export class ProjectilePool {
  constructor(factory) {
    this._factory = factory;
    this._free = [];
    this._live = new Set();
  }

  acquire(opts) {
    const p = this._free.pop();
    if (p) p.reset(opts);
    const proj = p ?? this._factory(opts);
    this._live.add(proj);
    return proj;
  }

  release(p) {
    // Guard on live membership: a double release would otherwise queue the same
    // instance twice and hand it to two shots at once.
    if (!this._live.delete(p)) return;
    if (p.deactivate) p.deactivate();
    this._free.push(p);
  }

  destroyAll() {
    for (const p of this._free) p.destroy();
    for (const p of this._live) p.destroy();
    this._free = [];
    this._live.clear();
  }
}
