# Roadmap 6.3: portfolio README

**Date:** 2026-11-23 · **Branch:** `docs/6.3-portfolio-readme` off `origin/visual/integration` (4d6c9ee)
**Roadmap text:** "Before/after gallery, architecture (sim + balance tool + 1,500+ tests), pipeline write-up."
**User decisions (2026-11-23):**
- the reader is **engineers only**, with no game pitch;
- Claude Code's role goes **front and centre**;
- approach A, one README as the case study.

The user approved the design ("yes").

## Intent

The repo is public and has no README. This page is the project's front door for engineers judging the work, including the user's portfolio. It should show what was built and, above all, how it was built: a human setting direction and making design calls while Claude Code implemented through a disciplined, reviewable pipeline. Every claim should be checkable in the repo.

## Goals

1. **`README.md` at the repo root**, about 300–450 lines, with a table of contents, written in the user's first-person voice. Sections, in order:
   1. **Summary.** One paragraph on what the game is (Phaser 3 tower defense: 10 maps, branching towers, heroes, story), the live link (https://tower-defense-black.vercel.app), one hero image, and a one-line stack note.
   2. **How it was built.** The user directs; Claude Code implements. The pipeline:
      - brainstorm → spec → plan;
      - a fresh implementer subagent per task, each followed by a reviewer;
      - a whole-branch review on the most capable model, with one fix wave;
      - live verification on the running game.

      Also covered: the standing rules in `CLAUDE.md` and global rules, such as failing test first, mutation checks, PRs only, and never pushing to `main`; the durable memory; and a link to one real spec, plan and review chain as an example.
   3. **What the process caught.** Five to seven concrete incidents, each with the symptom, how it was caught, and the fix, linked to commits or files:
      - the GPL-3.0 polyfill inside Phaser (#81);
      - root-absolute portrait URLs found by the itch subfolder check (6.2);
      - the jagged pads caused by a RenderTexture bake losing MSAA (6.1);
      - the scene-listener leak that multiplied enemy spawns per replay;
      - tests that passed while proving nothing, and the mutation-check rule that followed;
      - stale hidden DOM text that faked a "works on replay" result.

      Pick the strongest and verify each against git history or the memory and notes before writing it.
   4. **Before / after.** About five matched pairs: map select, in-game on desktop, in-game on iPhone, the tower panel or ring, and a results screen.
      - "Before" is from `docs/baseline/2026-10-21/`.
      - "After" is reshot now with the same capture-harness commands that `docs/visual-baseline.md` gives.
      - Images are committed under `docs/readme/` as JPEG, about 1280 px wide, with a total budget of 3 MB or less.
   5. **Architecture.**
      - Phaser scenes over pure, testable systems, with data tables in `src/data/`;
      - the balance simulator (`src/sim/`, `npm run balance`) and what it found: the map-7 difficulty cliff, the hindsight best-of-5 headline, and that the model is pessimistic by construction;
      - the deferred-asset fallback pattern.

      A small diagram in text or Mermaid if it earns its place.
   6. **Testing and verification.**
      - the Vitest test and file counts;
      - the Playwright device matrix (`npm run matrix`), the perf gate (`npm run perf`) and the itch packaging check (`npm run package:itch`);
      - frozen-frame A/B for visual work.
   7. **The art pipeline.** Local FLUX.1 [schnell] through Draw Things' HTTP API, the job → candidates → review page → picks → apply loop, rembg cutouts, 1x and @2x sets, reproducibility, and the licence ledger.
   8. **Running it.** `npm install`, `npm run dev`, `npm test`, and a short table of the other scripts. Licences: point to `docs/licenses.md` and `THIRD_PARTY_NOTICES.txt`.
2. **Every number is measured, not remembered:** test and file counts, commit count, number of specs and plans, maps, towers and enemies. The plan names the command for each, and the README states the date measured.
3. **No broken links.** Every relative link and image path in the README resolves in the repo.

## Non-goals

- A game pitch, a player-facing store page, or itch copy (that is 6.4).
- Tidying the repo root clutter (`01-game-start.png`, `page-snapshot.md`, the frozen `SESSION_NOTES.md`), which is a separate cleanup.
- Rewriting docs the README links to.

## Anti-goals

- **Inflated or unverifiable claims.** Every number and incident must trace to a command, a commit or a file.
- **Hiding or overselling the AI's role.** It is stated plainly: who decided what, and what Claude Code did.
- **Personal details** beyond what the repo already shows. No email address and no job-search framing.

## Constraints

- Markdown that renders on GitHub, so relative links and `<img>` or `![]()` with widths where useful.
- Images: total under 3 MB in `docs/readme/`, about 1280 px wide, JPEG at quality around 80, made with `sharp` (already installed).
- The after shots use the capture harness (`npm run capture`); see memory: the MCP browser is shared, so script the worktree's own Playwright.

## Left to the builder

- Exact headings and the wording of each section, within the order above.
- Which five incidents to tell, after verifying them.
- Whether a diagram helps.
