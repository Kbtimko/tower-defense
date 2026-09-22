// Model-free economy diagnostics.
//
// Unlike the combat simulator, nothing here depends on how well towers shoot.
// These numbers come purely from the map's own data — the wave tables, the
// reward multipliers and the tower costs — so they are exact, not modelled.
// If the gold ceiling cannot cover a useful board, no amount of skilful play
// fixes it, which makes this the most trustworthy balance signal available.
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';

const WAVE_CLEAR_BONUS = 38;    // GameScene.js

// Every gold piece a perfect player could earn: start gold, every enemy killed,
// every wave cleared. Excludes the send-wave-early bonus (skill-dependent).
export function goldCeiling(map, waves, killGoldMult = 1) {
  const rewardMult = map.rewardMult ?? 1;
  let killGold = 0;
  for (const wave of waves) {
    for (const group of wave) {
      const def = ENEMY_DEFS[group.type];
      if (!def) continue;
      killGold += group.count * Math.round(def.reward * killGoldMult * rewardMult);
    }
  }
  const clearGold = waves.length * Math.round(WAVE_CLEAR_BONUS * rewardMult);
  return { startGold: map.startGold, killGold, clearGold, total: map.startGold + killGold + clearGold };
}

// What it costs to fill every slot with the cheapest firing tower. Blind to
// tier: an archer costs 110 taken to tier 2 but 310 taken to tier 4, so this
// cannot see the difference between a map capped at tier 2 and one at tier 4
// -- which is exactly how the pre-#71 startGold collapse went unnoticed.
export function cheapestFullBoardCost(map) {
  const cheapest = Math.min(
    ...Object.values(TOWER_DEFS).filter(d => d.fireRate > 0).map(d => d.cost),
  );
  return cheapest * (map.towerSlots?.length ?? 0);
}

// What it costs to fill AND fully upgrade a board to the map's own tier cap.
// Where cheapestFullBoardCost is blind to tier, this is blind to entry cost:
// it prices one fixed tower's whole upgrade curve rather than the cheapest
// buy-in, so the two measure different things and neither substitutes for
// the other.
export function depthBoardCost(map) {
  const def = TOWER_DEFS.archer;
  let per = def.cost;
  for (let t = 2; t <= (map.maxTierAllowed ?? 4); t++) {
    const tier = def[t === 4 ? 'tier4A' : `tier${t}`];
    if (tier) per += tier.cost;
  }
  return per * (map.towerSlots?.length ?? 0);
}

// Total enemy hit points across the campaign of a map, including the per-wave
// scaleFactor WaveManager applies (1 + waveIndex * 0.13).
export function totalEnemyHp(waves) {
  let hp = 0;
  waves.forEach((wave, i) => {
    const scale = 1 + i * 0.13;
    for (const group of wave) {
      const def = ENEMY_DEFS[group.type];
      if (def) hp += group.count * def.hp * scale;
    }
  });
  return Math.round(hp);
}

// Gold available per point of enemy HP — a difficulty-normalised income figure
// that is comparable across maps of different lengths.
export function goldPerHp(map, waves, killGoldMult = 1) {
  const hp = totalEnemyHp(waves);
  return hp === 0 ? 0 : goldCeiling(map, waves, killGoldMult).total / hp;
}
