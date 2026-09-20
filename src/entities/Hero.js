import Phaser from 'phaser';
import { heroSource } from '../data/sourceBuilders.js';
import { HEROES, HERO_REGEN_DELAY, HERO_REGEN_RATE } from '../data/heroes.js';
import { totalEnemyHpForMap } from '../data/waves.js';
import { heroLevelForDamage, heroAttackDamage, heroMaxHp } from '../systems/heroLeveling.js';
import { EntitySprite } from '../systems/EntitySprite.js';
import { pointAtProgress } from '../systems/pathGeometry.js';

export class Hero extends Phaser.GameObjects.Container {
  constructor(scene, { x, y, heroId = 'rael', pathPoints, mapId = 0 }, modifiers = {}) {
    super(scene, x, y);
    this.heroId = heroId;
    this.def    = HEROES[heroId];
    if (!this.def) throw new Error(`Hero: unknown heroId "${heroId}"`);
    const s = this.def.stats;

    // Levelling is per-map and per-run: damage and level both reset with the
    // Hero, and the thresholds are scaled to THIS map's HP budget so map 0 and
    // map 9 pace alike.
    this._modifiers  = modifiers;
    this._startLevel = Math.min(modifiers.heroStartLevel ?? 1, s.maxLevel);
    this._mapTotalHp = totalEnemyHpForMap(mapId);
    this.damageDealt = 0;
    this.level       = this._startLevel;

    this.maxHp        = heroMaxHp(s, this.level, modifiers);
    this.hp           = this.maxHp;
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
    this._facingX            = 1;
    this._moveSpeedMult      = 1.0;
    this._attackDamageMult   = 1.0;
    this._attackDmgRevertEvt = null;
    this.cloaked             = false;
    this._cloakTimer         = 0;

    this._timers = { q: 0, w: 0, e: 0 };
    this.overchargeActive    = false;
    this.overchargeRemaining = 0;

    this._attackTimer = 0;
    // A hero that has never been hit counts as already out of combat.
    this._timeSinceDamage = HERO_REGEN_DELAY;

    this._body  = scene.add.graphics();
    this._hpBar = scene.add.graphics();
    this.add([this._body, this._hpBar]);
    scene.add.existing(this);
    this.setDepth(15); // above the static road/build-pad layer (depth 10)
    this.def.draw(this._body);
    this._sprite = new EntitySprite(this, scene, {
      category: 'hero', type: heroId, initialState: 'idle',
    });
    if (this._sprite.active) this._body.setVisible(false);

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
    // Shared with the headless balance simulator so both place along the path
    // by identical arithmetic (see systems/pathGeometry.js).
    const { x, y } = pointAtProgress(this._pathPoints, progress);
    this.x = x;
    this.y = y;
  }

  moveToProgress(progress) {
    if (this.dead) return;
    this.targetProgress = progress;
    this.moving = (progress !== this.pathProgress);
    if (this.moving) this._facingX = progress >= this.pathProgress ? 1 : -1;
  }

  takeDamage(amount, _opts = {}) {
    if (this.dead) return;
    this._timeSinceDamage = 0;
    this.hp = Math.max(0, this.hp - amount);
    this._redrawHpBar();
    if (this.hp <= 0) {
      this.dead         = true;
      this.respawnTimer = this._respawnTime;
      this._body.setVisible(false);
      if (this._sprite?.active) this._sprite.sprite.setVisible(false);
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
    this._moveSpeedMult      = 1.0;
    this._attackDamageMult   = 1.0;
    this._attackDmgRevertEvt = null;
    this._attackTimer        = 1 / this.def.stats.attackRate;
    this._timeSinceDamage    = HERO_REGEN_DELAY;
    this.setPathPosition(0);
    if (this._sprite?.active) this._sprite.sprite.setVisible(true);
    else this._body.setVisible(true);
    this._redrawHpBar();
    const am = this.scene.game?.registry?.get('audio');
    if (am) am.playSfx('hero-respawn');
  }

  // Kills are still displayed by the inspect panel; they no longer drive levels.
  // Kill-count was the wrong metric once the hero started blocking: it can hold
  // a titan from full to 10% and score nothing because a tower lands the blow.
  _registerKill() {
    this.killCount++;
  }

  // `dealt` must be the POST-armour damage (Enemy.takeDamage's return value),
  // not the hero's raw attackDamage stat.
  _registerDamage(dealt) {
    if (!(dealt > 0)) return;
    this.damageDealt += dealt;
    const next = heroLevelForDamage(this.damageDealt, this._mapTotalHp, {
      startLevel: this._startLevel,
      maxLevel:   this.def.stats.maxLevel,
    });
    if (next === this.level) return;
    this.level = next;
    // A level-up must not leave the hero proportionally more wounded than it
    // was, so current hp rises by exactly the max-hp gained — never a full heal.
    const grownMaxHp = heroMaxHp(this.def.stats, this.level, this._modifiers);
    this.hp    = Math.min(grownMaxHp, this.hp + (grownMaxHp - this.maxHp));
    this.maxHp = grownMaxHp;
    this._redrawHpBar();
    this.scene.events.emit('hero:level-up', { level: this.level });
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

    this._timeSinceDamage += dt;
    if (this._timeSinceDamage >= HERO_REGEN_DELAY && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + HERO_REGEN_RATE * dt);
      this._redrawHpBar();
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
      this._sprite?.setState('move');
      this._sprite?.setFacing(this._facingX);
    }
    if (!this.moving) this._sprite?.setState('idle');

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
        const dmg = heroAttackDamage(this.def.stats, this.level) * this._attackDamageMult;
        const dealt = nearest.takeDamage(dmg, { source: heroSource(this.heroId) });
        if (this.def.onHit) this.def.onHit(this, nearest);
        if (nearest.dead) this._registerKill();
        this._registerDamage(dealt);
        const am = this.scene.game?.registry?.get('audio');
        if (am) am.playSfx('hero-attack');
        this._sprite?.setState('attack');
        this._attackTimer = 1 / this.def.stats.attackRate;
      }
    }
  }
}
