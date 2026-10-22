import Phaser from 'phaser';
import { computeDamage } from '../systems/damage.js';
import { armourAbsorption } from '../systems/armourLegibility.js';
import { SFX_KEYS } from '../systems/AudioManager.js';
import { enemyHitSfxKey } from '../systems/sfxKeys.js';
import { EntitySprite } from '../systems/EntitySprite.js';
import { unitDepth } from '../systems/grounding.js';
import { hpBarFillWidth, hpBarGeometry } from '../systems/hpBar.js';
import { squashScale, statusTint } from '../systems/hitFx.js';
import { HIT_SQUASH, STATUS_FX, STATUS_DRAW } from '../data/fx.js';

// Long enough to read at 1x, short enough not to smear at 2x (update() is fed
// speed-scaled dt, so the flash keeps pace with the rest of the sim).
const HIT_FLASH_DURATION = 0.12;

export class Enemy extends Phaser.GameObjects.Container {
  constructor(scene, { def, scaleFactor = 1, startX, startY }) {
    super(scene, startX, startY);

    this.def           = def;
    // Index into PathManager.path — the DENSE sampled curve (~12 points per
    // waypoint span), not the raw waypoints. Only compared ordinally.
    this.waypointIndex = 0;
    this.maxHp         = def.hp * scaleFactor;
    this.hp            = this.maxHp;
    this.armor         = def.armor;
    this.reward        = def.reward;
    this.dead          = false;
    this.statusEffects = {
      slow:       { active: false, timer: 0, factor: 1 },
      stun:       { active: false, timer: 0 },
      burn:       { active: false, timer: 0, dps: 0, tickAccum: 0 },
      vulnerable: { active: false, timer: 0, multiplier: 1 },
    };
    // The only hit feedback that does not depend on how big the hit was.
    this.hitFlash = { active: false, timer: 0 };
    // Plain number fields so squash / orbit / ember animation allocates nothing per frame.
    this._squashing  = false;
    this._squashT    = 0;
    this._starAngle  = 0;
    this._statusAcc  = 0;
    this._starCy     = 0; // orbit centre y, set from the art's top when a stun starts

    this._body    = scene.add.graphics();
    this._flash   = scene.add.graphics();  // hit flash — over the body, under the rings
    this._overlay = scene.add.graphics();  // status rings — always visible
    // Created once and cleared/redrawn per frame only while stunned.
    this._stars   = scene.add.graphics().setVisible(false);
    this._hpBar   = scene.add.graphics();
    this.add([this._body, this._flash, this._overlay, this._stars, this._hpBar]);
    scene.add.existing(this);
    // Y-sorted inside the unit band so a lower unit draws in front.
    this.setDepth(unitDepth(this.y));
    this._redrawBody();
    this._redrawStatusOverlay();
    this._redrawHpBar();

    this._sprite = new EntitySprite(this, scene, {
      category: 'enemy', type: def.type, initialState: 'move', flying: !!def.flying,
    });
    if (this._sprite.active) this._body.setVisible(false);
  }

  // A death animation only exists once death art is registered; otherwise the
  // scene keeps the alpha-fade fallback.
  hasDeathAnimation() {
    return Boolean(this._sprite?.hasState('death'));
  }

  // Plays the one-shot death frames, dropping the HP bar and status rings so
  // only the corpse animates.
  playDeathAnimation(onComplete) {
    this._hpBar.setVisible(false);
    this._overlay.setVisible(false);
    this._stars.setVisible(false);
    this._sprite.setBaseTint(null); // a corpse must not play its death frames slow-blue / burn-orange
    this._endSquash();
    this._clearHitFlash();
    this._flash.setVisible(false);
    this._sprite.playOnce('death', onComplete);
  }

  get currentSpeed() {
    return this.statusEffects.slow.active
      ? this.def.speed * this.statusEffects.slow.factor
      : this.def.speed;
  }

