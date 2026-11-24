# Portfolio README (roadmap 6.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A root `README.md` that presents the project to engineers as a case study of a human-directed, Claude Code–built game, with matched before/after images and every claim verifiable.

**Architecture:** Three steps.
1. Shoot and compress the gallery.
2. Collect measured facts and verified incidents into a facts sheet in the SDD workspace, with the command and output for each.
3. Write the README from those two inputs only, and add a Vitest guard that every relative link and image in it resolves.

**Tech Stack:** Markdown (GitHub rendering), the capture harness (`scripts/capture.mjs`, Playwright), `sharp`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-portfolio-readme-design.md`

## Global Constraints

- **Reader and voice:** engineers only, no game pitch. Claude Code's role is front and centre and stated plainly. Write in the user's first-person voice ("I directed…, Claude Code implemented…").
- **Section order** (spec Goal 1): Summary → How it was built → What the process caught → Before / after → Architecture → Testing and verification → The art pipeline → Running it.
- **Length:** about 300–450 lines, with a table of contents.
- **Images:** under `docs/readme/`, JPEG, about 1280 px wide, quality around 80, **total 3 MB or less**.
- **Numbers:** every number comes from the facts sheet, with the command that produced it. The README states "as of 2026-11-23".
- **Incidents:** every incident links to a commit, PR or file that shows it.
- **Privacy:** no email address, no job-search framing, no personal details beyond the repo's.
- **Commits:** stage explicit paths only. Never commit `release/`, `.art-cache/` or `.superpowers/`.

## Review Focus

1. **A stale number,** such as a test count that changed between measuring and writing. The README's numbers must match the facts sheet, and the sheet must say when each was measured.
2. **A broken relative link or image path,** for example `docs/readme/x.jpg` misspelled, or a moved spec. Task 3's Vitest guard checks every one.
3. **An incident told wrong,** for example the wrong cause or a fix that never shipped. Task 2 must cite the commit or file for each, and Task 3 must not add claims the sheet lacks.
4. **Mismatched pairs:** a before and after taken at different screens, maps or devices. Task 1 pairs them by the same harness command and screen, and the implementer views every pair.
5. **Image weight:** the gallery must stay under 3 MB, which Task 1 checks.

---

### Task 1: The before/after gallery

**Files:**
- Create: `docs/readme/` with `before-<screen>.jpg` and `after-<screen>.jpg` pairs, a `hero.jpg`, and `docs/readme/PAIRS.md`. `PAIRS.md` is a short table: screen, device, before source path, after harness command, file names.

**Steps:**
- [ ] **Step 1:** Reshoot the "after" screens with the commands in `docs/visual-baseline.md`, checking `uptime` first and running at load < 6:
  - `npm run capture -- --screens --maps 0 --devices desktop,iphone`
  - `npm run capture -- --maps 0,3,5,9 --devices desktop`

  Output lands in `.art-cache/captures/`.
- [ ] **Step 2:** Choose about 5 pairs that match the baseline files in `docs/baseline/2026-10-21/`: the same screen, device and map:
  - map select (desktop);
  - in-game map 0 (desktop);
  - in-game (iphone), which shows the phone fix;
  - the tower panel (desktop); "after" is the closest equivalent, the tower ring, so say so in `PAIRS.md`;
  - a results screen (desktop victory or defeat);
  - optionally in-game map 9 (desktop).

  For `hero.jpg`, use the best current in-game desktop frame. A full-board shot is fine: `npm run release:media` makes those under `release/media/`, so copy one (and say which).
- [ ] **Step 3:** Compress every chosen image with `sharp` to about 1280 px wide (keep the aspect ratio), JPEG quality around 80. Use the same width for both images of a pair. Write the files to `docs/readme/`, then measure the total with `du -ch docs/readme/*.jpg`. It must be 3 MB or less; lower the quality or width if not.
- [ ] **Step 4: Look at every pair yourself** (Read both images). In the report, record for each: same screen? same device? what visibly changed? Drop any pair that isn't a fair match.
- [ ] **Step 5:** Commit: `git add docs/readme && git commit -m "docs(readme): before/after gallery images"`.

---

### Task 2: The facts sheet

**Files:**
- Create: `<SDD workspace>/facts.md`. It is not committed; it is the README writer's only source of numbers and incidents.

**Steps:**
- [ ] **Step 1: Numbers.** For each item, record the command, its raw output and the value. Never pipe test output through `tail` or `head`.
  - Vitest test and file count: `npx vitest run`, full output saved to a file, then read the summary lines.
  - Commit count on `origin/visual/integration`, and the first commit date.
  - The number of specs and plans under `docs/superpowers/`.
  - Counts derived from `src/data/` with a small `node -e` import, not by eye: maps, tower types, enemy types, heroes.
  - The count of merged PRs: `gh pr list --state merged --limit 500 --json number | jq length`.
  - The script list from `package.json`.
- [ ] **Step 2: Incidents.** For each candidate below, find the evidence and write: symptom, how it was caught, root cause, fix, and links (commit SHA, PR number, file path). Sources: `git log -S`/`--grep`, `gh pr view`, `.claude/notes.md`, `docs/`. Mark each **VERIFIED** (evidence found) or **DROP** (not verifiable).
  - The GPL-3.0 rvfc-polyfill inside Phaser: PR #142, `docs/licenses.md`.
  - Root-absolute portrait URLs caught by the itch subfolder check: PR #141, commit `56f0052`.
  - The jagged pads after a RenderTexture bake (no MSAA), caught by a frozen-frame A/B, then a Canvas2D bake: PR #140.
  - The scene-listener leak where enemy spawns multiplied per replay (6→12→18): search the git log for "listener" or "leak".
  - Tests that passed while proving nothing, and the mutation-check rule: PR #135 `docs: require mutation-checked tests in CLAUDE.md`.
  - Stale hidden DOM text faking "works on replay": search notes and the log for "sentinel".
  - UIScene dormant because only the first scene in `config.scene` auto-starts: search for "UIScene" with "dormant" or "auto-start".
- [ ] **Step 3: The process.** Find one complete, real chain to link as the worked example: a spec, its plan, and the PR. Prefer 6.2: `docs/superpowers/specs/2026-11-22-build-package-design.md`, `docs/superpowers/plans/2026-11-22-build-package.md`, PR #141. Also note which `CLAUDE.md` files hold the standing rules (the repo `CLAUDE.md`; the global one is not in the repo, so describe its rules without linking it).
- [ ] **Step 4:** No commit, since the sheet is workspace-only. Report the path.

---

### Task 3: The README and its link guard

**Files:**
- Create: `README.md`, `src/assets/readmeLinks.test.js`

**Interfaces:**
- Consumes:
  - from Task 1: `docs/readme/*.jpg` and `docs/readme/PAIRS.md`;
  - from Task 2: `<SDD workspace>/facts.md`. Every number and incident in the README must come from it.

**Steps:**
- [ ] **Step 1: Write the failing test first** (`src/assets/readmeLinks.test.js`):
  - read `README.md` from the repo root;
  - extract every relative Markdown link and image target: `](path)` and `src="path"`, excluding `http(s):`, `mailto:` and pure `#anchors`, and stripping any `#fragment`;
  - assert each one exists with exact case, checked per path segment with `readdirSync`, since macOS hides case bugs;
  - also assert that the README contains at least one image under `docs/readme/`.

  Run it; expect FAIL because `README.md` is missing.
- [ ] **Step 2:** Write `README.md` per the spec's section order, length and voice. Use only facts-sheet numbers, labelled "as of 2026-11-23". Each incident is 3–5 lines with its links. Put the gallery in a 2-column table (before | after), with captions from `PAIRS.md`.
- [ ] **Step 3:** Run the test; expect PASS. Mutation check: misspell one image path and confirm the test FAILS naming it, then restore.
- [ ] **Step 4:** Run `npm test` and expect exit 0. Paste the summary.
- [ ] **Step 5:** Commit: `git add README.md src/assets/readmeLinks.test.js && git commit -m "docs: portfolio README for engineers, built-with-Claude-Code case study"`.
