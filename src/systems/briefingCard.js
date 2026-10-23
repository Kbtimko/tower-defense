import { MAPS } from '../data/maps.js';
import { STORY_SEQUENCES, briefKey } from '../data/story.js';
import { MAP_WAVES } from '../data/waves.js';
import { ENEMY_DEFS } from '../data/enemies.js';

export function commandQuote(storyKey) {
  return STORY_SEQUENCES[briefKey(storyKey)].panels.find(p => p.speaker === 'command').text;
}

// Enemy types first appearing on this map, in order of first appearance.
// Earlier maps' types are "seen" so only genuinely new threats are listed.
export function newThreats(mapId) {
  const seen = new Set();
  for (let m = 0; m < mapId; m++) {
    for (const wave of MAP_WAVES[m]) for (const g of wave) seen.add(g.type);
  }
  const out = [];
  for (const wave of MAP_WAVES[mapId]) {
    for (const g of wave) {
      if (seen.has(g.type)) continue;
      seen.add(g.type);
      const d = ENEMY_DEFS[g.type];
      out.push(d.flying ? `${d.name} (flying)` : d.name);
    }
  }
  return out;
}

export function briefingCardModel(mapId, stars) {
  const map = MAPS[mapId];
  return {
    missionNo: mapId + 1,
    name: map.name,
    quote: commandQuote(map.storyKey),
    threats: newThreats(mapId),
    maxTier: map.maxTierAllowed,
    stars,
    launchable: mapId === 0 || stars[mapId - 1] > 0,
  };
}
