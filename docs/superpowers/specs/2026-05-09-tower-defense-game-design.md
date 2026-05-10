# Tower Defense Game — Design Spec

**Date:** 2026-05-09
**Reference:** `docs/reference/game-design.md` (full original doc)
**Prototype:** `docs/reference/prototype.html` (2 maps, 4 towers, 10 waves — validated)

---

## 1. Project Summary

An alien-themed browser tower defense game (akin to Kingdom Rush) built with Phaser.js 3.x + Vite. The player defends against the Veth — an alien swarm — across 10 maps with a full narrative arc. The prototype is a validated single-file canvas game; this project migrates it into a production Phaser architecture and expands it across 9 phases.

**Narrative:** Commander Rael defends Earth from the Veth swarm. Story titled "Last Light." Full details in `docs/reference/game-design.md` Section 2.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Game engine | Phaser.js 3.x | Industry standard; handles game loop, asset loading, input |
| Build tool | Vite | Fast HMR; `npm run dev` to start |
| Language | JavaScript ES6+ | Matches prototype; Capacitor-compatible; no transpile complexity |
| Audio | Howler.js | Phase 8 |
| Persistence | localStorage | Phase 7 |
| iOS (future) | Capacitor | Phase 9 — wraps Phaser web app as native WKWebView |
| Hosting | GitHub Pages / itch.io | Phase 8+ |

---

## 3. Architecture — Phaser Scenes + Class Hierarchy

**Approach:** Option B — Phaser Scenes with ES6 class entities. All game logic in class methods. Scenes communicate exclusively via Phaser's event emitter (no direct scene references in constructors).

**Expansion note:** If enemy types grow past ~15, refactor `Enemy` to a behavior bag pattern — a `behaviors[]` array of composable objects (e.g., `InvisibilityBehavior`, `HealAuraBehavior`) that tick each frame. Contained refactor of the `Enemy` class only; does not touch scenes, towers, or systems.

### Scene Flow

```
BootScene       → loads assets → MenuScene
MenuScene       → title screen → MapSelectScene
MapSelectScene  → star ratings, lock/unlock → GameScene (with mapId)
GameScene       → core game loop (runs parallel with UIScene)
UIScene         → HUD + panels (parallel with GameScene)
CutsceneScene   → boss intros on Maps 5 & 10 only → back to GameScene
GameOverScene   → victory/defeat + star rating + continue/retry
```

`GameScene` and `UIScene` run simultaneously as Phaser parallel scenes so the HUD never blocks the game loop.

---

## 4. Entity Class Hierarchy

All entities in `src/entities/`, all extend `Phaser.GameObjects.Container`.

### Tower
```
properties:  type, level (1–4), branch ('A'|'B'|null), range, damage,
             fireRate, splashRadius, slow, pierce, cooldownTimer
methods:     upgrade(tier, branch?)   — branch required when tier === 4
             sell()                   — returns 60% of total spent
             activateAbility()        — triggers active ability, starts cooldown
```

### Enemy
```
properties:  hp, maxHp, speed, armor, reward, waypointIndex,
             progress (distance along path),
             statusEffects: { slow: {timer, factor}, invisible: {timer}, ... }
methods:     takeDamage(amount, pierce)
             applyStatus(effect)
             onReachEnd()
             onDeath()
```
*statusEffects is a plain object — sufficient for 8 enemy types. Upgrade to behavior bag if types expand past ~15.*

