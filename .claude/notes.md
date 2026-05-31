# Project: Last Light (Tower Defense)

## Goal
Build a fully playable tower defense game with 10 maps, 6 tower types with tier branching, distinct alien enemy visuals, and a storyline — deployed at https://tower-defense-black.vercel.app

## Current Status
Phases 1–8 + 9a (send-wave-early) + 9b (weakness matrix) + 9c (click-to-inspect) all merged to production. Dead-enemy cleanup also merged (PR #16). Two backlog items currently in flight on separate branches:
- `feature/hero-path-restriction` — pathProgress + setPathPosition + 40px corridor snap-or-reject. 5 commits, no PR yet.
- `feature/hero-roster` — backlog item #1 (additional heroes with different skills). 19 commits, no PR yet. Phase 1 (foundations) + Phase 2 (HEROES registry + Hero data-driven refactor) complete; T13–T22 + final review pending. 408 tests passing.

## Blockers
- None active

## Known Bugs
- Hero may not be blocking enemies on Level 2 (Lunar Gate) — reported 2026-05-30, unverified. Likely related to path-progress work currently on `feature/hero-path-restriction`.

## In Progress
- **Hero roster** on branch `feature/hero-roster` (Phase 1+2 of 6 complete). Foundations + HEROES registry shipped: Soldier.heal, source builders heroId-aware, Enemy burn/vulnerable statuses, AreaEffectsManager, SentryTurret, HEROES registry, Hero.js data-driven refactor, GameScene fireAbility dispatcher, weaknessMatrix reads HEROES, InspectController reads hero.def. Plan + spec committed. Stashed: `stash@{0}` on `feature/hero-path-restriction` has prior in-flight edits to .claude/notes.md / sessions.md / SESSION_NOTES.md from before the branch switch.
- **Hero path-restriction** on branch `feature/hero-path-restriction`: pathProgress + `setPathPosition` infrastructure, 40px corridor snap-or-reject, Soldier-parity post-loop fallthrough, tests for backward movement and multi-segment boundary. Needs PR.

## Prioritized Backlog
1. **Hero roster Phase 3–6 (T13–T22)** on `feature/hero-roster`: three new heroes (Engineer Dax / Scout Vex / Pyromancer Mira) + SaveManager v3 + per-hero upgrade tree + MapSelect hero picker + UIScene dynamic HUD + UpgradeTreeOverlay restructure + verification + cleanup. Plan: `docs/superpowers/plans/2026-05-30-hero-roster.md`.
2. **Phase 8b (deferred from Phase 8):** music curation (22 freesound.org CC0 tracks — 10 ambient/combat pairs + 2 boss themes); per-tower SFX for 5 tier-4 branches (currently reuse base fire sound); per-enemy-type hit sounds (currently generic + detuned); replace placeholder victory.mp3/defeat.mp3
3. Phase 10 (future): iOS Prep — Capacitor, touch controls, App Store pipeline
4. Verify hero is working properly on Level 2 (Lunar Gate) — reports indicate hero isn't blocking any enemies; likely related to path-restriction work on `feature/hero-path-restriction` or map-specific path geometry _(added 2026-05-30)_
5. Resize game canvas as the browser window resizes (responsive Phaser scaling) _(added 2026-05-30)_

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
- ~~Merge PR #10 (Phase 8 Audio & Polish wiring) + PR #11 (Phase 8 SFX assets — 23 Kenney CC0 sounds, 248 KB)~~ (2026-05-26 / 2026-05-27)
- ~~Phase 9a — Send-Wave-Early bonus (PR #12): WaveManager.isEarlyEligible, live `(+Xg)` wave-button label, `floor(0.5 × Σ reward)` bonus + toast~~ (2026-05-27)
- ~~Phase 9b — Tower/Enemy Weakness Matrix (PR #13): 6×6 base matrix + Tier-4 branch overrides + hero matchup, post-armor multiplier in Enemy.takeDamage, UI surfaces on build hover + TowerPanel + branch picker, 263 tests~~ (2026-05-28)
- ~~Phase 9c — Click-to-Inspect Overlay (PR #14): InspectController (272 lines, 55 unit tests), describeEnemyMatchups reverse-matrix helper, enemy/hero peek + pin panels with vulnerable/resists lines, 348 tests~~ (2026-05-29)
- ~~Dead-enemy cleanup (PR #16): projectile Container destruction on death~~ (2026-05-30)
- ~~Hero path-restriction infrastructure: pathProgress + setPathPosition, 40px corridor snap-or-reject, Soldier-parity post-loop fallthrough, backward-movement + multi-segment boundary tests~~ (2026-05-30 — on branch, PR pending)
- ~~Hero roster brainstorm + design spec + implementation plan (22 tasks, ~1900 lines)~~ (2026-05-30 — on `feature/hero-roster`)
- ~~Hero roster Phase 1 (T1–T6): Soldier.heal, source builders heroId-aware + burnSource, Enemy burn DoT + vulnerable status, AreaEffectsManager, SentryTurret + cooldown drift fix~~ (2026-05-30)
- ~~Hero roster Phase 2 (T7–T12): HEROES registry with Rael + ability impl tests, Hero.js data-driven refactor + back-compat wrappers, GameScene fireAbility dispatcher + 9 stub handlers, weaknessMatrix reads HEROES.matchups, InspectController reads hero.def — 408 tests, no PR yet~~ (2026-05-30)
