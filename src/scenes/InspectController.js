export class InspectController {
  constructor(scene) {
    this.scene = scene;
    this.pinned = null;       // { kind: 'enemy'|'hero', target } | null
    this.peekTarget = null;

    document.getElementById('ei-close').addEventListener('click', () => this.dismiss());
    document.getElementById('hi-close').addEventListener('click', () => this.dismiss());

    this._onKeyDown = (e) => { if (e.key === 'Escape') this.dismiss(); };
    window.addEventListener('keydown', this._onKeyDown);
  }

  // Called by GameScene._onPointerDown. Returns true if click was consumed.
  tryClickInspect(mx, my) {
    const enemy = this._hitTestEnemy(mx, my);
    if (enemy) { this.pin({ kind: 'enemy', target: enemy }); return true; }
    if (this._hitTestHero(mx, my)) {
      this.pin({ kind: 'hero', target: this.scene.hero });
      return true;
    }
    return false;
  }

  // Hover handler — STUB; populated in Task 7.
  onPointerMove(_mx, _my) {
    // Task 7 will implement peek display.
  }

  // Per-tick refresh — STUB; populated in Task 6.
  refresh() {
    // Task 6 will implement auto-dismiss + live HP/cooldown updates.
  }

  pin(spec) {
    if (this.pinned && this.pinned.target === spec.target) {
      this.dismiss();
      return;
    }
    this.pinned = spec;
    this._showPanel(spec.kind);
  }

  dismiss() {
    this.pinned = null;
    document.getElementById('enemy-inspector').style.display = 'none';
    document.getElementById('hero-inspector').style.display = 'none';
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  _hitTestEnemy(mx, my) {
    for (const e of this.scene.enemies) {
      if (e.dead) continue;
      const r = (e.def?.radius ?? 0) + 4;
      if (Math.hypot(e.x - mx, e.y - my) <= r) return e;
    }
    return null;
  }

  _hitTestHero(mx, my) {
    const h = this.scene.hero;
    if (!h || h.dead) return false;
    return Math.hypot(h.x - mx, h.y - my) <= 18;
  }

  _showPanel(kind) {
    if (kind === 'enemy') {
      document.getElementById('enemy-inspector').style.display = 'block';
      document.getElementById('hero-inspector').style.display = 'none';
    } else {
      document.getElementById('hero-inspector').style.display = 'block';
      document.getElementById('enemy-inspector').style.display = 'none';
    }
  }
}