### Projectile
```
properties:  damage, splashRadius, piercing, slowFactor,
             target: Enemy (homing) | {x,y} (AoE)
methods:     onHit()
```
Single class handles both homing projectiles (tracks Enemy ref) and fixed-point AoE (Cannon's Big Bomb uses `{x,y}`).

### Hero (Phase 6)
```
properties:  hp, level (1–3), killCount, respawnTimer
abilities:   slot 1 (L1): Overcharge — +50% tower fire rate 6s
             slot 2 (L2): Airstrike  — AoE damage on target area
             slot 3 (L3): EMP Pulse  — stuns all aliens in large radius 3s
```
Abilities unlock per hero level — Overcharge at L1, Airstrike at L2, EMP Pulse at L3. Hero levels by kill count. Respawns 20s after death. Shown as a distinct humanoid (blue suit).

### Boss (Phase 4/5)
```
extends:     Enemy
properties:  phase (1|2)
methods:     onHalfHealth() — triggers phase 2 or spawn burst
```
Two bosses only: The Breacher (Map 5 final wave) and The Veth Queen (Map 10 final wave, 2-phase).

---

## 5. Systems

All systems in `src/systems/`, plain ES6 classes instantiated by `GameScene`.

### PathManager
- `waypoints: Vector2[]` — loaded from `maps.js`
- `buildZones: BuildZone[]` — computed on map load, flanking the path
- `getProgress(enemy): number` — distance traveled along path (used for tower targeting)
- `isOnPath(x, y): boolean` — blocks tower placement
- `renderPath(graphics)` — draws path via Phaser Graphics

### WaveManager
- `waves: WaveConfig[]` — loaded from `waves.js` for current map
- `startWave()` — pre-computes full `spawnQueue: [{enemy, delayMs}]`, begins countdown
- `update(delta)` — drains spawnQueue, emits `enemy:spawn`
- `onWaveComplete()` — awards gold bonus, emits `wave:complete`

### EconomyManager
- `gold: number`, `lives: number`
- `spend(amount): boolean` — returns false if insufficient
- `earn(amount)`
- `loseLife()` — emits `game:defeat` at 0 lives

### StoryManager (Phase 5)
- `getMapIntro(mapId)` — `{setting, text}` for pre-map screen
- `getBossIntro(mapId)` — boss cutscene data (Maps 5 & 10 only)
- `getVictoryText(mapId)`
- `getDefeatQuote()` — Rael dialogue

### SaveManager (Phase 7)
- `load()` / `save()` — reads/writes localStorage
- `getStars(mapId): 0|1|2|3`
- `setStars(mapId, stars)`
- `isUnlocked(mapId): boolean`
- `getTotalStars(): number`

---

## 6. Data Layer

All files in `src/data/`, plain JS exported constants. No logic — configuration only.

| File | Contents |
|---|---|
| `towers.js` | 6 tower definitions — base stats, tiers 1–3, tier4A + tier4B branches, active ability config |
| `enemies.js` | 8 enemy definitions — hp, speed, armor, reward, color, behavior flags |
| `maps.js` | 10 map definitions — waypoints, startGold, startLives, unlockCost, maxTierAllowed, waveCount, storyKeys |
| `waves.js` | Wave configs per map — `[{enemyType, count, interval}]` groups |
| `story.js` | Keyed story text — mapIntros, bossIntros, victoryLines, Rael defeat quotes |

---

## 7. Tower System

### Tier Structure
- **4 total levels** (Tier 1 = placed state, Tiers 2–3–4 = 3 upgrade actions)
- Tier 1: base stats (paid at placement)
- Tier 2: moderate stat improvement
- Tier 3: significant boost + visual change
- Tier 4: **branching** — two mutually exclusive paths (A and B)

### Tier 4 Branching
At Tier 3, `TowerPanel` shows a branch picker — two side-by-side cards (Tier 4A vs 4B) showing cost, stat delta, and passive effect. Choosing one locks the other for that tower instance. Panel reverts to standard view showing chosen path. On maps where `maxTierAllowed < 4`, branch picker never appears.

`towers.js` structure per tower:
```js
{
  tier1: { cost, damage, range, fireRate, ... },
  tier2: { cost, ...upgrades },
  tier3: { cost, ...upgrades },
  tier4A: { cost, label, passiveEffect, ...upgrades },
  tier4B: { cost, label, passiveEffect, ...upgrades },
  ability: { label, cooldown, effect }
}
```

Branch content (12 variants — 6 towers × 2 branches) to be designed and written into `towers.js` before Phase 3. Seed definitions from the reference doc's tower table; split Tier 4 into two meaningful paths per tower.

### Active Abilities
Each tower has one active ability available from Tier 1 (always present, not a Tier 4 unlock). Activated via cooldown button in `TowerPanel`. Reference doc Section 8 lists all 6 abilities.

### Upgrade Cap by Map
`maxTierAllowed` in `maps.js` gates upgrade access:
- Maps 1–2: Tier 2 max
- Maps 3–4: Tier 3 max (Tier 4 branching locked)
- Maps 5–10: Tier 4 max (full branching available)

All 6 tower types are placeable on every map regardless of cap.

---

## 8. Enemy System

8 Veth alien enemy types. Rendered with Phaser Graphics (glowing outlines, alien color palettes) until sprite art is available. Full stats in reference doc Section 9.

| Enemy | Special behavior |
|---|---|
| Veth Drone | Normal |
| Veth Skitter | Fast, erratic movement |
| Veth Brute | Armored |
| Veth Flyer | Flying — only hit by Archer/Mage/Cannon |
| Veth Healer | Pulses heal aura to nearby Veth |
| Veth Phantom | Turns invisible 3s every 8s |
| Veth Colossus | Mid-boss (Map 5); spawns 4 Drones at 50% HP |
| Veth Queen | Final boss (Map 10); 2-phase at 50% HP, summons Phantoms |

---

## 9. UI Layout

**Bottom Bar layout** (confirmed over prototype's right sidebar).

```
┌─────────────────────────────────────────────┐
│  ❤️ 20   💰 150   🌊 3/10   💀 47    ⏩   │  ← HUD (top bar)
├─────────────────────────────────────────────┤
│                                             │
│              GAME CANVAS                    │  ← Phaser canvas (full width)
│                                             │
├─────────────────────────────────────────────┤
│  🏹60  🔮90  💣110  ❄️80  🎯120  ⚔️100  [▶ Wave 1] │  ← BottomBar
└─────────────────────────────────────────────┘
```

### UI Components (in `src/ui/`)
- **HUD** — top bar: lives, gold, wave counter, speed toggle; hero ability buttons (Q/W/E) greyed until hero reaches unlock level
- **BottomBar** — 6 tower build buttons + wave send button; dims towers the player can't afford
- **TowerPanel** — floating overlay on tower click: stats, upgrade buttons (locked tiers show 🔒 + tooltip), sell button (60% refund), active ability button with cooldown arc; at Tier 3 shows branch picker cards
- **StoryOverlay** — full-screen pre-map intro (all maps) and boss cutscene (Maps 5 & 10 only)
- **StarRating** — victory/defeat screen with 0–3 stars, story text, continue/retry

`TowerPanel` is a DOM div overlaid on the canvas (same approach as prototype) — simpler than a Phaser GameObject for text-heavy UI.

---

## 10. Phase Plan

One phase per Claude Code session. Full phase instructions in `docs/reference/game-design.md` Section 6.

| Phase | Name | Key output |
|---|---|---|
| 1 | Project Scaffold | Vite + Phaser setup, folder structure, prototype migrated into GameScene |
| 2 | Core Game Engine | PathManager, TowerPlacement, Enemy AI, Projectile, WaveManager stub |
| 3 | Tower System | 6 towers, 4-tier + branching upgrades, active abilities, TowerPanel with branch picker |
| 4 | Alien Enemy System | 8 Veth types, flying units, boss behaviors, wave scripting |
| 5 | Maps & Storyline | 10 maps, StoryManager, boss cutscenes (Maps 5 & 10), star rating |
| 6 | Hero Unit | Commander Rael, 3 abilities unlocked per level, respawn, cooldown UI |
| 7 | Meta & Persistence | SaveManager, map unlock flow, total stars bar |
| 8 | Audio & Polish | Howler.js SFX + music, particles, screen shake, floating damage numbers |
| 9 | iOS Prep (future) | Capacitor, touch controls, App Store build pipeline |

---

## 11. Deviations from Original Doc

| Decision | Original doc | This spec |
|---|---|---|
| HUD layout | Right sidebar (prototype style) | Bottom bar (Kingdom Rush style, better for 6 towers + mobile) |
| Tower upgrade branching | Linear 4 tiers | Tier 4 splits into two mutually exclusive branches (A/B) per tower |
| Hero ability unlock | Not specified | Abilities unlock per hero level: Overcharge L1, Airstrike L2, EMP Pulse L3 |
| Tower level count | "4-tier upgrades" (ambiguous) | 4 total levels (Tier 1 = base at placement, 3 upgrade actions to reach Tier 4) |
| Active ability availability | Not specified | Available from Tier 1 (not a Tier 4 unlock) |
