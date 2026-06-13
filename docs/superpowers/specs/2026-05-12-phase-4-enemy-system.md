# Phase 4 — Alien Enemy System (Map 1)

**Date:** 2026-05-12
**Scope:** Map 1 (Outpost Sigma) only. Defers multi-map wave scripting and remaining enemy types (Flyer, Healer, Phantom, Colossus boss behavior, Queen) to Phase 5.

---

## 1. Summary

Phase 4 delivers a complete, playable Map 1 with three visually distinct alien enemy types, death particles, and a balanced 10-wave progression. No new enemy behaviors (Skitter erratic movement deferred). No new enemy type definitions beyond the existing three. Visual aesthetic is functional placeholder — detailed alien art deferred to Phase 8 (Polish).

---

## 2. Scope

### In scope
- Type-based enemy shape rendering (Drone, Skitter, Brute) — replaces the current all-circles approach
- Glow ring effect per enemy type
- Death particles on `onDeath()`
- Map 1 wave balance: 10 waves, Colossus removed, final wave = large Drone surge

### Out of scope
- Skitter erratic movement behavior
- New enemy types (Flyer, Healer, Phantom, Queen)
- Colossus spawn-burst behavior
- Multi-map wave scripting
- Detailed alien visual art (Phase 8)
- `maps.js` schema changes — already in place from Phase 3

---

## 3. Enemy Visual System

### Current state
`Enemy._redrawBody()` draws all types as a filled circle in the enemy's color. HP bars already implemented in `_redrawHpBar()`.

### Changes to `Enemy.js`

Add type-based dispatch to `_redrawBody()`. Each type gets a distinct shape plus a low-alpha glow ring (same color, larger radius, alpha ~0.25).

| Type | Shape | Color | Glow |
|---|---|---|---|
| `drone` | Hexagon (6-sided polygon) | `0x33ff66` acid green | Soft outer hex at 1.5× radius, alpha 0.2 |
| `skitter` | Elongated diamond + 4 radial leg lines | `0xff6600` orange | Oval ring at 1.4× radius, alpha 0.2 |
| `brute` | Shield shape (wide hex with flat top) + darker inner fill | `0x667766` grey-green | Thick stroke ring at 1.3× radius, alpha 0.15 |

All shapes drawn with Phaser Graphics `fillPoints` or `fillTriangle`/`fillRect` composites. Shapes centered at `(0, 0)` within the Container. Drop shadow ellipse below preserved from current implementation.

Slow status effect ring (ice blue stroke) preserved — drawn on top of shape when `statusEffects.slow.active`.

### Death Particles

`GameScene` calls `enemy._spawnDeathParticles()` when it detects `enemy.dead === true`, immediately before destroying the enemy Container. Particles are added directly to the scene (not the Container) so they outlive the enemy.

- Emit 6–8 `Graphics` circles (radius 2–4px) at the enemy's current world position
- Each dot gets a random velocity vector (spread ~120°, speed 40–80px/s)
- Tween each dot: move outward + alpha 1 → 0 over 350–450ms
- Color matches the enemy type's base color
- No Phaser particle system dependency — plain tweened Graphics objects

---

## 4. Map 1 Wave Balance

### Current state
`waves.js` `makeWaves()` function includes Colossus on waves 7, 9, and 10. Colossus is not appropriate for Map 1 (narrative: first contact, learning map).

### Changes to `waves.js`

Replace `makeWaves()` with a `MAP_WAVES` object keyed by map id so each map has its own self-contained wave definition. Map 1 waves:

| Wave | Groups | Intent |
|---|---|---|
| 1 | 7 Drones @ 1200ms | Basic intro — tower placement |
| 2 | 9 Drones @ 1100ms + 3 Skitters @ 950ms | Introduce fast enemies |
| 3 | 8 Skitters @ 850ms | Pure speed pressure |
| 4 | 4 Brutes @ 1400ms | Introduce armor |
| 5 | 8 Drones @ 1000ms + 3 Brutes @ 1400ms | Mixed — learn prioritization |
| 6 | 6 Skitters @ 800ms + 4 Brutes @ 1300ms | Speed + armor combo |
| 7 | 10 Drones @ 900ms + 5 Skitters @ 750ms | Dense swarm |
| 8 | 8 Brutes @ 1100ms + 5 Skitters @ 700ms | Tough + fast |
| 9 | 10 Drones @ 900ms + 6 Brutes @ 1000ms + 6 Skitters @ 750ms | All three types |
| 10 | 20 Drones @ 700ms | Large Drone surge — narrative finale |

Each map's wave array is self-contained. The shared `makeWaves()` function (which applied a 1.5× multiplier for Lunar Gate) is replaced — per-map wave counts are defined directly.

---

## 5. Architecture

### Files changed
| File | Change |
|---|---|
| `src/entities/Enemy.js` | `_redrawBody()` type dispatch, `_spawnDeathParticles()` |
| `src/data/waves.js` | Replace `makeWaves()` with `MAP_WAVES` object keyed by map id |
| `src/scenes/GameScene.js` | Call `enemy._spawnDeathParticles()` on enemy death; load waves via `MAP_WAVES[mapId]` |

### Files unchanged
| File | Reason |
|---|---|
| `src/data/enemies.js` | Existing Drone/Skitter/Brute defs used as-is; minor stat divergences from reference doc deferred to Phase 5 |
| `src/data/maps.js` | Schema already in place from Phase 3 |
| `src/entities/Tower.js` | No changes |
| `src/systems/` | No changes |
| `src/ui/` | No changes |

---

## 6. Deviations from Original Phase 4 Spec

| Original spec | This phase |
|---|---|
| 8 enemy types | 3 types only (Map 1 subset) |
| Boss behaviors (Colossus spawn burst, Queen 2-phase) | Deferred to Phase 5 |
| Skitter erratic movement | Deferred |
| All 8 types exercised in wave scripts | Map 1 waves only; remaining types added with their maps in Phase 5 |
| Flying targeting restrictions | Deferred (no Flyer type yet) |
