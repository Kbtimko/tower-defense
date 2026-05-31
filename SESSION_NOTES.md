# tower-defense — Session Notes
_Last updated: 2026-05-13_

---

## CURRENT STATE

**Branch:** `main` — Phase 3 deployed to production

**Completed this session:**
- Resolved all merge conflicts in PR #1 (index.html, Tower.js, GameScene.js) — integrated Phase 3 tower system with main branch updates
- PR #1 merged to main (adc047c via merge commit on feature/phase-3-tower-system)
- Deployed Phase 3 to Vercel production: https://tower-defense-black.vercel.app
- All 6 towers live: Archer, Mage, Cannon, Ice, Sniper, Barracks
- Tier 4 branching system with branch picker UI at Tier 3
- Barracks soldiers with enemy blocking mechanics
- Soldier reposition flow fully functional

**Next action:**
Phase 4 brainstorm — post-launch features TBD (ability mechanics, new enemy types, new maps, hero unit, etc.)

---

## 2026-05-09 (auto-generated)
**Commits this session:**
- 61fd108 chore: initialize project with npm dependencies

## 2026-05-09 (auto-generated)
**Commits this session:**
- 35cacf6 chore: ignore playwright artifacts and screenshots
- 9b303d1 feat: complete Phase 1 project scaffold and prototype migration
- 75c9d55 fix: correct flex layout overflow, reset kills/game-msg on scene restart
- 1c03a2c fix: use !== undefined guards for tier upgrade stat application in GameScene
- 099bf00 feat: migrate prototype game loop into Phaser GameScene
- 86c98f7 feat: add BootScene and MenuScene with map selector
- 66fb0e3 fix: guard against null target in Projectile constructor
- e541bb0 feat: add Tower, Enemy, Projectile entity classes and HUD stub
- 49f213c fix: shallow-clone enemy def in WaveManager spawn queue to prevent mutation
- cbb7cc2 feat: add WaveManager with spawn queue
- 3d85551 fix: add zero-length segment guards and zone placement test to PathManager
- d75b669 feat: add PathManager with waypoint-to-pixel conversion and build zones
- 20a56e1 feat: add EconomyManager with gold/lives logic
- 9ba6640 feat: add data files for towers, enemies, maps, and waves
- 2c2e211 feat: add Phaser game config with scene registry
- 91205b0 chore: add Vite config and index.html with bottom-bar layout
- 61fd108 chore: initialize project with npm dependencies

## 2026-05-09 (auto-generated)
**Commits this session:**
- 35cacf6 chore: ignore playwright artifacts and screenshots
- 9b303d1 feat: complete Phase 1 project scaffold and prototype migration
- 75c9d55 fix: correct flex layout overflow, reset kills/game-msg on scene restart
- 1c03a2c fix: use !== undefined guards for tier upgrade stat application in GameScene
- 099bf00 feat: migrate prototype game loop into Phaser GameScene
- 86c98f7 feat: add BootScene and MenuScene with map selector
- 66fb0e3 fix: guard against null target in Projectile constructor
- e541bb0 feat: add Tower, Enemy, Projectile entity classes and HUD stub
- 49f213c fix: shallow-clone enemy def in WaveManager spawn queue to prevent mutation
- cbb7cc2 feat: add WaveManager with spawn queue
- 3d85551 fix: add zero-length segment guards and zone placement test to PathManager
- d75b669 feat: add PathManager with waypoint-to-pixel conversion and build zones
- 20a56e1 feat: add EconomyManager with gold/lives logic
- 9ba6640 feat: add data files for towers, enemies, maps, and waves
- 2c2e211 feat: add Phaser game config with scene registry
- 91205b0 chore: add Vite config and index.html with bottom-bar layout
- 61fd108 chore: initialize project with npm dependencies

## 2026-05-10 (auto-generated)
**Commits this session:**
- 78eea50 docs: add Phase 2 implementation plan — entity Containers, UIScene, reactive rendering
- f4c2aeb docs: add Phase 2 design spec — UIScene split + entity Containers

## 2026-05-10 (auto-generated)
**Commits this session:**
- 78eea50 docs: add Phase 2 implementation plan — entity Containers, UIScene, reactive rendering
- f4c2aeb docs: add Phase 2 design spec — UIScene split + entity Containers

## 2026-05-11 (auto-generated)
**Commits this session:**
- e16377e docs: add Phase 3 implementation plan — tower system, soldiers, branch picker

## 2026-05-11 (auto-generated)
**Commits this session:**
- 7cc5921 chore: restore Phase 2 implementation (UIScene, Entity Containers, event-based panel)
- e16377e docs: add Phase 3 implementation plan — tower system, soldiers, branch picker

## 2026-05-12 (auto-generated)
**Commits this session:**
- 44421c4 chore: finalize Phase 3 session — all features deployed to production

## 2026-05-12 (auto-generated)
**Commits this session:**
- 218ff39 docs: add Phase 4 implementation plan — enemy shapes, wave balance, death particles
- e427cad docs: add Phase 4 design spec — alien enemy system, Map 1 scope
- 44421c4 chore: finalize Phase 3 session — all features deployed to production

