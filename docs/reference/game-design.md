# 🎮 TOWER DEFENSE GAME — Full Game Development Project Plan

Built with Claude Code · Phaser.js · Vite · Alien Theme

| Prototype Status | Target: Full Release |
|:---:|:---:|
| ✅ Complete | ~16–20 weeks |

---

## 1. Project Overview

This document is an instruction set for building the Tower Defense Game using Claude Code. The prototype (2 maps, 4 tower types, 10 waves, upgrade system) has been validated. This plan covers migrating to a production architecture, expanding content with an alien-themed universe, a narrative storyline, and polishing for browser and future iPhone release.

**What Claude Code will build:**

- A full Phaser.js alien-themed tower defense game with Vite build tooling
- Narrative storyline spanning all maps with cutscenes and character dialogue
- Hero unit system with abilities and cooldowns
- 5+ maps with hand-crafted waypoint layouts and lore
- 6 tower types with 4-tier upgrades and active abilities
- 8 alien enemy types with distinct visual designs, including wave 5 and wave 10 bosses per map
- Meta-progression: star ratings, persistent unlocks via localStorage
- Sound effects and music via Howler.js
- Mobile-responsive layout — designed for future iOS app conversion via Capacitor

---

## 2. Storyline & Narrative

The game has a complete narrative arc. Each map advances the story. Claude Code should render story moments as: pre-map intro screens, between-wave dialogue popups, and a victory/defeat screen with story context.

### The Story: Last Light

*Earth's deep-space listening array has gone dark. You are Commander Rael, last officer of Outpost Sigma. An alien swarm — the Veth — has emerged from a rift near Jupiter and is advancing toward Earth. Your towers are all that stand between the Veth and humanity's extinction. Hold the line.*

### Map Story Beats

Bosses appear on Map 5 and Map 10 only — not on every map's wave 5/10. Earlier maps build tension through story and escalating enemy difficulty, reserving true boss encounters for the campaign midpoint and finale.

| Map | Setting | Story Beat | Boss? |
|:---:|:---:|:---:|:---:|
| Map 1: Outpost Sigma | Asteroid defense platform | First contact. The Veth probe attack begins. Commander Rael activates towers for the first time. Learning map. | No boss. Final wave: large Drone surge. |
| Map 2: Lunar Gate | Moon's far side base | The Veth breach the lunar perimeter. Rael discovers the swarm has a hive mind. | No boss. Final wave: Brutes + Healers. |
| Map 3: Mars Corridor | Martian canyon trench | A refugee convoy is pinned down. Hold the canyon while civilians evacuate. First flying Veth units appear. | No boss. Final wave: Flyers + Skitters. |
| Map 4: Earth Orbit | Orbital defense ring | The Veth mothership enters orbit. Rael must hold the line. Phantoms and Colossus units appear for the first time. | No boss. Final wave: Phantoms + Colossi. |
| Map 5: Last Light ⭐ MID-BOSS | Earth's surface — first wave | The Veth Queen's vanguard arrives. Campaign midpoint. First true boss encounter on the final wave. | ✅ BOSS — Final wave: The Breacher |
| Map 6: Deep Space | Derelict station | Rael pursues the Queen's signal into deep space. Harder enemy combos. | No boss. Final wave: all enemy types. |
| Map 7: The Rift | Alien dimension | Inside the Veth homeworld. Alien terrain, disorienting path. | No boss. Final wave: Veth elite units. |
| Map 8: Mothership | Interior of the Veth ship | Rael infiltrates the mothership. Dense, fast waves. | No boss. Final wave: Queen Spawn surge. |
| Map 9: Core | The Queen's chamber approach | Last defense before the Queen. Hardest non-boss map. Everything the game has. | No boss. Final wave: full elite surge. |
| Map 10: The Queen ⭐ FINAL BOSS | The Veth Queen's throne | Humanity's last stand. The Veth Queen is the final boss — two-phase encounter on the last wave. | ✅ BOSS — Final wave: The Veth Queen (2-phase) |

### Narrative Implementation Instructions

