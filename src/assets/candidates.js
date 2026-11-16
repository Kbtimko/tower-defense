import { join, resolve } from 'node:path';

// Candidate images live outside the repo's public/ tree until one is picked, so the
// cache root is configurable (--cache beats ART_CACHE beats the repo default).
export function cacheRoot(repoRoot, { cache, env = {} } = {}) {
  return resolve(repoRoot, cache ?? env.ART_CACHE ?? '.art-cache');
}

export function candidateDir(cache, batch, assetId) {
  return join(cache, 'candidates', batch, assetId);
}

// An index is only trusted once its json lands: the json is written after the png,
// so a png with no json is an interrupted write and must be regenerated.
export function readExisting(fileNames, metas) {
  const present = new Set(fileNames);
  return Object.keys(metas)
    .map(Number)
    .filter((index) => Number.isInteger(index) && present.has(`${index}.png`))
    .sort((a, b) => a - b)
    .map((index) => ({
      index,
      round: metas[index].round,
      hasCut: present.has(`${index}.cut.png`),
      hasPreview: present.has(`${index}.preview.png`),
    }));
}

// Seeds are a pure function of (seed, round, position in round), so an interrupted
// round resumes with the same seeds it would have had uninterrupted.
const ROUND_SEED_STRIDE = 1000;

export function planCandidates({ existing, candidates, seed, reroll }) {
  const maxRound = existing.length ? Math.max(...existing.map((e) => e.round)) : null;
  let round;
  if (maxRound === null) round = 0;
  else round = reroll ? maxRound + 1 : maxRound;

  const inRound = existing.filter((e) => e.round === round).length;
  const missing = candidates - inRound;
  if (missing <= 0) return [];

  const nextIndex = existing.length ? Math.max(...existing.map((e) => e.index)) + 1 : 0;
  const plan = [];
  for (let k = 0; k < missing; k++) {
    plan.push({
      index: nextIndex + k,
      round,
      seed: seed + round * ROUND_SEED_STRIDE + inRound + k,
    });
  }
  return plan;
}