## 2026-05-13 (auto-generated)
**Commits this session:**
- 3503c8e docs: add Barracks/Soldier system rebuild design spec

## 2026-05-14 (auto-generated)
**Commits this session:**
- 702817b refactor: fix UIScene event handler consistency and unlock map heuristic
- 2829d69 fix: disable upgrade button in maxed and tier-locked states
- 24cf28c feat: add branch picker UI and Barracks soldier stats panel with reposition button
- 09533b1 feat: implement Barracks reposition mode with path overlay
- d16f3b5 feat: implement soldier blocking — enemies halt and fight soldiers in melee
- 51a7a90 feat: wire Barracks placement dispatch, targeting skip, and upgrade branch support
- df0aab1 feat: add Barracks entity extending Tower with soldier management
- 48bd674 feat: add Soldier entity with HP bar and respawn timer
- 687ad1a fix: resolve tier4A/tier4B keys correctly in Tower.upgrade
- 29fc85f feat: add PathManager.getPathPoints and getNearestPathProgress
- b0eec4e feat: restore soldierStats on barracks def, zero out flat combat fields
- 3a1f3a3 docs: add Barracks/Soldier rebuild implementation plan

## 2026-05-14 (auto-generated)
**Commits this session:**
- 702817b refactor: fix UIScene event handler consistency and unlock map heuristic
- 2829d69 fix: disable upgrade button in maxed and tier-locked states
- 24cf28c feat: add branch picker UI and Barracks soldier stats panel with reposition button
- 09533b1 feat: implement Barracks reposition mode with path overlay
- d16f3b5 feat: implement soldier blocking — enemies halt and fight soldiers in melee
- 51a7a90 feat: wire Barracks placement dispatch, targeting skip, and upgrade branch support
- df0aab1 feat: add Barracks entity extending Tower with soldier management
- 48bd674 feat: add Soldier entity with HP bar and respawn timer
- 687ad1a fix: resolve tier4A/tier4B keys correctly in Tower.upgrade
- 29fc85f feat: add PathManager.getPathPoints and getNearestPathProgress
- b0eec4e feat: restore soldierStats on barracks def, zero out flat combat fields
- 3a1f3a3 docs: add Barracks/Soldier rebuild implementation plan

## 2026-05-14 (auto-generated)
**Commits this session:**
- 289d9b9 merge: resolve conflicts with feature/phase-3-tower-system
- 702817b refactor: fix UIScene event handler consistency and unlock map heuristic
- 2829d69 fix: disable upgrade button in maxed and tier-locked states
- 24cf28c feat: add branch picker UI and Barracks soldier stats panel with reposition button
- 09533b1 feat: implement Barracks reposition mode with path overlay
- d16f3b5 feat: implement soldier blocking — enemies halt and fight soldiers in melee
- 51a7a90 feat: wire Barracks placement dispatch, targeting skip, and upgrade branch support
- df0aab1 feat: add Barracks entity extending Tower with soldier management
- 48bd674 feat: add Soldier entity with HP bar and respawn timer
- 687ad1a fix: resolve tier4A/tier4B keys correctly in Tower.upgrade
- 29fc85f feat: add PathManager.getPathPoints and getNearestPathProgress
- b0eec4e feat: restore soldierStats on barracks def, zero out flat combat fields
- 3a1f3a3 docs: add Barracks/Soldier rebuild implementation plan

## 2026-05-17 (auto-generated)
**Commits this session:**
- 0909c72 docs: add Phase 5 maps & storyline design spec

## 2026-05-17 (auto-generated)
**Commits this session:**
- 3b7d6ba chore: update session notes and add Phase 5 implementation plan
- acc16c8 fix: add MAP_WAVES[1] for Lunar Gate (was silently using map 0 fallback)
- 9f50d62 feat: wire GameScene with ProgressManager, StoryManager, star rating, and unlock flow
- efd99cd feat: register MapSelectScene and redirect MenuScene to it
- 71b62c8 feat: add MapSelectScene with sidebar/featured panel layout
- 1ccbe4e feat: add StoryManager and story-banner DOM
- 7b9cad0 feat: add STORY_PANELS data for all 10 maps
- 7aa135b feat: add starsDisplay utility
- b139dae feat: add ProgressManager for localStorage star ratings and unlock state
- c84a359 feat: add phantom and titan visual shapes to Enemy._redrawBody
- 7ca3740 feat: add MAP_WAVES[2-9] with phantom and titan enemies
- d467fb5 feat: expand maps to 10 with blurb field and new waypoints
- 3dc0c35 feat: add phantom and titan enemy definitions
- 0909c72 docs: add Phase 5 maps & storyline design spec

