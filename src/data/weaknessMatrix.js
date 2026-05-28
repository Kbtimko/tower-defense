// Base 6×6 (TOWER × ENEMY). Omitted = 1.0.
export const WEAKNESS_MATRIX = {
  archer:   {                       skitter: 1.25, brute: 0.75, colossus: 0.75, phantom: 1.25, titan: 0.5  },
  mage:     { drone:  1.25,                                     colossus: 1.25, phantom: 1.5,  titan: 1.25 },
  cannon:   { drone:  0.75, skitter: 0.5,  brute: 1.5, colossus: 1.5,  phantom: 0.5,  titan: 1.25 },
  ice:      {                                                                                  titan: 0.75 },
  sniper:   {               skitter: 0.75, brute: 1.25, colossus: 1.5, phantom: 0.75, titan: 1.5  },
  barracks: {               skitter: 1.25, brute: 1.25,                phantom: 0.5,  titan: 0.75 },
};

// Sparse Tier-4 branch overrides. Override REPLACES the base cell (does not multiply).
export const TIER4_OVERRIDES = {
  archer: { B: {                       brute: 1.25, colossus: 1.25                          } }, // Marksman: armor-piercing
  mage:   { B: {                       brute: 1.5,  colossus: 1.5                           } }, // Frost Mage: Shatter synergy
  cannon: { A: { skitter: 2.0                                                               } }, // Artillery: splits → swarm
  ice:    { B: {                       brute: 1.5,  colossus: 1.5                           } }, // Shatter explicit
  sniper: { A: {                                    colossus: 2.0,                titan: 2.5 } }, // Assassin: the titan answer
};

// Hero damage (auto-attack + airstrike). Omitted = 1.0.
export const HERO_MULTIPLIERS = {
  phantom: 1.5, // hero is the anti-air baseline
};

export function getWeaknessMultiplier(source, enemyType) {
  if (!source) return 1.0;
  if (source.kind === 'hero') return HERO_MULTIPLIERS[enemyType] ?? 1.0;
  if (source.kind === 'tower') {
    if (source.tier === 4 && source.branch) {
      const override = TIER4_OVERRIDES[source.type]?.[source.branch]?.[enemyType];
      if (override !== undefined) return override;
    }
    return WEAKNESS_MATRIX[source.type]?.[enemyType] ?? 1.0;
  }
  return 1.0;
}
