# Project: Last Light (Tower Defense)

## Goal
Build a fully playable tower defense game with 10 maps, 6 tower types with tier branching, distinct alien enemy visuals, and a storyline — deployed at https://tower-defense-black.vercel.app

## Current Status
Phase 7 (Meta & Persistence) merged (PR #7). In-level Exit button + DOM-leak fixes merged (PR #8). 172 tests passing, build clean, browser-verified end to end. Next: backlog item 1 (send next wave early for bonus gold).

## Blockers
- None active

## Known Bugs
- None active (the `#tower-panel` and `#game-msg` leaks were fixed in PR #8 — `GameScene.shutdown()` now hides both)

## In Progress
- None active

## Prioritized Backlog
1. Option to send the next wave early for bonus gold (reward scales with time saved)
2. Remove dead enemies from the battlefield (clean up corpses/leftover sprites)
3. Add a click overlay to view hero & enemy info (stats panel on click)
4. Confirm enemies have different weaknesses for different towers (investigate current type/damage interactions; add if missing)
5. Additional heroes with different skills (hero roster — selectable heroes, each with a distinct ability set)
6. Phase 8: Audio & Polish (Howler.js SFX + music, particles, screen shake, floating damage numbers)
7. Phase 9 (future): iOS Prep — Capacitor, touch controls, App Store pipeline

## Completed
- ~~Phase 1: Core game loop (Phaser setup, path, basic enemies, HUD)~~ (2026-05-07)
- ~~Phase 2: UIScene, Entity Containers, event-based panel~~ (2026-05-08)
- ~~Phase 3: Tower system, tier branching, hero abilities, soldiers~~ (2026-05-10)
- ~~Fix: Missing sniper/barracks defs — all 6 towers now selectable~~ (2026-05-12)
- ~~Phase 4 implementation: alien enemy shapes, MAP_WAVES, death particles, 38 tests~~ (2026-05-12)
- ~~Barracks/Soldier rebuild: soldiers, blocking, respawn, branch picker, reposition, 33 tests~~ (2026-05-14)
- ~~Merge PR #2 (Phase 4 alien enemy system)~~ (2026-05-14)
- ~~Merge PR #3 (Barracks/Soldier rebuild)~~ (2026-05-14)
- ~~Phase 5 spec + brainstorm: 10-map campaign, ProgressManager API, StoryManager, MapSelectScene~~ (2026-05-17)
- ~~Phase 5 implementation: 10 maps, phantom/titan enemies, ProgressManager, StoryManager, MapSelectScene, 116 tests, PR #4~~ (2026-05-17)
- ~~Merge PR #4 (Phase 5 Maps & Storyline)~~ (2026-05-18)
- ~~Phase 6: Hero Unit (Commander Rael) — 3 abilities, respawn, cooldown UI, 142 tests, PR #6~~ (2026-05-19)
- ~~Merge PR #6 (Phase 6 Hero Unit)~~ (2026-05-19)
- ~~Visual QA: phantom rings + titan hexagons confirmed rendering~~ (2026-05-19)
- ~~Phase 7 brainstorm + design spec (5ef33d7) + implementation plan (abb19e7)~~ (2026-05-19)
- ~~Phase 7 implementation: SaveManager, upgrade catalog, UpgradeManager, modifier threading, meta UI, UpgradeTreeOverlay — 169 tests, PR #7~~ (2026-05-19)
- ~~In-level Exit button — abandon a run mid-game, return to Map Select; confirm dialog + scene pause; fixed `#tower-panel`/`#game-msg` shutdown leaks — 172 tests, PR #8~~ (2026-05-20)
- ~~Merge PR #7 (Phase 7 Meta & Persistence)~~ (2026-05-20)
- ~~Merge PR #8 (in-level Exit button + DOM-leak fixes)~~ (2026-05-21)