  update(dt) {
    this.setDepth(unitDepth(this.y));
    if (this.hitFlash.active) {
      this.hitFlash.timer -= dt;
      if (this.hitFlash.timer <= 0) this.hitFlash = { active: false, timer: 0 };
      this._applyHitFlash(); // the run-out pass is what clears the tint
    }
    if (this._squashing) this._advanceSquash(dt);
    if (this.statusEffects.slow.active) {
      this.statusEffects.slow.timer -= dt;
      if (this.statusEffects.slow.timer <= 0) {
        this.statusEffects.slow = { active: false, timer: 0, factor: 1 };
        this._refreshStatusVisuals();
      }
    }
    if (this.statusEffects.stun.active) {
      this.statusEffects.stun.timer -= dt;
      if (this.statusEffects.stun.timer <= 0) {
        this.statusEffects.stun = { active: false, timer: 0 };
        this._refreshStatusVisuals();
      } else {
        this._drawStars(dt);
      }
    }
    if (this.statusEffects.burn.active) {
      this.statusEffects.burn.timer -= dt;
      this.statusEffects.burn.tickAccum += dt;
      while (this.statusEffects.burn.tickAccum >= 1 && this.statusEffects.burn.active) {
        this.statusEffects.burn.tickAccum -= 1;
        this.takeDamage(this.statusEffects.burn.dps, { source: { kind: 'status', type: 'burn' } });
      }
      if (this.statusEffects.burn.timer <= 0) {
        this.statusEffects.burn = { active: false, timer: 0, dps: 0, tickAccum: 0 };
        this._refreshStatusVisuals();
      } else if (!this.dead) {
        this.scene.particleSpawner?.emitStatus('burn', this, dt);
      }
    }
    if (this.statusEffects.vulnerable.active) {
      this.statusEffects.vulnerable.timer -= dt;
      if (this.statusEffects.vulnerable.timer <= 0) {
        this.statusEffects.vulnerable = { active: false, timer: 0, multiplier: 1 };
      }
    }
  }

  takeDamage(amount, opts = false) {
    // Back-compat: callers used to pass `pierce` as a bare boolean.
    const optsObj = (opts && typeof opts === 'object') ? opts : { pierce: Boolean(opts) };
    const vulnMult = this.statusEffects.vulnerable.active ? this.statusEffects.vulnerable.multiplier : 1;
    const dmg = computeDamage({
      amount,
      armor: this.armor,
      pierce: optsObj.pierce,
      source: optsObj.source,
      enemyType: this.def.type,
      vulnerableMult: vulnMult,
    });
    this.hp -= dmg;
    const justDied = this.hp <= 0 && !this.dead;
    if (this.hp <= 0) { this.hp = 0; this.dead = true; }
    this._redrawHpBar();
    // A corpse keeps whatever tint it had: once dead it leaves `enemies` and
    // stops being updated, so a flash lit here would ride out the death fade.
    // The kill has its own particles, sfx and death anim to sell the hit.
    if (this.dead) { this._clearHitFlash(); this._endSquash(); }
    else           this._triggerHitFlash();

    const am = this.scene.game?.registry?.get('audio');
    if (am) am.playSfx(enemyHitSfxKey(this.def.type, SFX_KEYS), { detune: (Math.random() - 0.5) * 100 });
    // Both the raw amount and the armour that ate it are in hand here, so the
    // overlay can be told WHY a hit was small without a second event or a
    // second copy of the arithmetic. Only a 'tower' source (towers plus
    // barracks soldiers, see soldierSource()) is something the tower panel's
    // "Armour absorbs" line can actually explain — banding a status DoT
    // (Pyro's burn/firefield) or a hero attack would spam a 🛡 marker the
    // player can't trace to anything they built. getWeaknessMultiplier
    // already special-cases source.kind === 'status'; this follows the same
    // precedent rather than inventing a new rule.
    const band = optsObj.source?.kind === 'tower'
      ? armourAbsorption({ amount, armor: this.armor, pierce: optsObj.pierce }).band
      : 'none';
    this.scene.events.emit('damage-dealt', {
      target: this,
      amount: dmg,
      isAoe:  optsObj.isAoe  ?? false,
      abilityLabel: optsObj.abilityLabel ?? null,
      absorbedBand: band,
    });

    if (justDied) {
      const t = this.def?.type;
      const isLarge = t === 'brute' || t === 'titan';
      if (am) am.playSfx(isLarge ? 'enemy-death-large' : 'enemy-death-small');
      if (t === 'titan') this.scene.events.emit('boss-died', { bossType: t });
    }

    // The POST-armour number. `amount` is the attacker's raw stat, and flat
    // armour subtraction makes the two differ by an order of magnitude on a
    // titan — so anything scoring damage (hero XP) must read this, not `amount`.
    return dmg;
  }

