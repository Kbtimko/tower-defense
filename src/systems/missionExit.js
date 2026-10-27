// The world-map hand-off payload (spec §9.1). Pure so the retry-chain rule is testable.

// entryStars is the saved stars when the level was first entered; savedStars is the save now.
// A retry chain that raised the save owes the flight even if the final run lost or was abandoned.
export function exitPayload({ mapId, result, entryStars, savedStars, runStars, next }) {
  const improved = savedStars > entryStars;
  return {
    mapId,
    result: improved ? 'victory' : result,
    prevStars: entryStars,
    stars: improved ? savedStars : (result === 'victory' ? runStars : savedStars),
    ...(next === true ? { next: true } : {}),
  };
}
