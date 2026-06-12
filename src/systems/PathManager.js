import { samplePath, clampToBounds } from './pathGeometry.js';

export class PathManager {
  constructor(waypoints, towerSlots, canvasWidth, canvasHeight) {
    // Raw control points in pixel space — used by the renderer and blocker
    // placement (which key off path bends, not the dense samples).
    this.waypoints = waypoints.map(([nx, ny]) => ({ x: nx * canvasWidth, y: ny * canvasHeight }));
    // Dense sampled curve — what enemies, soldiers, targeting, and hover all
    // walk. Clamped so Catmull-Rom edge overshoot can't push enemies off-canvas.
    this.path = clampToBounds(samplePath(this.waypoints), canvasWidth, canvasHeight);
    this.buildZones = (towerSlots ?? []).map(([nx, ny]) => ({
      cx: nx * canvasWidth,
      cy: ny * canvasHeight,
      radius: 22,
      occupied: false,
    }));
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
        this.path[i + 1].y - this.path[i].y,
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
