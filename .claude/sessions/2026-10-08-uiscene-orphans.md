# 2026-10-08: UIScene orphaned wiring (backlog #34)

**Scope:** bounded. You approved the design ("yes go ahead"), and mid-task chose to move the tower tooltip into GameScene.

**Root hazard:** two scenes bind listeners to the same DOM nodes. UIScene is launched once and never stopped, while GameScene's shutdown clones every HUD button and `.tower-btn` to drop its own listeners. A stale UIScene handler then either fights GameScene's handler or gets silently stripped.

**Four live bugs fixed, each reproduced first:**
1. **Tower highlight desync:** re-arming after a cancel armed the tower with no highlight.
2. **Affordability dimming never updated:** buttons stayed lit at 0 gold.
3. **Tower tooltip dead from the second level on.** This corrects an earlier note of mine that said it worked on replay.
4. **Speed label stale across levels** (found by code review).

**Correction to my own earlier claim:** in the #25/#33 session I said the tooltip worked after replay. The text I read was stale hidden content from the first hover, which was Ice both times. Planting a sentinel string before hovering exposed it.

**Verification:**
- `npx vitest run`: 106 files, 1472 tests, exit 0. New: `hudButtons.test.js` (real bind methods of both scenes on one DOM) and `UIScene.eventWiring.test.js` (source-derived orphan guard). Each was red before its fix.
- Dev server:
  - Tower select, toggle, cancel and re-arm; placement, dimming, the tooltip and speed.
  - Upgrade, sell, barracks reposition, Send Wave, pause (button and Space) and the Q ability.
  - The defeat and victory overlays.
  - A second entry repeating the core checks, and the tooltip across three entries.
- Production build (`vite preview`, real clicks only): the speed label resets on level 2, and the tooltip, selection and dimming all work on level 2. No page errors.
- `npm run build`: exit 0.
