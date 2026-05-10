export class Enemy {
  constructor({ def, scaleFactor = 1, startX, startY }) {
    this.def = def;
    this.x = startX;
    this.y = startY;
    this.waypointIndex = 0;
    this.maxHp = def.hp * scaleFactor;
    this.hp = this.maxHp;
    this.armor = def.armor;
    this.reward = def.reward;
    this.dead = false;
    this.statusEffects = {
      slow: { active: false, timer: 0, factor: 1 },
    };
  }

  get currentSpeed() {
    return this.statusEffects.slow.active
      ? this.def.speed * this.statusEffects.slow.factor
      : this.def.speed;
  }

  takeDamage(amount, pierce = false) {
    const armor = pierce ? 0 : this.armor;
    this.hp -= Math.max(1, amount - armor);
    if (this.hp <= 0) this.dead = true;
  }

  applyStatus({ type, duration, factor }) {
    if (type === 'slow') {
      this.statusEffects.slow = { active: true, timer: duration, factor };
    }
  }

  update(dt) {
    if (this.statusEffects.slow.active) {
      this.statusEffects.slow.timer -= dt;
      if (this.statusEffects.slow.timer <= 0) {
        this.statusEffects.slow = { active: false, timer: 0, factor: 1 };
      }
    }
  }
}
