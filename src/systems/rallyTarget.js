import { pointAtProgress } from './pathGeometry.js';

// Snap a tap onto the road and judge it. onRoad uses `<` to agree with
// PathManager.isOnPath; inRange uses `<=` so a point exactly at range is legal.
// `range` is passed in (barracks.range carries the meta range multiplier).
export function resolveRallyTarget({ x, y, pathMgr, centre, range, tapRadius }) {
  const progress = pathMgr.getNearestPathProgress(x, y);
  const point = pointAtProgress(pathMgr.getPathPoints(), progress);
  const onRoad = Math.hypot(x - point.x, y - point.y) < tapRadius;
  const inRange = Math.hypot(point.x - centre.x, point.y - centre.y) <= range;
  return { progress, point, onRoad, inRange, valid: onRoad && inRange };
}