## 2026-05-17 (auto-generated)
**Commits this session:**
- 3b7d6ba chore: update session notes and add Phase 5 implementation plan
- acc16c8 fix: add MAP_WAVES[1] for Lunar Gate (was silently using map 0 fallback)
- 9f50d62 feat: wire GameScene with ProgressManager, StoryManager, star rating, and unlock flow
- efd99cd feat: register MapSelectScene and redirect MenuScene to it
- 71b62c8 feat: add MapSelectScene with sidebar/featured panel layout
- 1ccbe4e feat: add StoryManager and story-banner DOM
- 7b9cad0 feat: add STORY_PANELS data for all 10 maps
- 7aa135b feat: add starsDisplay utility
- b139dae feat: add ProgressManager for localStorage star ratings and unlock state
- c84a359 feat: add phantom and titan visual shapes to Enemy._redrawBody
- 7ca3740 feat: add MAP_WAVES[2-9] with phantom and titan enemies
- d467fb5 feat: expand maps to 10 with blurb field and new waypoints
- 3dc0c35 feat: add phantom and titan enemy definitions
- 0909c72 docs: add Phase 5 maps & storyline design spec

## 2026-05-18 (auto-generated)
**Commits this session:**
- f6a3f6d fix: register shutdown lifecycle and fix Enemy/Projectile scene arg

## 2026-05-18 (auto-generated)
**Commits this session:**
- 021838b feat: expose window.__game in DEV mode and add PR #4 validation script
- f6a3f6d fix: register shutdown lifecycle and fix Enemy/Projectile scene arg

## 2026-05-18 (auto-generated)
**Commits this session:**
- 84915b8 fix: level-guard W/E keyboard shortcuts, award gold for hero kills
- 2f9b3d0 fix: guard keydown against text inputs, init _onKeyDown null, fix Q locked class
- 2b1f66a feat: hero UI — ability buttons, keydown Q/W/E, HP bar, cooldown display
- 4fce68b fix: guard hero moveTo while dead, reset aimMode on airstrike early-return
- 9bddb08 feat: hero input (aim mode, moveTo fallback), abilities (overcharge/airstrike/EMP)
- c9767d2 fix: add _onAbility stub, fix cooldown accumulator drift, document stun-freeze
- 137ebda feat: wire Hero into GameScene — update loop, overcharge, stun skip
- b802c15 feat: add hero section to bottom bar (portrait, HP bar, Q/W/E buttons)
- ebcc715 test: add Hero leveling and ability tests
- 851daba fix: reset _attackTimer on respawn, align takeDamage signature
- 551a936 feat: add Hero entity — movement, auto-attack, respawn
- f46d68a chore: clarify lineBetween mock in Enemy.test.js
- fb1698e feat: add stun status effect to Enemy
- 40cf817 docs: add Phase 6 hero unit implementation plan
- deee012 docs: add Phase 6 hero unit design spec
- 021838b feat: expose window.__game in DEV mode and add PR #4 validation script
- f6a3f6d fix: register shutdown lifecycle and fix Enemy/Projectile scene arg

## 2026-05-19 (auto-generated)
**Commits this session:**
- 5ef33d7 docs: Phase 7 Meta & Persistence design spec

## 2026-05-19 (auto-generated)
**Commits this session:**
- abb19e7 docs: Phase 7 Meta & Persistence implementation plan
- 5ef33d7 docs: Phase 7 Meta & Persistence design spec

## 2026-05-19 (auto-generated)
**Commits this session:**
- abb19e7 docs: Phase 7 Meta & Persistence implementation plan
- 5ef33d7 docs: Phase 7 Meta & Persistence design spec

## 2026-05-19 (auto-generated)
**Commits this session:**
- abb19e7 docs: Phase 7 Meta & Persistence implementation plan
- 5ef33d7 docs: Phase 7 Meta & Persistence design spec

## 2026-05-19 (auto-generated)
**Commits this session:**
- abb19e7 docs: Phase 7 Meta & Persistence implementation plan
- 5ef33d7 docs: Phase 7 Meta & Persistence design spec

## 2026-05-29 (auto-generated)
**Commits this session:**
- afb700b docs: fix-missing-music-crash design spec
- fdbdcbb Merge pull request #14 from Kbtimko/feature/phase-9c-click-inspect
- 0f5cff2 feat(game-scene): wire InspectController for enemy/hero click + hover
- 60ff58d feat(scenes): InspectController peek tooltip + panel positioning
- 7a2199c feat(scenes): InspectController panel rendering + live refresh

## 2026-05-30 (auto-generated)
**Commits this session:**
- 78a1143 docs: hero path-restriction design spec

## 2026-05-30 (auto-generated)
**Commits this session:**
- aa8a036 chore(hero): add Soldier-parity post-loop fallthrough to setPathPosition
- f988b95 test(hero): cover backward path-progress movement
- c522bf1 feat(hero): restrict movement to path corridor (snap-or-reject at 40px)
- 106e8ba test(hero): boundary test for setPathPosition(1.0) on multi-segment path
- 5dd4df6 feat(hero): add path-progress infrastructure (pathProgress, setPathPosition)
- 3fb28a7 docs: hero path-restriction implementation plan
- 78a1143 docs: hero path-restriction design spec
