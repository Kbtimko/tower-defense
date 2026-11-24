# Art pipeline v2: default seed must not reproduce today's art (backlog #70)

## Why
FLUX.1 [schnell] in Draw Things is deterministic. The legacy generator (`scripts/generate-art.mjs`) made every shipped reference at seed 77021, and pipeline v2's job default seed is also 77021. Candidates are seeded `seed + round*1000 + k`, so candidate #0 of round 0 for any unchanged txt2img prompt is pixel-identical to the shipped reference (measured 2026-11-16: cannon #0 vs reference, max pixel diff 0). That wastes 1 of N generations (~2 min each) per asset and puts a fake "new" option on the review page.

## Goal
With the default seed, no candidate in any round is generated at the legacy seed.

## Non-goals
- Explicit `"seed"` in a job file is honoured as written (someone may want to reproduce the legacy look on purpose).
- No detection/skip of duplicate candidates; no change to the legacy generator's behaviour.
- img2img variants are unaffected either way (their init image and prompt differ from any reference).

## Approaches
1. **Offset the v2 default seed above the legacy seed** (chosen). Seeds only grow from the base (`round >= 0`, `k >= 0`), so any default > 77021 can never reach it. One constant plus a test.
2. Skip a candidate whose seed + prompt + mode match the reference's. References carry no seed/prompt metadata, so this would need new bookkeeping — more code for the same outcome.

## Design
- `src/assets/artJob.js` exports `LEGACY_SEED = 77021` and `DEFAULT_SEED` (a new value above it; comment says why). Remove the "one seed keeps a set cohesive" claim from the v2 side — v2 gives every candidate its own seed anyway.
- `scripts/generate-art.mjs` takes its default from `LEGACY_SEED` (behaviour unchanged).
- Tests assert the invariant (planned seeds from `DEFAULT_SEED` never include `LEGACY_SEED` across rounds 0–20 at the 16-candidate cap) and derive existing seed expectations from `DEFAULT_SEED` rather than literals.
- README: one line saying the default seed differs from the legacy one on purpose, and that `"seed": 77021` reproduces today's art.

## Left to the builder
The exact new default value (my call: 88001).
