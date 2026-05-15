export class PathManager {
  constructor(waypoints, canvasWidth, canvasHeight) {
    this.path = waypoints.map(([nx, ny]) => ({ x: nx * canvasWidth, y: ny * canvasHeight }));
    this.buildZones = this._computeZones(canvasWidth, canvasHeight);
  }

  _computeZones(w, h) {
    const zones = [];
    for (let i = 0; i < this.path.length - 1; i++) {
      const p1 = this.path[i], p2 = this.path[i + 1];
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;
      const px = -dy / len, py = dx / len;
      const offset = 56;
      for (const side of [1, -1]) {
        const cx = mx + px * offset * side;
        const cy = my + py * offset * side;
        if (cx > 30 && cx < w - 30 && cy > 30 && cy < h - 30 && !this.isOnPath(cx, cy, 40)) {
          zones.push({ cx, cy, radius: 22, occupied: false });
        }
      }
    }
    return zones;
  }

  isOnPath(x, y, margin = 40) {
    for (let i = 0; i < this.path.length - 1; i++) {
      const p1 = this.path[i], p2 = this.path[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;
      const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq));
      if (Math.hypot(p1.x + t * dx - x, p1.y + t * dy - y) < margin) return true;
    }
    return false;
  }

  getPathPoints() {
    return this.path;
  }

  getNearestPathProgress(x, y) {
    let totalLen = 0;
    const segLens = [];
    for (let i = 0; i < this.path.length - 1; i++) {
      const len = Math.hypot(
        this.path[i + 1].x - this.path[i].x,
        this.path[i + 1].y - this.path[i].y
      );
      segLens.push(len);
      totalLen += len;
    }
    if (totalLen === 0) return 0;
    let bestDist = Infinity, bestProgress = 0, accumulated = 0;
    for (let i = 0; i < this.path.length - 1; i++) {
      const p1 = this.path[i], p2 = this.path[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq));
      const cx = p1.x + t * dx, cy = p1.y + t * dy;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist < bestDist) {
        bestDist = dist;
        bestProgress = (accumulated + t * segLens[i]) / totalLen;
      }
      accumulated += segLens[i];
    }
    return bestProgress;
  }

  renderPath(gfx, pathColor) {
    if (this.path.length < 2) return;
    // Shadow
    gfx.lineStyle(34, 0x000000, 0.3);
    gfx.beginPath();
    gfx.moveTo(this.path[0].x, this.path[0].y);
    for (let i = 1; i < this.path.length; i++) gfx.lineTo(this.path[i].x, this.path[i].y);
    gfx.strokePath();
    // Path surface
    gfx.lineStyle(28, pathColor, 1);
    gfx.beginPath();
    gfx.moveTo(this.path[0].x, this.path[0].y);
    for (let i = 1; i < this.path.length; i++) gfx.lineTo(this.path[i].x, this.path[i].y);
    gfx.strokePath();
  }

  getPathPoints() {
    return this.path;
  }

  getNearestPathProgress(x, y) {
    let totalLen = 0;
    const segLens = [];
    for (let i = 0; i < this.path.length - 1; i++) {
      const len = Math.hypot(
        this.path[i + 1].x - this.path[i].x,
        this.path[i + 1].y - this.path[i].y
      );
      segLens.push(len);
      totalLen += len;
    }
    if (totalLen === 0) return 0;
    let bestDist = Infinity, bestProgress = 0, accumulated = 0;
    for (let i = 0; i < this.path.length - 1; i++) {
      const p1 = this.path[i], p2 = this.path[i + 1];
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1,
        ((x - p1.x) * dx + (y - p1.y) * dy) / lenSq));
      const cx = p1.x + t * dx, cy = p1.y + t * dy;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist < bestDist) {
        bestDist = dist;
        bestProgress = (accumulated + t * segLens[i]) / totalLen;
      }
      accumulated += segLens[i];
    }
    return bestProgress;
  }
}
