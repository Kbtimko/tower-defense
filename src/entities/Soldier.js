import Phaser from 'phaser';
import { EntitySprite } from '../systems/EntitySprite.js';
import { unitDepth } from '../systems/grounding.js';
import { pointAtProgress, pathLength } from '../systems/pathGeometry.js';
import { drawUnitHpBar } from '../systems/hpBar.js';
import {
  SOLDIER_ATTACK_RATE, soldierMaxHp, soldierRespawnDuration, damageSoldier, tickSoldier,
} from '../systems/soldierCombat.js';
import { marchStep, contactTest, isMarching, travelDir } from '../systems/soldierMarch.js';
import { formationOffsets } from '../systems/soldierFormation.js';
import { facingDirX } from '../systems/facing.js';
import { SOLDIER_MARCH, SOLDIER_FORMATION, WALK_BOB } from '../data/soldiers.js';
import { tierVariant } from '../systems/spriteKeys.js';
import { TIER_SCALE, SOLDIER_FALLBACK_BODY, SOLDIER_SHIELD } from '../data/tierLooks.js';
import { getSpriteConfig } from '../data/sprites.js';
import { hexToInt, mixHex } from '../ui/theme.js';

// The Graphics fallback body has no radius; 9 keeps the no-art bar's top edge at
// y=-17, just over the drawn head, where it always sat.
const FALLBACK_BAR_RADIUS = 9;
// Bottom of the fallback body's drawn rect: its foot, the pivot it grows from (P4).
const FALLBACK_FOOT_Y = 4;

// The mockup's kite polygon as fractions of the shield's width and height.
const SHIELD_KITE = [[0.5, 0], [1, 0.18], [0.92, 0.7], [0.5, 1], [0.08, 0.7], [0, 0.18]];

export class Soldier extends Phaser.GameObjects.Container {
  constructor(scene, { barracks, pathProgress, pathPoints, soldierStats, modifiers = {} }) {
    super(scene, 0, 0);

    const maxHp = soldierMaxHp(soldierStats, modifiers);
    this.barracks        = barracks;
    this.pathProgress    = pathProgress;
    this.hp              = maxHp;
    this.maxHp           = maxHp;
    this.damage          = soldierStats.damage;
    this.respawnDuration = soldierRespawnDuration(soldierStats, modifiers);
    this.canBlockFlyers  = soldierStats.canBlockFlyers;
    this.attackRate      = SOLDIER_ATTACK_RATE;
    this.attackTimer     = 0;
    this.dead            = false;
    this.respawnTimer    = 0;
    this.pathPoints      = pathPoints;
    this.totalLength     = pathLength(pathPoints);
    this.disengageLeftPx = 0;
    this._walkS          = 0; // seconds spent walking this march, drives the bob phase
    this._offset         = null; // eased formation offset; null until the first layout
    this._layoutKey      = null; // inputs the cached target offset was computed from

    // Read once (C7): an upgrade rebuilds the squad, and respawn reuses this
    // object, so the look carries over without re-reading the barracks.
    const config = getSpriteConfig('soldier', 'default');
    this._variant   = tierVariant(barracks.level, barracks.branch);
    this._tierScale = TIER_SCALE.soldier[this._variant];
    // Last non-zero facing; the unflipped art faces its manifest baseFacing.
    this._faceSign  = config?.baseFacing === 'left' ? -1 : 1;

    // Everything drawn lives in _view so the formation offset and bob move only
    // the picture; this container stays on the logical road point that
    // blocking, the repair heal and the depth sort all read.
    this._view  = new Phaser.GameObjects.Container(scene, 0, 0);
    this._body  = scene.add.graphics();
    this._hpBar = scene.add.graphics();
    this._view.add([this._body, this._hpBar]);
    this.add(this._view);
    scene.add.existing(this);
    // Y-sorted inside the unit band so a lower unit draws in front.
    this.setDepth(unitDepth(this.y));

    this._drawBody();
    this._sprite = new EntitySprite(this._view, scene, {
      category: 'soldier', type: 'default', initialState: 'idle', variant: this._variant,
    });
    this._sprite.setTierScale(this._tierScale);
    if (this._sprite.active) this._body.setVisible(false);
    // Real Vanguard art is expected to carry its own shield (S9).
    this._shield = this._variant === SOLDIER_SHIELD.variant && !config?.variants?.[SOLDIER_SHIELD.variant]
      ? this._makeShield(scene)
      : null;
    this.setPathProgress(pathProgress, pathPoints);
  }

