export class Projectile {
  constructor({ x, y, target, damage, splashRadius = 0, pierce = false, slowFactor = 0, color = 0xffffff }) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.targetX = target ? target.x : x;
    this.targetY = target ? target.y : y;
    this.damage = damage;
    this.splashRadius = splashRadius;
    this.pierce = pierce;
    this.slowFactor = slowFactor;
    this.color = color;
    this.dead = false;
    this.speed = 280;                 // px/s
  }
}