- Pre-map screen: show setting image placeholder, 2–3 sentences of story text, a 'Deploy' button
- Boss maps (5 & 10) only: show a full-screen boss intro cutscene before the final wave — boss name, artwork placeholder, dramatic flavor text
- Non-boss maps: no cutscene; final wave is announced by the standard wave klaxon + wave counter
- Victory screen: show story resolution text + star rating + 'Continue' to next map
- Defeat screen: show Rael dialogue ('The line must hold...') + retry button
- Store all story text in `src/data/story.js` as a keyed object for easy editing

---

## 3. Tech Stack

| Layer | Technology | Rationale |
|:---:|:---:|:---:|
| Game Engine | **Phaser.js 3.x** | Industry standard browser game framework; handles game loop, asset loading, input |
| Build Tool | **Vite** | Fast HMR, zero-config; simple `npm run dev` to start |
| Language | **JavaScript (ES6+)** | Matches prototype; no transpile complexity; Capacitor-compatible |
| Audio | **Howler.js** | Best-in-class browser audio; spatial sound; mobile unlock handling |
| Persistence | **localStorage** | Zero-backend save for progress, unlocks, high scores |
| iOS Future | **Capacitor** | Wraps the Phaser web app into a native iPhone app with one CLI command |
| Hosting | **GitHub Pages / itch.io** | Free, zero-config browser hosting |
| Assets | **Kenney.nl / custom** | CC0 placeholder sprites; alien sprite packs available at kenney.nl/assets |

---

## 4. Phased Development Plan

Each phase should be a separate Claude Code session.

| Phase | Name | Goals | Duration |
|:---:|:---:|:---:|:---:|
| **Phase 1** | Project Scaffold | Vite + Phaser setup, folder structure, prototype migrated | 1–2 days |
| **Phase 2** | Core Game Engine | Path system, tower placement, enemy AI, projectiles, game loop | 3–4 days |
| **Phase 3** | Tower System | 6 towers, 4-tier upgrades, active abilities, UI panels | 3–5 days |
| **Phase 4** | Alien Enemy System | 8 alien enemy types, flying units, boss behaviors, wave scripting | 3–4 days |
| **Phase 5** | Maps & Storyline | 5 maps, story screens, boss intros, wave 5+10 boss spawns | 4–5 days |
| **Phase 6** | Hero Unit | Deployable hero, 3 abilities, cooldown UI, hero upgrades | 2–3 days |
| **Phase 7** | Meta & Persistence | Star ratings, unlock system, localStorage, main menu | 2 days |
| **Phase 8** | Audio & Polish | SFX, music, particles, screen shake, animations | 3–4 days |
| **Phase 9** | iOS Prep (Future) | Capacitor integration, touch controls, App Store build pipeline | 3–5 days |

---

## 5. Folder Structure

```
tower-defense-game/
├── src/
│   ├── scenes/         # Boot, Menu, MapSelect, Game, UI, Cutscene, GameOver
│   ├── entities/       # Tower, Enemy, Projectile, Hero, Boss classes
│   ├── systems/        # WaveManager, PathManager, EconomyManager, StoryManager
│   ├── data/           # towers.js, enemies.js, maps.js, waves.js, story.js
│   ├── ui/             # HUD, TowerPanel, UpgradePanel, WaveBtn, StoryOverlay
│   └── main.js
├── public/assets/
│   ├── sprites/        # Tower PNGs, alien enemy sprites, boss artwork
│   ├── audio/          # SFX and music (mp3/ogg)
│   └── maps/           # Background images per map
├── index.html
├── vite.config.js
└── package.json
```

---

## 6. Phase-by-Phase Claude Code Instructions

### Phase 1 — Project Scaffold

Set up a Vite + Phaser 3 project called tower-defense-game. Use the folder structure from the project plan. Install phaser and howler. Create a BootScene that loads placeholder assets, a MenuScene with Play and Credits buttons, and a GameScene stub. Migrate the existing prototype HTML game logic into GameScene as a reference — preserve all mechanics, just restructure into Phaser classes. Confirm the dev server runs with `npm run dev`.

