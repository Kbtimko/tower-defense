import Phaser from 'phaser';
import { heroSource } from '../data/sourceBuilders.js';
import { HEROES } from '../data/heroes.js';

export class Hero extends Phaser.GameObjects.Container {
  constructor(scene, { x, y, heroId = 'rael', pathPoints }, modifiers = {}) {
    super(scene, x, y);
    this.heroId = heroId;
    this.def    = HEROES[heroId];
    if (!this.def) throw new Error(`Hero: unknown heroId "${heroId}"`);
    const s = this.def.stats;

    this.maxHp        = s.maxHp + (modifiers.heroMaxHpBonus ?? 0);
    this.hp           = this.maxHp;
    this.level        = modifiers.heroStartLevel ?? 1;
    this._respawnTime = s.respawnTime + (modifiers.heroRespawnDelta ?? 0);
    this.killCount    = 0;
    this.dead         = false;
    this.respawnTimer = 0;
    this.moving       = false;

    // Path-restricted movement state (replaces free-form targetX/Y).
    this._pathPoints      = pathPoints || [];
    this._totalPathLength = 0;
    for (let i = 0; i < this._pathPoints.length - 1; i++) {
      this._totalPathLength += Math.hypot(
        this._pathPoints[i + 1].x - this._pathPoints[i].x,
        this._pathPoints[i + 1].y - this._pathPoints[i].y
      );
    }
    this.pathProgress   = 0;
    this.targetProgress = 0;

    // Hero-roster mutable state: facing, speed/damage mults, cloak.
    this._facingX          = 1;
    this._moveSpeedMult    = 1.0;
    this._attackDamageMult = 1.0;
    this.cloaked           = false;
    this._cloakTimer       = 0;

    this._timers = { q: 0, w: 0, e: 0 };
    this.overchargeActive    = false;
    this.overchargeRemaining = 0;

    this._attackTimer = 0;

    this._body  = scene.add.graphics();
    this._hpBar = scene.add.graphics();
    this.add([this._body, this._hpBar]);
    scene.add.existing(this);
    this.setDepth(4);
    this.def.draw(this._body);

    if (this._totalPathLength > 0) this.setPathPosition(0);
  }

  _redrawHpBar() {
    this._hpBar.clear();
    if (this.hp >= this.maxHp) return;
    const w = 16, h = 2, ox = -8, oy = -22;
    this._hpBar.fillStyle(0x333333, 1);
    this._hpBar.fillRect(ox, oy, w, h);
    this._hpBar.fillStyle(this.def.strokeColor, 1);
    this._hpBar.fillRect(ox, oy, Math.max(0, w * (this.hp / this.maxHp)), h);
  }

  setPathPosition(progress) {
    this.pathProgress = progress;
    if (this._totalPathLength <= 0) return;
    let target = progress * this._totalPathLength;
    const pts = this._pathPoints;
    for (let i = 0; i < pts.length - 1; i++) {
      const dx  = pts[i + 1].x - pts[i].x;
      const dy  = pts[i + 1].y - pts[i].y;
      const len = Math.hypot(dx, dy);
      if (target <= len || i === pts.length - 2) {
        const t = len > 0 ? Math.min(1, target / len) : 0;
        this.x = pts[i].x + t * dx;
        this.y = pts[i].y + t * dy;
        return;
      }
      target -= len;
    }
    // Backstop (matches Soldier.setPathProgress) — the guard above should always
    // catch the last segment, but if the loop ever exits without returning,
    // pin to the path end.
    this.x = pts[pts.length - 1].x;
    this.y = pts[pts.length - 1].y;
  }

  moveToProgress(progress) {
    if (this.dead) return;
    this.targetProgress = progress;
    this.moving = (progress !== this.pathProgress);
    if (this.moving) this._facingX = progress >= this.pathProgress ? 1 : -1;
  }

