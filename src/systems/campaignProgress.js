import { MAPS } from '../data/maps.js';
import { ACTS, OBJECTIVES, CAMPAIGN_COMPLETE } from '../data/campaign.js';

// Saves can hold garbage; anything that isn't a finite number is "uncleared"
// so the frontier can never jump past a corrupt entry.
function sanitize(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.min(3, Math.max(0, Math.trunc(n)));
}

export function starsArray(saveMgr, maps) {
  return maps.map(m => sanitize(saveMgr.getStars(m.id)));
}

// Only the contiguous cleared prefix counts, so a gap save doesn't skip ahead.
export function frontierIndex(stars) {
  const i = stars.findIndex(s => !(typeof s === 'number' && Number.isFinite(s) && s > 0));
  return i === -1 ? stars.length : i;
}

export function sectorsRetaken(stars) {
  return frontierIndex(stars);
}

export function actForMap(id, acts = ACTS) {
  return acts.find(a => a.mapIds.includes(id));
}

export function bannerFor(stars, { maps = MAPS, acts = ACTS, objectives = OBJECTIVES } = {}) {
  const retaken = sectorsRetaken(stars);
  const total = maps.length;
  const sectors = `Front line: ${retaken} of ${total} sectors retaken`;
  if (retaken >= total) {
    return { act: CAMPAIGN_COMPLETE.act, objective: CAMPAIGN_COMPLETE.objective, sectors, complete: true };
  }
  const frontier = maps[retaken];
  const act = actForMap(frontier.id, acts);
  return {
    act: `ACT ${act.id} · ${act.name.toUpperCase()}`,
    objective: objectives[frontier.storyKey],
    sectors,
    complete: false,
  };
}
