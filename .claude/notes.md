# Project: Last Light (Tower Defense)

## Goal
Build a fully playable tower defense game with 10 maps, 6 tower types with tier branching, distinct alien enemy visuals, and a storyline — deployed at https://tower-defense-black.vercel.app

## Current Status
Phase 7 (Meta & Persistence) merged (PR #7). In-level Exit + DOM-leak fixes merged (PR #8). Phase 8 (Audio & Polish) wiring complete on branch `feature/phase-8-audio-polish` — SaveManager v2 + settings, AudioManager (volume/mute/SFX/two-layer music with cross-fade + boss themes), SettingsOverlay + gear button, DamageNumberOverlay, ShakeController, ParticleSpawner, full call-site wiring in Enemy/Hero/Projectile/GameScene, music state machine in GameScene with boss-theme trigger on titans for Maps 5/10. 215 tests passing. Howler dependency removed (Phaser WebAudio used directly). Task 13 (CC0 audio curation) deferred — PR ships wiring-only; audio file 404s expected until assets land.

## Blockers
- None active

## Known Bugs
- None active (the `#tower-panel` and `#game-msg` leaks were fixed in PR #8 — `GameScene.shutdown()` now hides both)

## In Progress
- **Phase 8 (Audio & Polish) — PR open, awaiting CC0 asset curation:** PR ships full wiring + tests; audio files (23 SFX + 22 music tracks) still need hand-curation from Kenney/freesound (deferred Task 13). Manual browser verification of audio behavior pending until assets land.

## Prioritized Backlog
1. Option to send the next wave early for bonus gold (reward scales with time saved)
2. Remove dead enemies from the battlefield (clean up corpses/leftover sprites)
3. Add a click overlay to view hero & enemy info (stats panel on click)
4. Confirm enemies have different weaknesses for different towers (investigate current type/damage interactions; add if missing)
5. Additional heroes with different skills (hero roster — selectable heroes, each with a distinct ability set)
6. **Phase 8b (deferred from Phase 8):** per-tower SFX for 5 tier-4 branches (currently reuse base fire sound); per-enemy-type hit sounds (currently generic + detuned)
7. Phase 9 (future): iOS Prep — Capacitor, touch controls, App Store pipeline
8. Hero can only be placed on paths (restrict hero movement/placement to path waypoints)
9. **Bug:** shooting effects being duplicated in locations without towers (investigate ghost projectiles or stale firing positions)

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
- ~~Phase 7 brainstorm + design spec + implementation plan~~ (2026-05-19)
- ~~Phase 7 implementation: SaveManager, upgrade catalog, UpgradeManager, modifier threading, meta UI, UpgradeTreeOverlay — 169 tests, PR #7~~ (2026-05-19)
- ~~In-level Exit button — abandon a run mid-game, return to Map Select; confirm dialog + scene pause; fixed `#tower-panel`/`#game-msg` shutdown leaks — 172 tests, PR #8~~ (2026-05-20)
- ~~Merge PR #7 (Phase 7 Meta & Persistence)~~ (2026-05-20)
- ~~Merge PR #8 (in-level Exit button + DOM-leak fixes)~~ (2026-05-21)
- ~~Phase 8 plan corrections: Task 11 rewritten to match real call sites (spec assumed Tower.fire/Enemy.die/Hero.die/Hero.useAbility — none exist); Task 1 future-version warn; Task 7 Esc/backdrop close; Task 10 ring graphics; Task 12 boss-music trigger~~ (2026-05-25)
- ~~Phase 8 Tasks 1–5 implementation (AudioManager block): SaveManager v3+ warn, AudioManager volume/mute/SFX/music state machine, BootScene registry wiring, 190 tests~~ (2026-05-25)
- ~~Phase 8 Tasks 6–12, 14 implementation: SettingsOverlay + gear button, DamageNumberOverlay, ShakeController, ParticleSpawner, full call-site wiring (Enemy/Hero/Projectile/GameScene), GameScene mounts polish systems + combat-music state + boss-theme trigger, howler dep removed, 215 tests~~ (2026-05-26)
