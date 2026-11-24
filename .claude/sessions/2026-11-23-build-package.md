# 2026-11-23 — Build and package (roadmap 6.2)

**Accomplished:**
- Session start: #140 (6.1) still open; picked 6.2 next. Recon found every asset path already relative; a trial `--base=./` build was 308 files and 33 MB, inside itch's limits (1,000 files, 500 MB, 200 MB per file, 240-character paths).
- Spec `docs/superpowers/specs/2026-11-22-build-package-design.md` and plan `docs/superpowers/plans/2026-11-22-build-package.md`, both approved by the user. Executed with subagent-driven development: 4 tasks, per-task reviews, an Opus whole-branch review, one fix wave and a scoped re-review.
- Commits on `release/6.2-build-package`:
  - 5ddaefe: itch limits, URL scan, zip naming;
  - a5b653f: exact-case static server and `capture.mjs --flow --serve/--base-path`;
  - 56f0052: portraits load from a relative path;
  - 2c30a73: `npm run package:itch`;
  - 155db6e, 6602a4b, 2577691, b98bf08, cf2e66b: captureCore and `npm run release:media`, with the stronger shot policy;
  - 6d16602, 4057406, 16052a6: final-review fixes.
- **A real bug the new subfolder check caught:** the story dialog and results screen loaded portraits root-absolutely, so they would have 404'd on itch.

**Decisions made:**
- The verify server is a custom exact-case `node:http` server, not Vite preview. Vite preview's SPA fallback hides 404s, and macOS hides case mismatches.
- The verification reuses the device flow (title → map 0 → build → send wave) on the unpacked zip at `/html/12345/`.
- Media policy redone after viewing the first output (Ruling F):
  - full board via `releaseBuild`, capped at each map's max tier;
  - auto-send, with the frame chosen by enemies mid-road;
  - the cover centred on the action;
  - the GIF at 640 px / 8 fps to stay under 10 MB.
- A plain-named zip in `release/` is always a verified one. Other zips get `-dirty` (uncommitted changes) or `-unverified` (`--no-verify`); a zip from a run without git gets `nogit` and `-dirty`.

**Where we left off:**
- PR open into `visual/integration`; merging is the user's. #140 (6.1) is also open, and the second of the two to merge resolves a small `notes.md` conflict.
- Next in Phase 6: 6.3 portfolio README. 6.4 (G5, publish) uses `release/*.zip` and `release/media/`.
- Follow-ups are backlog #86.
- Still with the user: G3 desktop half, the #30 playtest, and `visual/integration` → `main`.
