// Pure road-march arithmetic for barracks squads walking to a rally point.
// No Phaser: GameScene feeds in a path and a `blocked` predicate and gets back
// the new progress, so the stepping is unit-testable and shared with Task 5.
import { pointAtProgress, pathLength } from './pathGeometry.js';
import { soldierCanBlock, MELEE_RANGE } from './soldierCombat.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Advance one frame along the road toward `target`.
 * `blocked(point) -> boolean` is tested at the start point first, then at every
 * sub-step point; a long frame (200 ms cap x 2x speed) must not tunnel through
 * an enemy, hence sub-steps no longer than `substepPx` (< MELEE_RANGE).
 * Progress is a fraction of arc length, so px <-> progress goes via totalLength.
 */
export function marchStep({ progress, target, dt, speed, totalLength, substepPx, path, blocked }) {
  if (dt <= 0 || progress === target || totalLength <= 0) {
    return { progress, arrived: progress === target, halted: false, walkedPx: 0 };
  }
  if (blocked(pointAtProgress(path, progress))) {
    return { progress, arrived: false, halted: true, walkedPx: 0 };
  }

  const startPx = clamp01(progress) * totalLength;
  const targetPx = clamp01(target) * totalLength;
  const dir = targetPx >= startPx ? 1 : -1;
  const budget = speed * dt;
  const toGo = Math.abs(targetPx - startPx);
  const reach = Math.min(budget, toGo);

  let walked = 0;
  let halted = false;
  while (walked < reach) {
    // Final sub-step lands exactly on the budget end, never past it.
    walked = Math.min(reach, walked + substepPx);
    const p = clamp01((startPx + dir * walked) / totalLength);
    if (blocked(pointAtProgress(path, p))) { halted = true; break; }
  }

  // Land exactly on the target whenever the whole distance was walked, blocked or
  // not: recomputing from px can miss it by an ulp and strand the soldier "marching".
  const goal = clamp01(target);
  const next = walked === toGo ? goal : clamp01((startPx + dir * walked) / totalLength);
  return { progress: next, arrived: next === goal, halted, walkedPx: walked };
}

// R8: a soldier is held by a live enemy it can block within MELEE_RANGE.
// Corpses linger in the enemy list until the next sweep, so skip e.dead.
export function contactTest(soldier, enemies) {
  return (point) => enemies.some((e) =>
    !e.dead
    && soldierCanBlock(soldier, e)
    && Math.hypot(point.x - e.x, point.y - e.y) < MELEE_RANGE);
}

// In contact as if no disengage window were open — what an order checks to
// decide who needs one. Object.create reads every other field (and getter)
// through the soldier itself, so it can't drift from soldierCanBlock, and the
// soldier is never written.
export function isEngaged(soldier, enemies) {
  const probe = Object.create(soldier, { disengageLeftPx: { value: 0 } });
  return contactTest(probe, enemies)({ x: soldier.x, y: soldier.y });
}

export function isMarching(soldier, target) {
  return !soldier.dead && soldier.pathProgress !== target;
}

// Dots along the road from `from` to `to`, spaced by arc length (never the
// chord, which would cut corners). Spacing is stretched slightly so the last
// dot lands exactly on `to`.
export function routeDots(path, from, to, spacingPx) {
  const total = pathLength(path);
  const lenPx = Math.abs(to - from) * total;
  if (lenPx <= 0 || spacingPx <= 0) return [pointAtProgress(path, from)];
  // Even gaps of lenPx/round(lenPx/spacing) so the last dot hits `to`; this is
  // within 1 px of spacingPx only for routes >= 5 spacings (shorter ones round coarsely).
  const n = Math.max(1, Math.round(lenPx / spacingPx));
  const dots = [];
  for (let i = 0; i <= n; i++) {
    dots.push(pointAtProgress(path, i === n ? to : from + ((to - from) * i) / n));
  }
  return dots;
}

// Unit road tangent pointing toward `target` (toward lower progress when equal).
export function travelDir(path, progress, target) {
  const total = pathLength(path);
  if (!(total > 0)) return { x: -1, y: 0 };
  const sign = target > progress ? 1 : -1;
  const d = 1 / total; // one px of arc
  // a->b already runs in the travel direction (sampled one-sided); at a road end fall back to the other side.
  let a = progress;
  let b = clamp01(progress + sign * d);
  if (b === a) { b = progress; a = clamp01(progress - sign * d); }
  const pa = pointAtProgress(path, a);
  const pb = pointAtProgress(path, b);
  const vx = pb.x - pa.x;
  const vy = pb.y - pa.y;
  const len = Math.hypot(vx, vy);
  if (!(len > 0)) return { x: -1, y: 0 };
  return { x: vx / len, y: vy / len };
}
