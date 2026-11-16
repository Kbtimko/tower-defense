# 2026-11-16 — #70 pipeline v2 candidate #0 was today's art

Branch `fix/70-seed-offset` → PR into `visual/integration`.

## What the user asked
- "continue with #70." (after #122 merged and the merged worktrees were swept). Also asked "do i need to review the new artwork" → no: #122 shipped no art; the smoke picks were reverted. Art review starts with 4.2's real batches.

## Root cause
- FLUX.1 [schnell] in Draw Things is deterministic. Every shipped reference was made by the legacy generator at seed 77021, and the v2 job default seed was also 77021. Candidates are seeded `seed + round*1000 + k`, so round 0's #0 for an unchanged txt2img prompt was the shipped reference (4.0 live run: cannon #0 vs reference, max pixel diff 0).

## Shipped
- `src/assets/artJob.js`: `export const LEGACY_SEED = 77021`, `export const DEFAULT_SEED = 88001`, with the why. Planned seeds only grow from the job seed, so any default above the legacy seed can never land on it.
- `scripts/generate-art.mjs`: legacy `--seed` default comes from `LEGACY_SEED` (still 77021).
- `scripts/art/README.md`: jobs default to 88001; `"seed": 77021` reproduces today's art on purpose.
- Tests: invariant through the real `planCandidates`, rounds 0–20 × 16 candidates with rerolls, plus `DEFAULT_SEED > LEGACY_SEED`; explicit job seed kept as written; old 77021/77022/77023 literals now derive from `DEFAULT_SEED`.

## Edge cases
- Reroll rounds (round ≥ 1) → seeds 89001+, never 77021 (sweep test).
- Max candidates (16) per round → covered by the sweep.
- Resumed/interrupted round → same seeds as before (planner unchanged).
- Explicit job seed, including 77021 → used as written (test).
- Legacy `npm run art` without `--job` → still 77021; `--seed N` still overrides (dry run).
- img2img variants → unaffected (init image and prompt differ from any reference).

## Verification
- Sabotage: `DEFAULT_SEED = LEGACY_SEED` fails exactly the invariant test; `DEFAULT_SEED = 70000` fails the `>` assertion.
- Dry runs: `npm run art -- --job smoke --dry-run` plans 88001–88003; `npm run art -- --kind sprite --only tower_cannon --dry-run` reports seed 77021.
- No fresh Draw Things generation: Chrome was open (the wedge condition). The 4.0 live run already measured seed 77021 = reference and 77022/77023 distinct, which is the whole mechanism.

## Environment
- Xcode updated mid-session and its license is not accepted, so `/usr/bin/git` and `/usr/bin/python3` refuse to run. Workaround used: `DEVELOPER_DIR=/Library/Developer/CommandLineTools`. Fix: `sudo xcodebuild -license`.
