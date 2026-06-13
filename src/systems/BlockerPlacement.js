import { SeededRandom } from './SeededRandom.js';

const OFFSET_PX = 70;          // distance from waypoint to blocker center
const JITTER_PX = 8;           // small random variance
const SCALE_MIN = 0.85;
const SCALE_MAX = 1.15;

/**
 * For every interior waypoint (a path bend), place one blocker on the
 * "outside" of the bend. The outside direction = the inward normal of
 * the bend, negated. This positions the blocker visually in the corner
 * the path is routing around.
 *
 * @param {{x:number,y:number}[]} pathPoints  pixel-coord waypoints
 * @param {string[]} vocab                    blocker type pool
 * @param {number} seed                       deterministic RNG seed
 * @returns {{type:string,x:number,y:number,scale:number}[]}
 */
export function computeBlockerPlacements(pathPoints, vocab, seed) {
  if (pathPoints.length < 3) return [];

  const rng = new SeededRandom(seed);
  const out = [];

  for (let i = 1; i < pathPoints.length - 1; i++) {
    const prev = pathPoints[i - 1];
    const here = pathPoints[i];
    const next = pathPoints[i + 1];

    // Direction vectors AT the bend (normalized).
    const inDx  = here.x - prev.x, inDy  = here.y - prev.y;
    const outDx = next.x - here.x, outDy = next.y - here.y;
    const inLen  = Math.hypot(inDx, inDy)  || 1;
    const outLen = Math.hypot(outDx, outDy) || 1;
    const inUx  = inDx  / inLen,  inUy  = inDy  / inLen;
    const outUx = outDx / outLen, outUy = outDy / outLen;

    // Bisector (sum of incoming reversed + outgoing) points into the
    // bend's interior. Negate to get the outside direction.
    const biX = inUx - outUx;
    const biY = inUy - outUy;
    const biLen = Math.hypot(biX, biY) || 1;
    let outsideX = biX / biLen;
    let outsideY = biY / biLen;

    // Straight segments (no real bend) — fall back to perpendicular.
    if (biLen < 0.05) {
      outsideX = -inUy;
      outsideY = inUx;
    }

    const jitterX = (rng.next() - 0.5) * 2 * JITTER_PX;
    const jitterY = (rng.next() - 0.5) * 2 * JITTER_PX;
    const scale   = SCALE_MIN + rng.next() * (SCALE_MAX - SCALE_MIN);

    out.push({
      type: rng.pick(vocab),
      x: here.x + outsideX * OFFSET_PX + jitterX,
      y: here.y + outsideY * OFFSET_PX + jitterY,
      scale,
    });
  }

  return out;
}