### Phase 2 — Core Game Engine

Build PathManager: takes waypoint arrays, renders path with Phaser Graphics. Build TowerPlacementSystem: valid build zones adjacent to path, hover highlights, block placement on path. Build Enemy base class: hp, maxHp, speed, armor, reward, slowTimer, waypoint traversal. Build Projectile class: homing, splash radius, pierce flag. Build core game loop in GameScene: tower targeting (furthest along path), firing, cooldown, enemy movement, projectile hit detection. Build WaveManager stub that spawns 5 test normal enemies.

### Phase 3 — Tower System (4-Tier Upgrades + Map Upgrade Caps)

Create 6 tower types in `src/data/towers.js`. Each tower has 4 upgrade tiers. Tier 1 = base stats, Tier 2 = moderate improvement, Tier 3 = significant boost + visual change, Tier 4 = max power + special effect unlock. Towers: Archer, Mage, Cannon, Ice, Sniper, Barracks. Each has 1 active ability with cooldown. IMPORTANT: implement a per-map upgrade cap system. Each map definition in `maps.js` includes a `maxTierAllowed` value (1–4). The TowerPanel must read this value and grey out + disable upgrade buttons beyond the cap. Show a lock icon on capped tiers with tooltip 'Unlocked on Map X'. The upgrade cap lifts progressively as the player advances maps — this is a core progression mechanic, not just difficulty tuning. Build TowerPanel UI: stats display, upgrade button with cost and benefit, sell button (60% refund), ability button with cooldown, pip indicators 1–4 with lock state.

### Phase 4 — Alien Enemy System

Create 8 alien enemy types in `src/data/enemies.js`. All enemies are Veth aliens — style them with bioluminescent accents, insectoid/tentacled designs, and alien color palettes (greens, purples, sickly yellows). Types: (1) Veth Drone — normal, glowing green carapace; (2) Veth Skitter — fast, spider-like, orange; (3) Veth Brute — armored, heavy plating, grey-green; (4) Veth Flyer — flying unit, bat-winged, purple, only hit by archer/mage/cannon; (5) Veth Healer — heals nearby allies, bioluminescent pulse; (6) Veth Phantom — briefly turns invisible every 8s; (7) Veth Colossus — wave 5 mid-boss, large, 3x hp; (8) Veth Queen Spawn — wave 10 boss minion, spawned by map bosses. Use Phaser Graphics to draw these as stylized shapes with glow effects since we have no sprites yet — placeholder art that reads clearly as alien. Implement HP bars, death particles in alien colors.

### Phase 5 — Maps & Storyline

Create 10 maps in `src/data/maps.js` and all story content in `src/data/story.js`. Each map has: name, background color, waypoints, startGold, startLives, unlockCost, wave array, story keys, and `maxTierAllowed` (the tower upgrade cap for that map). Upgrade cap schedule: Map 1 = Tier 2 max, Map 2 = Tier 2 max, Map 3 = Tier 3 max, Map 4 = Tier 3 max, Maps 5–10 = Tier 4 max (all tiers unlocked). Implement StoryManager: pre-map intro screen (setting + story text + Deploy button). Boss maps only (Map 5 and Map 10): show full-screen boss intro cutscene before the final wave. Non-boss maps: no cutscene; final wave uses standard wave klaxon. Victory screen shows story resolution + stars. Defeat shows Rael dialogue + retry. Maps: (1) Outpost Sigma — easy, 10 waves, Tier 2 cap; (2) Lunar Gate — medium, 10 waves, Tier 2 cap; (3) Mars Corridor — medium, 12 waves, Tier 3 cap, flying enemies; (4) Earth Orbit — hard, 12 waves, Tier 3 cap, Phantoms introduced; (5) Last Light — hard, 14 waves, Tier 4 unlocked, final wave boss: The Breacher; (6–9) — increasingly hard, 14–16 waves, Tier 4; (10) The Queen — hardest, 20 waves, Tier 4, final wave boss: The Veth Queen (2-phase).

### Phase 6 — Hero Unit

