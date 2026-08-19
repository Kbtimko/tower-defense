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

// What it costs to fill every slot with the cheapest firing tower.
export function cheapestFullBoardCost(map) {
  const cheapest = Math.min(
    ...Object.values(TOWER_DEFS).filter(d => d.fireRate > 0).map(d => d.cost),
  );
  return cheapest * (map.towerSlots?.length ?? 0);
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
