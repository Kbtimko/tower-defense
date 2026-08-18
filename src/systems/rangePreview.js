// Pure helper for the build-time range preview ring. Mirrors the exact range
// computation in Tower.js (`Math.round(def.range * _rangeMult)`) so the
// previewed coverage matches what the placed tower will actually have,
// including the towerRangeMult upgrade modifier.

export function previewRange(baseRange, rangeMult = 1) {
  return Math.round(baseRange * rangeMult);
}
