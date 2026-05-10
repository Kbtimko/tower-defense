export class Projectile {
  constructor({ x, y, target, damage, splashRadius = 0, pierce = false, slowFactor = 0, color = 0xffffff }) {
    this.x = x;
    this.y = y;
    this.target = target;             // Enemy instance (homing) or null (AoE)
    this.targetX = target.x;
    this.targetY = target.y;
    this.damage = damage;
    this.splashRadius = splashRadius;
    this.pierce = pierce;
    this.slowFactor = slowFactor;
    this.color = color;
    this.dead = false;
    this.speed = 280;                 // px/s
  }
}
