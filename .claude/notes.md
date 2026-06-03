# Project: Last Light (Tower Defense)

## Goal
Build a fully playable tower defense game with 10 maps, 6 tower types with tier branching, distinct alien enemy visuals, and a storyline — deployed at https://tower-defense-black.vercel.app

## Current Status
Phases 1–8 + 9a (send-wave-early) + 9b (weakness matrix) + 9c (click-to-inspect) + dead-enemy cleanup (PR #16) + hero path-restriction (PR #17) + hero roster (PR #18) all merged. Phase 8b music curation + victory/defeat replacement + OGG/Opus latency fix shipped on `feature/phase-8b-music-curation` (PR pending). 470 tests passing.

## Blockers
- None active

## Known Bugs
- Hero may not be blocking enemies on Level 2 (Lunar Gate) — reported 2026-05-30, unverified.

## In Progress
- **Phase 8b music curation + OGG/Opus latency fix** — `feature/phase-8b-music-curation` branch off `feature/phase-3-tower-system`. 22 CC0 music tracks + victory/defeat SFX shipped; OGG/Opus dual-format load now eliminates ~5s decode wait (modern browsers fetch `.ogg`, Safari <17.4 falls back to `.mp3`). 470 tests passing, audio bundle ~16 MB on disk / ~5.4 MB over-wire for modern browsers. PR pending.

## Prioritized Backlog
1. **Phase 8b — remaining SFX work (music + victory/defeat shipped 2026-05-31):** per-tower SFX for 5 tier-4 branches (currently reuse base fire sound); per-enemy-type hit sounds (currently generic + detuned)
2. Phase 10 (future): iOS Prep — Capacitor, touch controls, App Store pipeline
3. Verify hero is working properly on Level 2 (Lunar Gate) — reports indicate hero isn't blocking any enemies; verify against post-PR-17 state _(added 2026-05-30)_
4. Resize game canvas as the browser window resizes (responsive Phaser scaling) _(added 2026-05-30)_
5. **AreaEffectsManager `followsTarget.dead` not handled** — Pyromancer's Immolate aura (8s, follows hero) keeps ticking 10 dps if hero dies mid-aura, and if hero respawns before the aura ends, the aura teleports to the respawn point. T5 design gap exposed by T15. Fix: in `AreaEffectsManager.update`, treat `eff.followsTarget?.dead` as duration-expired. _(added 2026-05-31)_
6. **heroAbilities.test.js mid-file imports** — T15 appended `import { pyroFlameWave, ... }` and `import { vi } from 'vitest'` mid-file. Violates ~/projects/CLAUDE.md "imports at the top". Trivial fix: hoist + dedupe. _(added 2026-05-31)_
7. **"Heroes" icon on MapSelect → hero management UI** — add an icon button next to the existing ⚙ Upgrades / ♪ Audio cluster that opens a unified Hero Management overlay. Inside: hero picker (current MapSelect cards, larger) + per-hero upgrade tree (current overlay's per-hero branches, scoped to the selected hero). Lets player switch hero + spend stars on one hero without leaving the modal. _(added 2026-05-31)_
8. **Overarching storyline + per-level mini-stories** — write a campaign narrative explaining *why* the player is fighting through the 10 maps toward the final level (player motivation, faction, end goal). Add a short mini-story per map (pre-battle briefing / post-battle epilogue), tying boss-bearing levels into key story beats. Surface via StoryManager or pre-wave dialog. _(added 2026-05-31)_
9. **Space-themed backgrounds per level** — replace generic terrain with distinct space settings per map: planets (terrestrial, ice, lava, gas giant), space ships (interior corridor, hangar), asteroids, derelicts, orbital stations, nebulae. Each map gets its own visual identity tied to its mini-story. _(added 2026-05-31)_
10. **Map-progression overworld for MapSelect** — replace the current card grid with a map/star-chart UI showing the 10 levels as nodes connected by a progression path (Super Mario World / FTL-style). Visualizes the journey and locked/unlocked state spatially. _(added 2026-05-31)_
11. **Add music to main menu (MapSelectScene)** — `MapSelectScene` currently plays no music; player lands on a silent map-picker after the boot splash. Only `GameScene.create` calls `AudioManager.playMusic(mapId)`. Options: (a) reuse `map-0-ambient` as a low-volume menu loop, (b) curate a dedicated `menu` track (calm, mysterious — sets the tone before levels), (c) curate `menu-ambient` + use existing combat-swap mechanism with a different fanfare on map-select hover. With Opus decode now sub-100ms, a quiet menu loop drops in trivially. _(added 2026-05-31)_

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
- ~~Hero roster T13 (Engineer Dax): engRepair/engDeployTurret/engPowerSurge pure ability fns + 5 tests, HEROES.engineer registry entry (hex-hardhat draw, anti-armor matchups), GameScene wires _sentries list + _updateSentries + replaces 3 ability-handler stubs — 419 tests, commit 1abb651~~ (2026-05-31)
- ~~Hero roster T14 (Scout Vex): scoutMark/scoutVolley/scoutPhase pure ability fns + 5 tests, HEROES.scout registry entry (hooded-scout draw, anti-air matchups), GameScene wires 3 handler stubs (Mark→vulnerable status, Volley→AoE damage with brief line VFX, Phase Sprint→cloak+speed boost via existing Hero.update countdown) — 430 tests, commit e458106~~ (2026-05-31)
- ~~Hero roster T15 (Pyromancer Mira): 4 pure ability fns including pyroBurnOnHit + 4 tests, HEROES.pyro entry with onHit:pyroBurnOnHit (3dps/2s burn per melee hit) + anti-swarm matchups, GameScene wires AreaEffectsManager (Immolate aura + Firefield pool) + Flame Wave cone math + inline VFX — 440 tests, commit 24cb967~~ (2026-05-31)
- ~~Hero roster T16 (SaveManager v3): selectedHeroId default 'rael', v1→v2→v3 migration with cmd_*→rael_* upgrade rename, isHeroUnlocked(heroId) based on map stars, 8 new tests — 448 tests, commit 40c03d0~~ (2026-05-31)
- ~~Hero roster T17 (Upgrades restructure): 25-node tree (4 per hero × 4 + 4 logistics + 5 arsenal), heroUnlock gate on non-Rael nodes, UpgradeManager.getModifiers(heroId) scopes hero modifiers, canPurchase + getNodeState honor heroUnlock — 451 tests, commit e79e17f~~ (2026-05-31)
- ~~Hero roster T18 (MapSelect hero picker): 4 cards with portrait/color/locked state + tooltips, click persists selectedHeroId, heroId passed to scene.start, 6 new tests — 457 tests, commit 17e8e08~~ (2026-05-31)
- ~~Hero roster T19 (Dynamic HUD): hero:hud-init event rewrites portrait/level/HP-fill/ability icons + tooltips per hero, _onHeroLevelUp reads cached _heroDef.shortName — commit 93e447f~~ (2026-05-31)
- ~~Hero roster T20 (Upgrade overlay restructure): 6 branches (4 hero + logistics + arsenal) with title/subtitle headings, locked-hero state for hero-gated nodes — commit 0711ab4~~ (2026-05-31)
- ~~Hero roster T21 (verification): full test suite green, lint skipped (no eslint.config.js), manual play-through deferred~~ (2026-05-31)
- ~~Hero roster T22 (back-compat cleanup): removed HERO_STATS export, HERO_MULTIPLIERS re-export, heroAirstrikeSource alias, legacy overcharge/airstrike/empPulse timer getters; migrated all consumers; stale-comment fix on retained ability wrappers — commits 7df445a + a3a24d2~~ (2026-05-31)
- ~~Hero roster follow-up: UIScene was never launched (pre-existing since Phase 6) — GameScene now scene.launch('UIScene') after hero/economy ready; UIScene.create bootstraps _onHeroHudInit on first paint so hero swap works end-to-end. Browser-verified Engineer/Scout HUD swap — commit 8cb1d20~~ (2026-05-31)
- ~~Hero roster follow-up #6 fix: tower fire-rate mods now compose via multiplier stack (systems/fireRateMods.js). Each ability registers a named mod; _baseFireRate captured once and never overwritten; fireRate = base × product(mods). Resolves Surge × Overcharge collision that left towers permanently at 2× rate. 6 new tests + browser-verified the exact regression sequence — 463 tests, commit 9672cc7~~ (2026-05-31)
- ~~PR #18 opened for hero-roster branch (33 commits, +6745/-345, base feature/phase-3-tower-system)~~ (2026-05-31)
- ~~Merge PR #17 (hero path-restriction)~~ (2026-05-31)
- ~~Hero roster merge resolution: free-form `moveTo` replaced by path-restricted `moveToProgress`; speed scales by def.stats.moveSpeed × _moveSpeedMult (preserves Scout's Phase Sprint); _facingX derives from movement direction; obsolete constants/exports already cleaned in T22 dropped — commit 70c12ca~~ (2026-05-31)
- ~~Merge PR #18 (hero roster)~~ (2026-05-31)
- ~~Phase 8b music curation brainstorm + design spec + implementation plan (12 tasks)~~ (2026-05-31)
- ~~Phase 8b — music curation (22 CC0 tracks + 2 SFX replacements): 10 map ambient/combat pairs + boss-mid + boss-final, victory/defeat fanfares, ATTRIBUTIONS.md updated, 0 audio decode errors on page load (was 22), `convert-audio.sh` extended with BOSS_DURATION=75s + MUSIC_BITRATE dropped to 64k, audio bundle ~10MB, automated `scripts/fetch-phase-8b-staging.sh` downloader replaces manual staging~~ (2026-05-31)
- ~~Music start-of-level latency fix (backlog #11): OGG/Opus dual-format load via `[ogg, mp3]` URL array in AudioManager.loadAssets — Phaser auto-picks fastest supported format. Modern browsers fetch `.ogg` (sub-100ms decode), iOS Safari <17.4 falls back to `.mp3`. 45 new `.ogg` files (~5.4 MB), new `scripts/mp3-to-opus.sh` helper, `convert-audio.sh` extended with Opus pass + libopus precondition check. 2 new unit tests, browser-verified music begins on scene start (was ~5s wait). 470 tests passing.~~ (2026-06-02)
