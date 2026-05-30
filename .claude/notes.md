# Project: Last Light (Tower Defense)

## Goal
Build a fully playable tower defense game with 10 maps, 6 tower types with tier branching, distinct alien enemy visuals, and a storyline — deployed at https://tower-defense-black.vercel.app

## Current Status
Phases 1–9c all merged. PR #15 (fix-missing-music-crash — guards `AudioManager.playMusic` against missing cache keys, unblocks local dev when Phase 8b music files absent) merged today. PR #16 (dead-enemy cleanup) OPEN — 355 tests passing, browser-walkthrough verified.

## Blockers
- None active.

## Known Bugs
- Shooting effects appear in map locations where no tower exists (see backlog #1).

## In Progress
- **Dead-enemy cleanup — PR #16 OPEN.** Branch `feature/dead-enemy-cleanup` off `feature/phase-3-tower-system`. Adds `_fadeOutDeadEnemy` (300ms alpha tween → `destroy()`) and `_destroyDeadProjectile` (was leaking the Container; only the trail emitter was being destroyed). Spec + plan + 3 code commits + chore. 355 tests passing. Live-instrumented browser walkthrough caught fade tweens mid-flight (alpha 0.947 → 0.277 across 5 samples) and confirmed zero orphan corpses across an active wave (alive + fading = total Containers).

## Prioritized Backlog
1. **Bug:** shooting effects being duplicated in locations without towers (investigate ghost projectiles or stale firing positions).
2. **Phase 8b — Music curation:** 22 freesound.org CC0 tracks (10 ambient/combat pairs + 2 boss themes). Conversion scaffold (`scripts/convert-audio.sh`) + `public/audio/ATTRIBUTIONS.md` skeleton already live from PR #11. Missing-key crash now handled gracefully (PR #15), so this is no longer a blocker — just a polish gap.
3. **Replace placeholder victory.mp3/defeat.mp3 jingles** (Phase 8 deferred polish).
4. **Per-tower-branch SFX** for 5 tier-4 branches (currently reuse base fire sound).
5. **Per-enemy-type hit sounds** (currently generic + detuned).
6. **Art overhaul — sprite assets + animations + map backgrounds.** Today every visual is programmatic Phaser `Graphics` (colored circles, hexagons, polygons in `Enemy._redrawBody` / `Tower._redraw` / `Hero._drawBody`). Plan covers: (a) source/commission CC0 sprite sheets for enemies, towers, hero; (b) replace `Graphics` calls with sprite rendering; (c) add idle/walk/attack/death frame animations via Phaser's spritesheet animation API; (d) per-map tile-based background art (10 maps × distinct theming). Substantial work; can ship per-entity-type as separate PRs (enemies → towers → hero → maps) so it doesn't have to land as one giant change. Likely a quality threshold for App Store readiness, so prefer landing this before Phase 10.
7. **Hero placement restricted to paths** (currently heroes can be moved anywhere on the map; restrict click-to-move to path waypoints).
8. **Additional heroes with different skills** (hero roster — selectable heroes, each with a distinct ability set).
9. **Phase 10:** iOS via Capacitor — touch controls, App Store pipeline.

## Completed
- ~~Phase 1: Core game loop (Phaser setup, path, basic enemies, HUD)~~ (2026-05-07)
- ~~Phase 2: UIScene, Entity Containers, event-based panel~~ (2026-05-08)
- ~~Phase 3: Tower system, tier branching, hero abilities, soldiers~~ (2026-05-10)
- ~~Fix: Missing sniper/barracks defs — all 6 towers now selectable~~ (2026-05-12)
- ~~Phase 4 implementation: alien enemy shapes, MAP_WAVES, death particles, 38 tests~~ (2026-05-12)
- ~~Barracks/Soldier rebuild: soldiers, blocking, respawn, branch picker, reposition, 33 tests~~ (2026-05-14)
- ~~Merge PR #2 (Phase 4 alien enemy system)~~ (2026-05-14)
- ~~Merge PR #3 (Barracks/Soldier rebuild)~~ (2026-05-14)
- ~~Phase 5 implementation: 10 maps, phantom/titan enemies, ProgressManager, StoryManager, MapSelectScene, 116 tests, PR #4~~ (2026-05-17)
- ~~Merge PR #4 (Phase 5 Maps & Storyline)~~ (2026-05-18)
- ~~Runtime bug fixes: Phaser 3.60+ shutdown auto-binding removed; Enemy/Projectile (scene, opts) signature mismatch~~ (2026-05-18)
- ~~Phase 6: Hero Unit (Commander Rael) — 3 abilities, respawn, cooldown UI, 142 tests, PR #6~~ (2026-05-19)
- ~~Merge PR #6 (Phase 6 Hero Unit)~~ (2026-05-19)
- ~~Phase 7 implementation: SaveManager v2, upgrade catalog, UpgradeManager, modifier threading, meta UI, UpgradeTreeOverlay — 169 tests, PR #7~~ (2026-05-19)
- ~~In-level Exit button + DOM-leak fixes (panel + game-msg) — 172 tests, PR #8~~ (2026-05-20)
- ~~Merge PR #7 (Phase 7 Meta & Persistence)~~ (2026-05-20)
- ~~Merge PR #8 (in-level Exit + DOM-leak fixes)~~ (2026-05-21)
- ~~Phase 8 Tasks 1–5: SaveManager v3, AudioManager (volume/mute/SFX/music state machine), BootScene wiring, 190 tests~~ (2026-05-25)
- ~~Phase 8 Tasks 6–12, 14: SettingsOverlay, DamageNumberOverlay, ShakeController, ParticleSpawner, full call-site wiring, GameScene music-state + boss-theme trigger, howler dep removed, 215 tests, PR #10~~ (2026-05-26)
- ~~Merge PR #10 (Phase 8 Audio & Polish wiring)~~ (2026-05-27)
- ~~Phase 8 Task 13: CC0 SFX assets (23 sounds from Kenney Sci-Fi + UI Audio, 248 KB), PR #11~~ (2026-05-27)
- ~~Merge PR #11 (Phase 8 SFX assets)~~ (2026-05-27)
- ~~Phase 9a: Send-Wave-Early bonus — `WaveManager.isEarlyEligible`, live `(+Xg)` wave-button label, `floor(0.5 × Σ reward)` bonus + toast, PR #12~~ (2026-05-27)
- ~~Merge PR #12 (Phase 9a Send-Wave-Early)~~ (2026-05-28)
- ~~Phase 9b: Tower/Enemy weakness matrix — 6×6 base + sparse Tier-4 branch overrides + hero matchup table in `weaknessMatrix.js`, post-armor multiplier in `Enemy.takeDamage`, surfaces on tower-build hover tooltip + TowerPanel matchup line + Tier-4 branch picker "⚡ Nx vs X" hint, PR #13~~ (2026-05-28)
- ~~Merge PR #13 (Phase 9b Weakness Matrix)~~ (2026-05-28)
- ~~Phase 9c: Click-to-inspect overlay — hover-peek + click-pin inspector panels for enemies and hero, `describeEnemyMatchups` reverse-matrix view ("Vulnerable to / Resists"), 55 InspectController unit tests, PR #14~~ (2026-05-29)
- ~~Merge PR #14 (Phase 9c Click-to-Inspect)~~ (2026-05-29)
- ~~Audio crash fix: `AudioManager._addMusic` guards against missing cache keys (warn-once + return null instead of throw), `playMusic` null-safe; unblocks local dev when `public/audio/music/` is empty, 351 tests, PR #15~~ (2026-05-29)
- ~~Merge PR #15 (fix-missing-music-crash)~~ (2026-05-29)
