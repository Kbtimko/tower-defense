// What a tower is WORTH to the modelled player, given what is still coming.
//
// The old `towerValue` in buildPolicy.js is `damage * fireRate / cost`, which
// ignores flat armour, the weakness matrix and pierce. It therefore ranks the
// archer first — and the archer lands 1 damage a shot on a titan. This module
// scores candidates through the real `computeDamage` instead, so the model
// picks towers the way a player with the wave preview and codex can.
import { ENEMY_DEFS } from '../data/enemies.js';
import { waveScaleFactor } from '../systems/WaveManager.js';

// Weighted HP each enemy type contributes from `fromWaveIndex` onward. The
// numbers are a relative mix — only their ratios are ever used.
export function remainingEnemyWeights(waves, fromWaveIndex = 0) {
  const weights = new Map();
  if (!Array.isArray(waves)) return weights;
  for (let i = Math.max(0, fromWaveIndex); i < waves.length; i++) {
    const scale = waveScaleFactor(i);
    for (const group of waves[i] ?? []) {
      const def = ENEMY_DEFS[group.type];
      if (!def) continue;
      const hp = def.hp * (group.count ?? 0) * scale;
      weights.set(group.type, (weights.get(group.type) ?? 0) + hp);
    }
  }
  return weights;
}