Implement Commander Rael as a deployable hero. Place by clicking empty area near path. Auto-attacks nearest enemy. 3 abilities on Q/W/E or HUD buttons: (1) Overcharge — boosts all towers fire rate 50% for 6s; (2) Airstrike — call strike on target area, AoE damage; (3) EMP Pulse — stuns all aliens in large radius for 3s. Hero has HP, respawns after 20s if killed, levels up to 3 tiers by kill count. Show Rael as a distinct humanoid shape (blue suit, clearly not an alien). Show ability cooldown arcs on HUD buttons.

### Phase 7 — Meta & Persistence

Implement SaveManager with localStorage. Save: stars per map (0–3), total stars, unlocked maps, volume settings. Star rating: 3 = no lives lost, 2 = 1–5 lives lost, 1 = completed with more losses. Map select screen shows each map with star rating, lock status, and unlock cost in stars. Unlock costs: Map 1 free, Map 2: 5 stars, Map 3: 12 stars, Map 4: 25 stars, Map 5: 50 stars. Add persistent top-bar showing total stars earned.

### Phase 8 — Audio & Polish

Integrate Howler.js. SFX: tower fire per type (arrow twang, magic zap, cannon boom, ice crack, rifle shot, sword clash), alien death (wet/electronic sounds), alien reaching base, tower place, upgrade chime, wave start klaxon, boss roar, victory fanfare, defeat sting. Background music: tense electronic/orchestral per map, escalating intensity. Particles: muzzle flash, explosion, ice shatter, alien death goo splatter (green). Screen shake on boss death. Floating damage numbers. Mobile: pinch zoom, tap-hold for tower info, bottom HUD for small screens.

### Phase 9 — iOS Prep (Future Phase)

Integrate Capacitor to wrap the Phaser web app as a native iPhone app. Steps: `npm install @capacitor/core @capacitor/ios`, `npx cap init`, `npx cap add ios`, update vite.config.js base path for Capacitor, add touch event handling (tap = click, swipe to pan map), add iOS splash screen and app icon placeholders, test on iPhone simulator via Xcode. Do not submit to App Store yet — flag any iOS-specific rendering issues in a NOTES.md file for review.

---

## 7. Tower Upgrade Cap by Map

Tower upgrade tiers are gated by map progression. This is a core mechanic — earlier maps feel constrained by design, not difficulty alone.

| Map | Max Tier | Tiers Available | Design Intent |
|:---:|:---:|:---:|:---:|
| Map 1 — Outpost Sigma | **Tier 2** | 🟢🟢⬜⬜ | Learning map. Players master placement and basic upgrade loop without being overwhelmed. |
| Map 2 — Lunar Gate | **Tier 2** | 🟢🟢⬜⬜ | Still constrained. Harder enemies force smart use of Tier 2. |
| Map 3 — Mars Corridor | **Tier 3** | 🟢🟢🟢⬜ | Tier 3 unlocked — a meaningful reward for reaching Map 3. Visual tower changes reinforce the power spike. |
| Map 4 — Earth Orbit | **Tier 3** | 🟢🟢🟢⬜ | Full Tier 3 mastery required. Phantoms and Colossi demand smart upgrade prioritization. |
| Map 5 — Last Light | **Tier 4** | 🟢🟢🟢🟢 | All tiers unlocked. Boss map — players need full power to survive The Breacher. |
| Maps 6–10 | **Tier 4** | 🟢🟢🟢🟢 | No further caps. Difficulty scales through enemy design, not upgrade restrictions. |

Implementation note: the TowerPanel reads `maps.js` `maxTierAllowed` and disables upgrade buttons beyond that tier. Locked tiers show a 🔒 icon with tooltip 'Unlocked on Map 5'. The cap only applies to upgrades — all 6 tower types are available to place on every map.

---

## 8. Tower Reference Data