  _drawBody() {
    const { fill, stroke } = SOLDIER_FALLBACK_BODY[this._variant];
    const s = this._tierScale;
    this._body.clear();
    this._body.fillStyle(fill, 1);
    this._body.fillCircle(0, -8, 4);
    this._body.fillRect(-3, -4, 6, 8);
    this._body.lineStyle(1, stroke, 1);
    this._body.strokeCircle(0, -8, 4);
    this._body.setScale(s);
    this._body.y = (1 - s) * FALLBACK_FOOT_Y; // keeps the foot where it was (S10)
  }

  // Drawn with its bottom-centre on the origin so position and scale pivot at the foot.
  _makeShield(scene) {
    const { w, h, top, bottom, outline, footLiftPx } = SOLDIER_SHIELD;
    const pts = SHIELD_KITE.map(([fx, fy]) => ({ x: (fx - 0.5) * w, y: (fy - 1) * h, t: fy }));
    const colour = (p) => hexToInt(mixHex(top, bottom, p.t));
    const g = scene.add.graphics();
    // WebGL colours a fillPoints polygon per earcut triangle by vertex order, not
    // by height, so a gradient over it comes out patchy. A fan of triangles
    // with each vertex sampled from the gradient renders it exactly.
    for (let i = 1; i < pts.length - 1; i++) {
      const [a, b, c] = [pts[0], pts[i], pts[i + 1]];
      g.fillGradientStyle(colour(a), colour(b), colour(c), colour(c), 1);
      g.fillTriangle(a.x, a.y, b.x, b.y, c.x, c.y);
    }
    g.lineStyle(1, hexToInt(outline), 1);
    g.strokePoints(pts, true, true);
    const foot = this._sprite.active ? this._sprite.groundSpec().footY : FALLBACK_FOOT_Y;
    g.setPosition(0, foot - footLiftPx);
    this._view.addAt(g, this._view.getIndex(this._hpBar)); // over the body, under the HP bar
    this._faceShield(g);
    return g;
  }

  // The shield sits on the soldier's front, so it mirrors with the facing (E19, E20).
  _faceShield(g) {
    g.setPosition(SOLDIER_SHIELD.dx * this._faceSign, g.y);
    g.setScale(this._tierScale * this._faceSign, this._tierScale);
  }

  lookSnapshot() {
    return {
      level: this.barracks.level, branch: this.barracks.branch,
      key: this._sprite.resolvedKey('idle'), scale: this._tierScale,
      shield: !!this._shield && this._shield.visible, dead: this.dead,
    };
  }

  _redrawHpBar() {
    drawUnitHpBar(this._hpBar, {
      radius: FALLBACK_BAR_RADIUS, size: this._sprite?.getDisplaySize?.() ?? null,
      hp: this.hp, maxHp: this.maxHp, color: 0x4caf50,
    });
  }

  setPathProgress(progress, pathPoints) {
    this.pathProgress = progress;
    const { x, y } = pointAtProgress(pathPoints, progress);
    this.x = x;
    this.y = y;
  }

  takeDamage(amount) {
    if (this.dead) return;
    if (damageSoldier(this, amount)) {
      this.disengageLeftPx = 0;
      this._body.setVisible(false);
      if (this._sprite?.active) this._sprite.sprite.setVisible(false);
      this._shield?.setVisible(false); // never floats over a dead soldier (R16b)
      this._hpBar.clear();
      return;
    }
    this._redrawHpBar();
  }

  // Back at the current rally point, not where it fell (R10).
  respawn() {
    this.setPathProgress(this.barracks.soldierPathProgress, this.pathPoints);
    this.dead         = false;
    this.hp           = this.maxHp;
    this.respawnTimer = 0;
    // Snap into the rest slot like a fresh spawn; easing from the slot it fell
    // in would slide a just-respawned soldier across the formation.
    this._offset = null;
    if (this._sprite?.active) this._sprite.sprite.setVisible(true);
    else this._body.setVisible(true);
    this._shield?.setVisible(true);
    this._redrawHpBar();
  }

  heal() {
    if (this.dead) return;
    this.hp = this.maxHp;
    this._redrawHpBar();
  }

  drawnPosition() {
    return { x: this.x + this._view.x, y: this.y + this._view.y };
  }

  // Defaults keep the bare update(dt) call shape working: no enemies, full motion.
  update(dt, enemies = [], { reducedMotion = false } = {}) {
    if (tickSoldier(this, dt)) this.respawn();
    const walking = this._march(dt, enemies);
    this._layout(dt, walking, reducedMotion);
    this.setDepth(unitDepth(this.y));
  }

