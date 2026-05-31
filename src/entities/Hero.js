import Phaser from 'phaser';
import { heroSource } from '../data/sourceBuilders.js';
import { HEROES } from '../data/heroes.js';

// Kept exported for back-compat with InspectController until T12 migrates it.
// T22 (cleanup) removes this once no consumers remain.
export const HERO_STATS = HEROES.rael.stats;

const MOVE_STOP_DIST = 8;

export class Hero extends Phaser.GameObjects.Container {
  constructor(scene, { x, y, heroId = 'rael' }, modifiers = {}) {
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
    this._spawnX      = x;
    this._spawnY      = y;

    this.targetX = x; this.targetY = y; this.moving = false;
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
  }

  // Back-compat getters mirror legacy fields used by GameScene/InspectController.
  get overchargeTimer() { return this._timers.q; }
  set overchargeTimer(v) { this._timers.q = v; }
  get airstrikeTimer()  { return this._timers.w; }
  set airstrikeTimer(v)  { this._timers.w = v; }
  get empTimer()        { return this._timers.e; }
  set empTimer(v)        { this._timers.e = v; }

  _redrawHpBar() {
    this._hpBar.clear();
    if (this.hp >= this.maxHp) return;
    const w = 16, h = 2, ox = -8, oy = -22;
    this._hpBar.fillStyle(0x333333, 1);
    this._hpBar.fillRect(ox, oy, w, h);
    this._hpBar.fillStyle(this.def.strokeColor, 1);
    this._hpBar.fillRect(ox, oy, Math.max(0, w * (this.hp / this.maxHp)), h);
  }

  moveTo(x, y) {
    if (this.dead) return;
    this.targetX = x;
    this.targetY = y;
    this.moving  = true;
    this._facingX = x >= this.x ? 1 : -1;
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
      const am = this.scene.game?.registry?.get('audio');
      if (am) am.playSfx('hero-death');
    }
  }

  respawn() {
    this.dead         = false;
    this.hp           = this.maxHp;
    this.respawnTimer = 0;
    this.x            = this._spawnX;
    this.y            = this._spawnY;
    this.targetX      = this._spawnX;
    this.targetY      = this._spawnY;
    this.moving       = false;
    this.cloaked      = false;
    this._cloakTimer  = 0;
    this._moveSpeedMult    = 1.0;
    this._attackDamageMult = 1.0;
    this._attackTimer = 1 / this.def.stats.attackRate;
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

  // Back-compat wrappers — GameScene still calls these in some paths until T10 migrates.
  // These bypass the level-unlock gate to preserve pre-refactor behavior (old code had no gate).
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

    if (this.moving) {
      const dx = this.targetX - this.x, dy = this.targetY - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= MOVE_STOP_DIST) {
        this.moving = false;
      } else {
        const step = Math.min(this.def.stats.moveSpeed * this._moveSpeedMult * dt, dist);
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
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
