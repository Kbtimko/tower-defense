// A healthy map is won, but not comfortably: the player should finish having
// lost some lives. All-lives-intact means the map never threatened them.
export const COMFORT_CEILING = 0.9;   // kept >=90% of lives -> too easy
export const COMFORT_FLOOR   = 0.25;  // kept <=25% of lives -> punishing

// Hardest first, so callers can compare bands by index.
export const VERDICT_HARDNESS = Object.freeze(['UNWINNABLE', 'PUNISHING', 'OK', 'TOO EASY']);

export function verdict(r, startLives) {
  if (!r.won) return { tag: 'UNWINNABLE', note: `lost at wave ${r.wavesSurvived + 1}/${r.totalWaves}` };
  const kept = r.livesRemaining / startLives;
  if (kept >= COMFORT_CEILING) return { tag: 'TOO EASY', note: `kept ${(kept * 100).toFixed(0)}% of lives` };
  if (kept <= COMFORT_FLOOR)   return { tag: 'PUNISHING', note: `kept ${(kept * 100).toFixed(0)}% of lives` };
  return { tag: 'OK', note: `kept ${(kept * 100).toFixed(0)}% of lives` };
}