| Tower | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 4 Effect | Active Ability |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 🏹 Archer | 60g / 15dmg | 50g / 25dmg | 80g / 40dmg | 120g / 60dmg | Fires 2 arrows/shot | Volley: all-target burst 3s |
| 🔮 Mage | 90g / 30dmg | 60g / 50dmg | 90g / 80dmg | 130g / 120dmg | Chain lightning to 3 targets | Slow Nova: AoE freeze 2s |
| 💣 Cannon | 110g / 45dmg | 70g / 70dmg | 100g / 100dmg | 150g / 150dmg | Splits into 3 shells | Big Bomb: massive AoE 10s cd |
| ❄️ Ice | 80g / 8dmg | 55g / 12dmg | 85g / 18dmg | 110g / 28dmg | Slows to 15% speed | Blizzard: freeze all in range |
| 🎯 Sniper | 120g / 80dmg | 80g / 130dmg | 110g / 200dmg | 160g / 300dmg | Ignores armor, stuns boss 1s | Headshot: instakill non-boss |
| ⚔️ Barracks | 100g / 20dmg | 65g / 35dmg | 95g / 55dmg | 140g / 80dmg | Soldiers block flyers too | Reinforce: +2 soldiers 15s cd |

---

## 9. Alien Enemy Reference

All enemies are Veth aliens. Claude Code should render them with glowing outlines, insectoid shapes, and alien color palettes using Phaser Graphics until sprite art is available.

| Enemy | HP | Speed | Armor | Reward | Color | Special |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Veth Drone | 80 | 55 | 0 | 10g | Acid green | Normal unit; glowing carapace |
| Veth Skitter | 50 | 100 | 0 | 12g | Orange | Fast; spider legs; erratic movement |
| Veth Brute | 150 | 40 | 8 | 18g | Grey-green | Heavy armor plating; slow |
| Veth Flyer | 90 | 80 | 0 | 15g | Purple | Flying; only hit by Archer/Mage/Cannon |
| Veth Healer | 70 | 50 | 0 | 20g | Teal | Pulses heal aura to nearby Veth |
| Veth Phantom | 100 | 60 | 4 | 22g | Dark violet | Goes invisible 3s every 8s |
| **Veth Colossus** (Mid-Boss) | 800 | 30 | 15 | 60g | Deep red | Spawns 4 Drones on 50% HP |
| **Veth Queen** (Final Boss) | 2000 | 20 | 20 | 150g | Black + gold | Phase 2 at 50% HP; summons Phantoms |

---

## 10. Future Roadmap: iPhone App

*Phase 9 is scoped but not scheduled. Complete Phases 1–8 first. iOS conversion is a single phase using Capacitor — the browser-first architecture is intentionally chosen to make this straightforward.*

### Conversion Path

- Capacitor wraps the Phaser web app in a native WKWebView — no rewrite needed
- Touch controls replace mouse: tap = place/select, drag = pan, pinch = zoom
- Howler.js handles iOS audio unlock automatically
- Vite build outputs to `dist/`, Capacitor copies it into the iOS project
- Submit to App Store via Xcode — standard Apple review process applies

### iOS Design Considerations

- Use vh/vw units and Phaser's scale manager — avoid fixed pixel sizes
- Safe area insets: keep HUD elements out of iPhone notch/home bar zones
- Target 60fps on iPhone 12+; test on lower-end devices before submission
- App Store requirements: privacy policy, age rating (4+), no external payment links

### Monetization Options

- Free with ads (AdMob via Capacitor plugin)
- One-time purchase ($1.99–$4.99) — simplest, best for a game like this
- Free + IAP to unlock maps 4 and 5

---

## 11. Working with Claude Code

### Starting each session

- Say: "Read the project plan doc and the full src/ directory before making any changes."
- Say: "Summarize the current state of the codebase, then we will start Phase X."
- Paste the Phase instruction block from Section 6
- One phase per session — avoid scope creep mid-session

### Model recommendation

- Claude Opus — architecture, complex systems, boss AI, story system, debugging
- Claude Sonnet — new tower/enemy types, UI tweaks, balance changes, content additions

### Version control

- `git init` at project start, commit after every phase
- Use `git diff` before committing to review Claude Code's changes
- Tag releases: `git tag phase-1-complete` etc.
