# 2026-11-24 — Release to main, itch zip, release tooling (#86)

**Accomplished:**
- #143 (6.3 README) merged into `visual/integration`.
- **#144: `visual/integration` → `main`, merged by the user.**
  - The merge commit c0c361f keeps the integration side for every conflict. Its tree is byte-identical to aea7d9e.
  - `main`'s five hotfixes (#103, #110, #114, #121, #135) were all forward-ported already.
  - Two main-only GameScene tests, aimed at the pre-3.3 tower panel, were dropped, along with a duplicate SaveManager block.
  - Verified: 4241 tests, mutation-checked; production build; desktop flow 17/17.
- **Itch zip built from `main`:** `last-light-0.1.0-975ce5c.zip`, verified on desktop and iphone, with the notices and no GPL code. It lives in `.claude/worktrees/release-zip/release/`, with the media.
- **Backlog #86 (release tooling tidy-ups):**
  - spec and plan self-approved (`[auto]`), 2 SDD tasks, an Opus final review, one fix wave and a re-review;
  - the final review caught a Critical: `let info` was in the wrong function, so every successful `recordClip` threw;
  - live: `release:media` exit 0 with the clip; `package:itch` desktop 17/17, iphone 18/18, zip with 0 folder entries; 4249 tests.
- Removed the merged worktrees `readme-63` and `release-main`.

**Decisions made:**
- The user asked to "build the zip off main" before main had the merge. I checked, found `main` lacked the integration work, and asked before acting. The user chose the one merge (integration → main) through a PR.
- Pre-flight ruling: the test of `release-media.mjs` must not import the module before the entry guard exists, because `main()` would overwrite `release/media`.
- Parked: an error from `close()` in the finally can mask the real one; the Date.now call-count fakes. The `no-undef` lint goes to the backlog as #87 (it needs a new dependency).

**Where we left off:**
- The #86 PR is open into `visual/integration`. Merging is the user's.
- Next: 6.4 publish (G5). Before it: the #82 trademark check.
- The zip built from `main` has 15 folder entries, which itch tolerates. Rebuild after #86 reaches `main` for a cleaner archive.
- The worktree `release-zip` holds the zip and media; keep it until upload.