  applyStatus({ type, duration, factor, dps, multiplier }) {
    // Visuals only change when a status starts; a refresh of a running one
    // just resets its timer, so skip the redraw (and its point-array allocs).
    if (type === 'slow') {
      const started = !this.statusEffects.slow.active;
      this.statusEffects.slow = { active: true, timer: duration, factor };
      if (started) this._refreshStatusVisuals();
    }
    if (type === 'stun') {
      const started = !this.statusEffects.stun.active;
      this.statusEffects.stun = { active: true, timer: duration };
      if (started) this._refreshStatusVisuals();
    }
    if (type === 'burn') {
      const existing = this.statusEffects.burn;
      const newDps = existing.active ? Math.max(existing.dps, dps) : dps;
      this.statusEffects.burn = { active: true, timer: duration, dps: newDps, tickAccum: existing.active ? existing.tickAccum : 0 };
      if (!existing.active) this._refreshStatusVisuals();
    }
    if (type === 'vulnerable') {
      this.statusEffects.vulnerable = { active: true, timer: duration, multiplier };
    }
  }

  // Restarted rather than extended, so a burst of hits reads as one bright
  // flash instead of a slowly-brightening one.
  _triggerHitFlash() {
    this.hitFlash = { active: true, timer: HIT_FLASH_DURATION };
    this._applyHitFlash();
    this._squashing = true;
    this._squashT   = 0;
  }

  // Squash plays on the sprite only; with no art, setSquash is a no-op and the
  // Graphics body keeps the disc flash as its hit read.
  _advanceSquash(dt) {
    this._squashT += dt;
    if (this._squashT >= HIT_SQUASH.duration) { this._endSquash(); return; }
    const s = squashScale(this._squashT, HIT_SQUASH);
    this._sprite?.setSquash(s.x, s.y); // copy now: squashScale returns a shared object
  }

  _endSquash() {
    if (!this._squashing) return;
    this._squashing = false;
    this._sprite?.setSquash(1, 1);
  }

  _clearHitFlash() {
    this.hitFlash = { active: false, timer: 0 };
    this._applyHitFlash();
  }

  // A sprite flashes as a solid silhouette; the Graphics fallback has no
  // silhouette to tint, so it gets a fading disc over the body it draws.
  _applyHitFlash() {
    this._flash.clear();
    if (this._sprite?.active) {
      this._sprite.setFlash(this.hitFlash.active);
      return;
    }
    if (!this.hitFlash.active) return;
    this._flash.fillStyle(0xffffff, 0.7 * (this.hitFlash.timer / HIT_FLASH_DURATION));
    this._flash.fillCircle(0, 0, this.def.radius * 1.05);
  }

