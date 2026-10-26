import { MAPS } from '../data/maps.js';
import { ARRIVAL } from '../data/worldMap.js';
import { frontierIndex } from './campaignProgress.js';

const NONE = { kind: 'none', mapId: null, toId: null, newStars: 0, prevStars: 0 };

export function easeInOut(t) {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function span(t, start, len) {
  return easeInOut((t - start) / len);
}

function count(n) {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

// `stars` is the post-win saved array. A first clear only advances when that
// mission was the frontier before the win, so a gap save never moves the ship.
export function planArrival({ from, stars }) {
  if (!from || from.result !== 'victory') return NONE;
  const { mapId } = from;
  if (!Number.isInteger(mapId) || mapId < 0 || mapId >= MAPS.length) return NONE;
  const prevStars = count(from.prevStars);
  const earned = count(from.stars);
  if (earned <= prevStars) return NONE;
  const newStars = earned;
  if (prevStars > 0) return { kind: 'stamp', mapId, toId: null, newStars, prevStars };

  const before = stars.slice();
  before[mapId] = prevStars;
  if (frontierIndex(before) !== mapId) return NONE;
  if (mapId === MAPS.length - 1) return { kind: 'complete', mapId, toId: null, newStars, prevStars };
  // The post-win frontier, not mapId + 1: on a gap save the next map may already be starred.
  return { kind: 'advance', mapId, toId: Math.min(frontierIndex(stars), MAPS.length - 1), newStars, prevStars };
}

export function arrivalFrame(plan, tMs, A = ARRIVAL) {
  const t = tMs;
  const focus = span(t, 0, A.focusMs);
  const toShow = plan.newStars - plan.prevStars;
  const shown = Math.min(toShow, t < A.stampStartMs ? 0 : Math.floor((t - A.stampStartMs) / A.stampEachMs) + 1);
  const stamped = plan.prevStars + shown;
  const stampsEnd = A.stampStartMs + toShow * A.stampEachMs;

  if (plan.kind === 'none') {
    return { focus: 1, stamped: plan.prevStars, shipT: 0, frontT: 0, nextLit: false, cardOpen: true, done: true };
  }
  if (plan.kind === 'stamp') {
    const done = t >= stampsEnd;
    return { focus, stamped, shipT: 0, frontT: 0, nextLit: false, cardOpen: done, done };
  }
  const shipT = span(t, A.flyStartMs, A.flyMs);
  return {
    focus,
    stamped,
    shipT,
    frontT: span(t, A.frontStartMs, A.frontMs),
    nextLit: plan.kind === 'advance' && t >= A.lightStartMs,
    cardOpen: t >= A.cardAtMs,
    done: t >= A.totalMs,
  };
}

// Where NEXT MISSION lands (spec §9.2). Only a NEXT press sets from.next, so WORLD MAP and
// Abandon keep today's behaviour.
export function nextMissionId({ from, plan, stars }) {
  if (from?.next !== true) return null;
  if (plan.kind === 'advance') return plan.toId;
  if (plan.kind === 'complete') return null;
  const id = from.mapId + 1;
  return id < MAPS.length && stars[from.mapId] > 0 ? id : null;
}
