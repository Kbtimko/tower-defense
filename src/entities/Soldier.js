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

// The Graphics fallback body has no radius; 9 keeps the no-art bar's top edge at
// y=-17, just over the drawn head, where it always sat.
const FALLBACK_BAR_RADIUS = 9;

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
      category: 'soldier', type: 'default', initialState: 'idle',
    });
    if (this._sprite.active) this._body.setVisible(false);
    this.setPathProgress(pathProgress, pathPoints);
  }

  _drawBody() {
    this._body.clear();
    this._body.fillStyle(0x4caf50, 1);
    this._body.fillCircle(0, -8, 4);
    this._body.fillRect(-3, -4, 6, 8);
    this._body.lineStyle(1, 0x81c784, 1);
    this._body.strokeCircle(0, -8, 4);
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
    if (this._sprite?.active) this._sprite.sprite.setVisible(true);
    else this._body.setVisible(true);
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
    // Travel tangent while marching, upstream (where enemies come from) at rest (S4).
    const dir = travelDir(this.pathPoints, this.pathProgress, this.barracks.soldierPathProgress);
    const size = this._sprite?.active ? this._sprite.getDisplaySize() : null;
    const spacing = size ? SOLDIER_FORMATION.spacingFrac * size.width : SOLDIER_FORMATION.fallbackSpacingPx;
    const squad = this.barracks.soldiers;
    const offset = formationOffsets(squad.length, dir, spacing, SOLDIER_FORMATION.flankBackFrac)[squad.indexOf(this)];

    this._walkS = walking ? this._walkS + dt : 0;
    const bob = walking && !reducedMotion
      ? WALK_BOB.amplitudePx * Math.sin(2 * Math.PI * WALK_BOB.hz * this._walkS)
      : 0;
    this._view.x = offset.dx;
    this._view.y = offset.dy + bob;

    // Re-asserted every frame, as Hero does, so 'move' resumes after an attack one-shot.
    this._sprite?.setState(walking ? 'move' : 'idle');
    // The tangent is a unit vector; scale it to the px covered by one sub-step so
    // the pixel deadzone keeps a near-vertical road from mirroring the art.
    this._sprite?.setFacing(facingDirX(dir.x * SOLDIER_MARCH.substepPx));
  }
}