  takeDamage(amount, _opts = {}) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this._redrawHpBar();
    if (this.hp <= 0) {
      this.dead         = true;
      this.respawnTimer = this._respawnTime;
      this._body.setVisible(false);
      this._hpBar.clear();
      this._attackDamageMult = 1.0;
      if (this._attackDmgRevertEvt) {
        this._attackDmgRevertEvt.remove(false);
        this._attackDmgRevertEvt = null;
      }
      const am = this.scene.game?.registry?.get('audio');
      if (am) am.playSfx('hero-death');
    }
  }

  respawn() {
    this.dead              = false;
    this.hp                = this.maxHp;
    this.respawnTimer      = 0;
    this.pathProgress      = 0;
    this.targetProgress    = 0;
    this.moving            = false;
    this.cloaked           = false;
    this._cloakTimer       = 0;
    this._moveSpeedMult    = 1.0;
    this._attackDamageMult = 1.0;
    this._attackTimer      = 1 / this.def.stats.attackRate;
    this.setPathPosition(0);
    this._body.setVisible(true);
    this._redrawHpBar();
    const am = this.scene.game?.registry?.get('audio');
    if (am) am.playSfx('hero-respawn');
  }

  _registerKill() {
    this.killCount++;
    const prev = this.level;
    if (this.level < 2 && this.killCount >= 25) this.level = 2;
    if (this.level < 3 && this.killCount >= 75) this.level = 3;
    if (this.level !== prev) this.scene.events.emit('hero:level-up', { level: this.level });
  }

  /**
   * Dispatch an ability by slot ('q' | 'w' | 'e').
   * - aimTarget is { x, y } for aim:true abilities (e.g., airstrike, firefield, mark target).
   * - Returns the ability impl's result (or null on cooldown/dead/locked).
   * - On non-null return, starts the slot's cooldown timer.
   */
  fireAbility(slot, aimTarget) {
    const a = this.def.abilities[slot];
    if (!a) return null;
    if (this.dead) return null;
    if (this._timers[slot] > 0) return null;
    const unlockLvl = this.def.stats.abilityUnlockLevels[slot];
    if (this.level < unlockLvl) return null;
    const result = a.run(this, this.scene, aimTarget);
    if (result) this._timers[slot] = a.cooldown;
    return result;
  }

  // Back-compat wrappers retained only for Hero.test.js, which fires W/E on a
  // level-1 hero and asserts pre-gate behavior. Production code uses
  // fireAbility() (level-gated). Removing these requires rewriting the tests
  // to bump hero.level before firing — separate cleanup task.
  overcharge() {
    if (this.dead || this._timers.q > 0) return false;
    const r = this.def.abilities.q.run(this, this.scene);
    if (r) this._timers.q = this.def.abilities.q.cooldown;
    return r !== null;
  }
  airstrike(x, y) {
    if (this.dead || this._timers.w > 0) return null;
    const r = this.def.abilities.w.run(this, this.scene, { x, y });
    if (r) this._timers.w = this.def.abilities.w.cooldown;
    // Strip `kind` to preserve the pre-registry return shape consumed by
    // Hero.test.js. fireAbility returns the full result (with `kind`).
    return r ? { x: r.x, y: r.y, radius: r.radius, damage: r.damage } : null;
  }
  empPulse() {
    if (this.dead || this._timers.e > 0) return false;
    const r = this.def.abilities.e.run(this, this.scene);
    if (r) this._timers.e = this.def.abilities.e.cooldown;
    return r !== null;
  }

  update(dt, enemies) {
    for (const slot of ['q','w','e']) {
      if (this._timers[slot] > 0) this._timers[slot] = Math.max(0, this._timers[slot] - dt);
    }
    if (this.overchargeRemaining > 0) {
      this.overchargeRemaining = Math.max(0, this.overchargeRemaining - dt);
      if (this.overchargeRemaining === 0) this.overchargeActive = false;
    }
    if (this._cloakTimer > 0) {
      this._cloakTimer -= dt;
      if (this._cloakTimer <= 0) {
        this.cloaked        = false;
        this._moveSpeedMult = 1.0;
      }
    }

    if (this.dead) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
      return;
    }

    if (this.moving && this._totalPathLength > 0) {
      const speed         = this.def.stats.moveSpeed * this._moveSpeedMult;
      const deltaProgress = (speed * dt) / this._totalPathLength;
      const remaining     = this.targetProgress - this.pathProgress;
      if (Math.abs(remaining) <= deltaProgress) {
        this.pathProgress = this.targetProgress;
        this.moving       = false;
      } else {
        this.pathProgress += Math.sign(remaining) * deltaProgress;
      }
      this.setPathPosition(this.pathProgress);
    }

    this._attackTimer -= dt;
    if (this._attackTimer <= 0) {
      let nearest = null, nearestDist = Infinity;
      const range = this.def.stats.attackRange;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d <= range && d < nearestDist) { nearest = e; nearestDist = d; }
      }
      if (nearest) {
        const dmg = this.def.stats.attackDamage * this._attackDamageMult;
        nearest.takeDamage(dmg, { source: heroSource(this.heroId) });
        if (this.def.onHit) this.def.onHit(this, nearest);
        if (nearest.dead) this._registerKill();
        const am = this.scene.game?.registry?.get('audio');
        if (am) am.playSfx('hero-attack');
        this._attackTimer = 1 / this.def.stats.attackRate;
      }
    }
  }
}
