export class AreaEffectsManager {
  constructor(scene) {
    this.scene = scene;
    this._effects = [];
  }

  add(spec) {
    const g = this.scene.add.graphics().setDepth(2);
    const eff = { ...spec, _remaining: spec.duration, _tickAccum: 0, _g: g };
    const cx = eff.followsTarget ? eff.followsTarget.x : eff.x;
    const cy = eff.followsTarget ? eff.followsTarget.y : eff.y;
    g.setPosition(cx, cy);
    eff.drawFn(g, eff);
    this._effects.push(eff);
    return eff;
  }

  update(dt, enemies) {
    for (let i = this._effects.length - 1; i >= 0; i--) {
      const eff = this._effects[i];
      eff._remaining -= dt;
      if (eff._remaining <= 0 || eff.followsTarget?.dead) {
        eff._g.destroy();
        this._effects.splice(i, 1);
        continue;
      }
      if (eff.followsTarget) {
        eff._g.setPosition(eff.followsTarget.x, eff.followsTarget.y);
      }
      eff._tickAccum += dt;
      while (eff._tickAccum >= 1) {
        eff._tickAccum -= 1;
        const cx = eff.followsTarget ? eff.followsTarget.x : eff.x;
        const cy = eff.followsTarget ? eff.followsTarget.y : eff.y;
        for (const e of enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - cx, e.y - cy) <= eff.radius) {
            e.takeDamage(eff.dps, { source: eff.sourceTag });
            if (eff.slowFactor != null) {
              e.applyStatus({ type: 'slow', duration: 1.2, factor: eff.slowFactor });
            }
          }
        }
      }
    }
  }

  destroyAll() {
    for (const e of this._effects) e._g.destroy();
    this._effects = [];
  }
}
