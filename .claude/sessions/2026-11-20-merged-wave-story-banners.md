# 2026-11-20 — Merged-wave story banners (#59)

Branch `fix/59-merged-wave-story-beats` → PR into `visual/integration`.

**Accomplished:**
- The user asked to "review backlog - kick off next session". I loaded context from `origin/visual/integration`, since the primary checkout was 400 commits behind, and offered four candidates. The user picked #59, the recommended one.
- **Root cause:** `_checkWaveComplete` asked only for the panel keyed to `currentWave`. When waves overlap (auto-send, or an early Send Wave), the board clears once at the later wave and the earlier panel is never looked up. This hit every map.
- **Shipped:**
  - `src/systems/storyQueue.js` `dueStoryPanels` and `StoryManager#getDuePanels`.
  - GameScene `_showDueBanners` (a sequence, oldest first), a per-level `_storyShown` Set reset in `create()`, and `_skipStoryBefore` for debug wave jumps.
- Spec `docs/superpowers/specs/2026-11-20-merged-wave-story-banners-design.md`, plan `docs/superpowers/plans/2026-11-20-merged-wave-story-banners.md`.

**Decisions made:**
- The user approved the design: queue every due panel for the next clear, oldest first. Two alternatives were rejected: "newest only" still loses warnings, and showing banners at wave start would change when every banner appears.
- **My calls:**
  - A send mid-sequence defers the unshown panels to the next clear. Panels are marked shown when displayed, not when dismissed.
  - Banner text is unchanged, so "Wave 3" can now show after wave 4 clears.
  - The plan's mutation step wrongly expected the overlap test to fail under `due.at(-1)`: only one panel is due at that clear. The binding proof was running the tests against the pre-fix GameScene, where they all fail.
- **Parked:**
  - #78, a stale dismiss callback after a mid-sequence send. Unreachable today, and fixing it needs a `StoryManager` API change.
  - A null guard in `dueStoryPanels`: its only caller passes the module constant.

**Verification:**
- `npm test`: 4034 tests in 242 files, exit 0. `npm run build`: exit 0.
- Mutation proofs: the debug-jump call deleted, `wave - 1` → `wave`, and the `create()` reset deleted each fail the new integration test.
- Live A/B on the capture build (Playwright, `.superpowers/live59.mjs`, not committed): map 0 wave 3, Send Wave pressed with 4 enemies on board.
  - Fix (`7aec3be`): "Intel — Wave 3" at the wave-4 clear, countdown held, dismiss hides it, 0 page errors.
  - Base `2fd42e9`: no banner.

**Where we left off:** The PR is open into `visual/integration`. Next candidates:
- roadmap 4.1, the 2x re-bake (`.art-cache` is present and Draw Things is up);
- the small bug bundle #68/#64/#57;
- roadmap 4.6, the licence ledger;
- #78.

Still waiting on the user: G3 desktop half, #30 playtest. The primary checkout still sits 400 behind with the `.claude/session-wrapped` deletion. Left alone.
