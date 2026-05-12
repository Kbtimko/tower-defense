# tower-defense — Session Notes
_Last updated: 2026-05-10_

---

## CURRENT STATE

**Branch:** `feature/phase-2-core-engine` — tagged `phase-2-complete` (8bc637c)

**Completed this session:**
- Executed all 5 Phase 2 tasks inline (subagents were rejected; continued inline)
- Tower, Enemy, Projectile converted to `Phaser.GameObjects.Container` subclasses (1f1d8d3, c37a489, cb3d7d4)
- Rendering refactored: pathGfx drawn once, zoneGfx reactive, particleGfx per-frame (141f8e3)
- UIScene created; all DOM removed from GameScene; cross-scene comms via `this.game.events` bus (1cedd76)
- Speed button text reset bug caught and fixed in browser verify (8bc637c)
- 25 tests green; browser verified full golden path (place/upgrade/sell/wave/HUD/restart)

**Next action:**
Begin **Phase 3** brainstorm — scope TBD with user. Phase 2 non-goals deferred: TowerPlacementManager extraction, branch picker UI, ability buttons, new enemy types, new maps.

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
