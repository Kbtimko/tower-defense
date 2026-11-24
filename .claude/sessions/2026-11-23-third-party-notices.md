# 2026-11-23 — Third-party notices and the GPL polyfill strip (backlog #81)

**Accomplished:**
- #141 (6.2) was merged by the user after I resolved its conflicts with #140 (6.1). Removed the merged 6.1 and 6.2 worktrees. That also deleted their gitignored `release/` folders, which the scripts regenerate.
- Backlog review: picked #81 ahead of roadmap 6.3, because the licences require notices to ship before any commercial release. The item is tagged `[auto]`, so I approved its spec and plan myself.
- Commits on `release/81-third-party-notices`:
  - 30b0d07: pure notice logic and vendored data;
  - e653ed5, 27f34f6: the notices plugin and package check, then transitive dependencies;
  - 0b158d3, 9f63d1b, 1e2b246: final-review fixes (Matter.js, Simplify.js, derived names, ledger);
  - c81175c, 8fe48b9, 48df6ed, 8268ba4: GPL polyfill strip, package guard, klasse notice, docs;
  - 4fc3b3c, 76ca25e: every build fails if the polyfill reaches the output.
- The Opus final review found code Phaser inlines with no notice: Matter.js, Simplify.js and klasse. It also found a GPL-3.0 polyfill (`rvfc-polyfill`), which I confirmed on npm, on GitHub and in our built JS.

**Decisions made:**
- User: strip the GPL polyfill from our build (the game never uses video).
- The package list comes from the bundle, plus the transitive `dependencies` of each bundled package, because pre-bundled dists inline their dependencies. Listing one too many is harmless; leaving one out is not.
- klasse's copyright line comes from its npm author field, because upstream has no LICENSE file.
- The strip guard lives in every build (`generateBundle` scan), not only in `package:itch`, so Vercel's build can't ship the GPL block silently.

**Where we left off:**
- PR open into `visual/integration`; merging is the user's.
- Next: roadmap 6.3 portfolio README, then 6.4 publish (G5). The #82 trademark check on "Last Light" is still the user's before publishing.
- Still with the user: the G3 desktop half, the #30 playtest, and `visual/integration` → `main`.