  _redrawBody() {
    const r = this.def.radius;
    this._body.clear();

    // Drop shadow
    this._body.fillStyle(0x000000, 0.25);
    this._body.fillEllipse(0, r + 2, r * 1.5, 6);

    const t = this.def.type;
    if (t === 'drone') {
      this._body.fillStyle(this.def.color, 0.2);
      this._body.fillPoints(this._hexPoints(r * 1.5), true);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r), true);
    } else if (t === 'skitter') {
      this._body.fillStyle(this.def.color, 0.2);
      this._body.fillEllipse(0, 0, r * 2.8, r * 2.0);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._diamondPoints(r * 1.4, r), true);
      this._body.lineStyle(1.5, this.def.color, 0.8);
      for (const [lx, ly] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        this._body.lineBetween(lx * r * 0.6, ly * r * 0.5, lx * r * 1.2, ly * r * 1.1);
      }
    } else if (t === 'brute') {
      this._body.fillStyle(this.def.color, 0.15);
      this._body.fillPoints(this._hexPoints(r * 1.3), true);
      this._body.fillStyle(0x334433, 1);
      this._body.fillPoints(this._hexPoints(r), true);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r * 0.65), true);
    } else if (t === 'phantom') {
      this._body.fillStyle(this.def.color, 0.15);
      this._body.fillCircle(0, 0, r * 1.8);
      this._body.lineStyle(2, this.def.color, 0.7);
      this._body.strokeCircle(0, 0, r * 1.4);
      this._body.fillStyle(this.def.color, 0.9);
      this._body.fillCircle(0, 0, r * 0.6);
    } else if (t === 'titan') {
      this._body.fillStyle(0x1a0000, 1);
      this._body.fillPoints(this._hexPoints(r), true);
      this._body.fillStyle(0x660000, 1);
      this._body.fillPoints(this._hexPoints(r * 0.72), true);
      this._body.fillStyle(this.def.color, 1);
      this._body.fillPoints(this._hexPoints(r * 0.44), true);
    } else {
      this._body.fillStyle(this.def.color, 1);
      this._body.fillCircle(0, 0, r);
    }
  }

  // Single entry point when a status starts or ends: tint, static overlay and
  // the orbiting stars' visibility all follow the same state.
  _refreshStatusVisuals() {
    this._sprite?.setBaseTint(statusTint(this.statusEffects));
    this._redrawStatusOverlay();
    const stunned = this.statusEffects.stun.active;
    if (stunned) this._starCy = this._starCentreY();
    this._stars.setVisible(stunned);
    if (!stunned) this._stars.clear();
  }

  _redrawStatusOverlay() {
    const r = this.def.radius;
    const t = this.def.type;
    this._overlay.clear();
    if (this.statusEffects.slow.active) {
      this._overlay.lineStyle(2, 0x00eeff, 1);
      if (t === 'drone' || t === 'brute') {
        this._overlay.strokePoints(this._hexPoints(r + 2), true);
      } else if (t === 'skitter') {
        this._overlay.strokePoints(this._diamondPoints(r * 1.4 + 2, r + 2), true);
      } else {
        this._overlay.strokeCircle(0, 0, r + 2);
      }
    }
    if (this.statusEffects.slow.active) this._drawCrystals(r + 2);
  }

  // Frost shards pointing outward from the ring, positions computed in place.
  _drawCrystals(ringR) {
    const { inner, length, halfWidth, alpha, phase } = STATUS_DRAW.crystal;
    const n = STATUS_FX.slow.crystals;
    this._overlay.fillStyle(STATUS_FX.slow.tint, alpha);
    for (let i = 0; i < n; i++) {
      const a  = (Math.PI * 2 * i) / n + phase;
      const ux = Math.cos(a), uy = Math.sin(a);
      const bx = ux * (ringR + inner), by = uy * (ringR + inner);
      this._overlay.fillTriangle(
        bx - uy * halfWidth, by + ux * halfWidth,
        bx + uy * halfWidth, by - ux * halfWidth,
        bx + ux * length,    by + uy * length,
      );
    }
  }

  // Stars ride above the HP bar, which is already laid out from the rendered
  // art (def.radius is only the Graphics fallback), so they clear tall sprites.
  _starCentreY() {
    const size = this._sprite?.getDisplaySize?.() ?? null;
    const { top } = hpBarGeometry(this.def.radius, size?.width, size?.height);
    return top - STATUS_DRAW.star.lift;
  }

  // Each star is two overlapping triangles (up + down). Orbits on a flattened
  // ellipse above the head so it reads as stars circling in perspective.
  _drawStars(dt) {
    const { size, orbitRatio, squash, tail } = STATUS_DRAW.star;
    const { stars, spin, color } = STATUS_FX.stun;
    const orbit = this.def.radius * orbitRatio;
    this._starAngle += spin * dt;
    this._stars.clear();
    this._stars.fillStyle(color, 1);
    for (let i = 0; i < stars; i++) {
      const a  = this._starAngle + (Math.PI * 2 * i) / stars;
      const cx = Math.cos(a) * orbit;
      const cy = this._starCy + Math.sin(a) * orbit * squash;
      this._stars.fillTriangle(cx, cy - size, cx - size, cy + size * tail, cx + size, cy + size * tail);
      this._stars.fillTriangle(cx, cy + size, cx - size, cy - size * tail, cx + size, cy - size * tail);
    }
  }

  _redrawHpBar() {
    const size = this._sprite?.getDisplaySize?.() ?? null;
    const { width: bw, x: bx, top: by } = hpBarGeometry(this.def.radius, size?.width, size?.height);
    const bh  = 4;
    const pct = this.hp / this.maxHp;
    this._hpBar.clear();
    this._hpBar.fillStyle(0x000000, 0.55);
    this._hpBar.fillRect(bx - 1, by - 1, bw + 2, bh + 2); // outline: terrain varies, the bar must not
    this._hpBar.fillStyle(0x222222, 1);
    this._hpBar.fillRect(bx, by, bw, bh);
    this._hpBar.fillStyle(pct > 0.5 ? 0x2ecc40 : pct > 0.25 ? 0xf39c12 : 0xe74c3c, 1);
    this._hpBar.fillRect(bx, by, hpBarFillWidth(this.hp, this.maxHp, bw), bh);
  }

  _hexPoints(r) {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
  }

  _diamondPoints(w, h) {
    return [{ x: 0, y: -h }, { x: w / 2, y: 0 }, { x: 0, y: h }, { x: -w / 2, y: 0 }];
  }
}