  // Returns true while the soldier is actually walking (not halted, not arrived).
  _march(dt, enemies) {
    const target = this.barracks.soldierPathProgress;
    let walking = false;
    if (isMarching(this, target)) {
      // Fast path only: soldierCanBlock (inside contactTest) is the authority and
      // already refuses while disengaging; this just skips the enemy scan.
      const blocked = this.disengageLeftPx > 0 ? () => false : contactTest(this, enemies);
      const step = marchStep({
        progress: this.pathProgress, target, dt,
        speed: SOLDIER_MARCH.speed, totalLength: this.totalLength,
        substepPx: SOLDIER_MARCH.substepPx, path: this.pathPoints, blocked,
      });
      this.setPathProgress(step.progress, this.pathPoints);
      this.disengageLeftPx = Math.max(0, this.disengageLeftPx - step.walkedPx);
      walking = !step.arrived && !step.halted;
    }
    // Arrived (or never ordered off this spot): a leftover window would stop it blocking forever.
    if (!isMarching(this, target)) this.disengageLeftPx = 0;
    return walking;
  }

  _layout(dt, walking, reducedMotion) {
    const layout = this._targetLayout();
    const dir = layout.dir;

    // Linear move-toward at 2|offset|/turnMs: a full reversal (the largest
    // change a rigid formation can make, offset -> -offset) lands in exactly
    // turnMs, and smaller swings sooner. The first layout, reduced motion and a
    // stray soldier (no slot, zero offset, so no rate to ease at) snap.
    const to = layout.offset;
    if (!this._offset || reducedMotion || layout.index < 0) {
      this._offset = { dx: to.dx, dy: to.dy };
    } else {
      const ex = to.dx - this._offset.dx;
      const ey = to.dy - this._offset.dy;
      const gap = Math.hypot(ex, ey);
      const maxStep = (2 * Math.hypot(to.dx, to.dy) * dt * 1000) / SOLDIER_FORMATION.turnMs;
      if (gap <= maxStep) this._offset = { dx: to.dx, dy: to.dy };
      else this._offset = { dx: this._offset.dx + (ex / gap) * maxStep, dy: this._offset.dy + (ey / gap) * maxStep };
    }

    this._walkS = walking ? this._walkS + dt : 0;
    const bob = walking && !reducedMotion
      ? WALK_BOB.amplitudePx * Math.sin(2 * Math.PI * WALK_BOB.hz * this._walkS)
      : 0;
    this._view.x = this._offset.dx;
    this._view.y = this._offset.dy + bob;

    // Re-asserted every frame, as Hero does, so 'move' resumes after an attack one-shot.
    this._sprite?.setState(walking ? 'move' : 'idle');
    // The tangent is a unit vector; scale it to the px covered by one sub-step so
    // the pixel deadzone keeps a near-vertical road from mirroring the art.
    const face = facingDirX(dir.x * SOLDIER_MARCH.substepPx);
    if (face !== 0) this._faceSign = Math.sign(face);
    this._sprite?.setFacing(face);
    if (this._shield) this._faceShield(this._shield);
  }

  // Heading and formation slot, recomputed only when an input changes: at rest
  // nothing does, so an idle squad skips the path walk in travelDir every frame.
  _targetLayout() {
    const target = this.barracks.soldierPathProgress;
    const size = this._sprite?.active ? this._sprite.getDisplaySize() : null;
    const spacing = size ? SOLDIER_FORMATION.spacingFrac * size.width : SOLDIER_FORMATION.fallbackSpacingPx;
    const squad = this.barracks.soldiers;
    const index = squad.indexOf(this);
    const k = this._layoutKey;
    if (k && k.progress === this.pathProgress && k.target === target && k.spacing === spacing
        && k.count === squad.length && k.index === index) return k;
    // Travel tangent while marching, upstream (where enemies come from) at rest (S4).
    const dir = travelDir(this.pathPoints, this.pathProgress, target);
    // A soldier missing from its squad list draws on its road point rather than throwing.
    const offset = index < 0
      ? { dx: 0, dy: 0 }
      : formationOffsets(squad.length, dir, spacing, SOLDIER_FORMATION.flankBackFrac)[index];
    this._layoutKey = { progress: this.pathProgress, target, spacing, count: squad.length, index, dir, offset };
    return this._layoutKey;
  }
}
