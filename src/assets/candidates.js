import { join, resolve } from 'node:path';

// Candidate images live outside the repo's public/ tree until one is picked, so the
// cache root is configurable (--cache beats ART_CACHE beats the repo default).
// An empty ART_CACHE is unset: resolved as-is it would make the repo root the cache.
export function cacheRoot(repoRoot, { cache, env = {} } = {}) {
  return resolve(repoRoot, cache ?? (env.ART_CACHE || '.art-cache'));
}

// A path typed on the command line. `npm run` executes from the package root, so a
// relative path is resolved against INIT_CWD (where the user ran npm) instead.
export function cliPath(p, { env = process.env, cwd = process.cwd() } = {}) {
  return p === undefined || p === null ? undefined : resolve(env.INIT_CWD ?? cwd, p);
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
      seed: metas[index].seed,
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

  const inRoundEntries = existing.filter((e) => e.round === round);
  const inRound = inRoundEntries.length;
  const missing = candidates - inRound;
  if (missing <= 0) return [];

  // A failed candidate leaves a hole mid-round; FLUX is deterministic, so refilling
  // must reuse the hole's seed, not a seed a later survivor already rendered. Without
  // numeric seeds to read positions from, assume the round is a contiguous prefix.
  const base = seed + round * ROUND_SEED_STRIDE;
  const seeded = inRoundEntries.every((e) => Number.isFinite(e.seed));
  const used = new Set(seeded ? inRoundEntries.map((e) => e.seed - base) : []);
  const positions = [];
  if (seeded) {
    for (let p = 0; positions.length < missing; p++) if (!used.has(p)) positions.push(p);
  } else {
    for (let k = 0; k < missing; k++) positions.push(inRound + k);
  }

  const nextIndex = existing.length ? Math.max(...existing.map((e) => e.index)) + 1 : 0;
  const plan = [];
  for (let k = 0; k < missing; k++) {
    plan.push({ index: nextIndex + k, round, seed: base + positions[k] });
  }
  return plan;
}
