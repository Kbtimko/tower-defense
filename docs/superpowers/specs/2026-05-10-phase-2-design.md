# Phase 2 Design — Core Engine Refactor

**Date:** 2026-05-10
**Builds on:** `docs/superpowers/specs/2026-05-09-tower-defense-game-design.md`
**Branch:** feature/phase-2-core-engine

---

## 1. Goals

1. Split the 482-line GameScene monolith into GameScene (logic + rendering) and UIScene (DOM).
2. Convert Tower, Enemy, and Projectile from plain data objects into `Phaser.GameObjects.Container` subclasses that manage their own visuals.
3. Replace the every-frame full-redraw Graphics pattern with targeted, reactive rendering.
4. Render tower type icons on canvas using emoji Phaser Text.

Non-goals for this phase: TowerPlacementManager extraction, branch picker UI, ability buttons, new enemy types, new maps.

---

## 2. Scene Architecture

### Scene Registry (`src/main.js`)

```
BootScene → MenuScene → GameScene (launches UIScene in parallel)
```

UIScene is added to the Phaser scene registry but is never auto-started. GameScene launches it via `this.scene.launch('UIScene')` in `create()` and stops it via `this.scene.stop('UIScene')` in `shutdown()`.

### Communication Bus

Scenes communicate exclusively via `this.game.events` (the global Phaser EventEmitter). Scene-local emitters are not used for cross-scene communication. Using the game-level bus ensures UIScene retains its subscriptions across GameScene restarts.

### Event Protocol

**GameScene → UIScene:**

| Event | Payload | When emitted |
|---|---|---|
| `hud:update` | `{ gold, lives, wave, waveCount, kills }` | On economy change, kill, or wave advance |
| `wave:state` | `{ active, done, currentWave }` | On wave start, wave complete, all waves done |
| `tower:panel-open` | `{ tower, def, x, y, mapId }` | On tower click |
| `tower:panel-close` | — | On canvas click away, sell, or scene restart |
| `game:victory` | `{ kills, waveCount }` | All waves cleared |
| `game:defeat` | `{ wave }` | Lives reach 0 |

**UIScene → GameScene:**

| Event | Payload | When emitted |
|---|---|---|
| `ui:wave-start` | — | Wave button click |
| `ui:speed-toggle` | — | Speed button click |
| `ui:tower-type-select` | `{ type \| null }` | Tower button click (null = deselect) |
| `ui:tower-upgrade` | — | Upgrade button click |
| `ui:tower-sell` | — | Sell button click |
| `ui:restart` | — | Play Again button click |

---

## 3. Entity Containers

All three entity classes move to `src/entities/` and extend `Phaser.GameObjects.Container`. Each calls `scene.add.existing(this)` in its constructor to register itself with the scene. Destruction is via `this.destroy()` — Phaser removes the Container and all children automatically.

Constructor signature change: `scene` is the first argument for all entities.

### Tower (`src/entities/Tower.js`)

**Children:**
- `_bg`: `Graphics` — dark fill circle (radius 18) + colored outer ring. Ring color = `TOWER_DEFS[type].color`. Ring stroke width increases per tier: tier 1 = 1.5px, tier 2 = 2px, tier 3 = 3px, tier 4 = 4px.
- `_icon`: `Text` — tower emoji centered at (0, 0), fontSize 16px, no shadow.
- `_rangeRing`: `Graphics` — dotted range circle, hidden by default (`setVisible(false)`). Shown when this tower is the selected tower, hidden on deselect.

**Methods:**
- `_redraw()` — clears and redraws `_bg` based on current `level` and `branch`. Called in constructor and after each `upgrade()`.
- `upgrade(tier, branch?)` — applies stat deltas from `TOWER_DEFS[type]['tier' + tier]`, sets `this.level`, calls `_redraw()`.
- `sell()` — returns `Math.floor(this.totalCost * 0.6)`, calls `this.destroy()`.
- `showRange()` / `hideRange()` — toggles `_rangeRing` visibility.

**Data properties (unchanged from Phase 1):** `type`, `level`, `branch`, `damage`, `range`, `fireRate`, `splashRadius`, `slow`, `pierce`, `cooldown`, `totalCost`, `zoneIndex`.

### Enemy (`src/entities/Enemy.js`)

**Children:**
- `_shadow`: `Graphics` — dark ellipse drawn below body (offset y = radius + 2).
- `_body`: `Graphics` — filled circle, color = `def.color`. Redrawn when slow status activates/deactivates (adds cyan ring when slowed).
- `_hpBar`: `Graphics` — two-rect HP bar drawn above body. Redrawn in `takeDamage()` and `update()` when HP changes.

**`update(dt)`** moves `this.x` / `this.y` along the path (logic unchanged from Phase 1), ticks status timers, and calls `_redrawHpBar()` when HP has changed since last frame.

**`takeDamage(amount, pierce)`** reduces HP, sets `this.dead = true` if HP ≤ 0, calls `_redrawHpBar()`.

**`applyStatus(effect)`** sets status, calls `_redrawBody()` to add/remove slow ring.

**Destruction:** GameScene filters dead enemies and calls `enemy.destroy()`. No manual child cleanup needed.

### Projectile (`src/entities/Projectile.js`)

**Children:**
- `_dot`: `Graphics` — filled circle drawn once in constructor. Radius = 3 for homing projectiles, 5 for AoE (splashRadius > 0). Color = `proj.color`. For ice projectiles (`slowFactor > 0`), adds a 1px cyan stroke ring.

Projectile position is updated by GameScene each frame (`this.x`, `this.y`). No per-frame child redraw needed. GameScene calls `proj.destroy()` on hit.

---

## 4. Rendering Strategy

### Static (drawn once in `create()`)

- **Path + IN/OUT markers** — `PathManager.renderPath(pathGfx, map.pathColor)` called once. `pathGfx` is a dedicated `scene.add.graphics()` object that is never cleared after initial draw.

### Reactive (redrawn on state change only)

- **Build zones** — `zoneGfx` Graphics, redrawn in a new `_redrawZones()` method. Called when `selectedType` changes (on `ui:tower-type-select`) and when gold changes (on `hud:update`). Not called every frame.
- **Selected tower range ring** — a `Graphics` child inside the Tower Container, shown/hidden via `tower.showRange()` / `tower.hideRange()`. Drawn once when the tower is constructed and re-drawn in `Tower._redraw()` after upgrades.

### Every-frame (moving objects)

- **Enemy Containers** — `enemy.update(dt)` updates `this.x/y`; Phaser renders the Container at its new position. HP bar child is redrawn inside `update()` when HP changes.
- **Projectile Containers** — GameScene sets `proj.x/y` each frame; Phaser renders automatically.

### Ephemeral (cleared each frame)

- **Particles** — one shared `particleGfx` Graphics, cleared and redrawn each frame. Short-lived (0.3s max life, <10 active at once). Not worth Container overhead.

### Removed entirely

The following GameScene methods are deleted:
`_drawPath`, `_drawZones`, `_drawTowers`, `_drawEnemies`, `_drawProjectiles`, `_drawParticles`.

The shared `this.gfx` object is replaced by `pathGfx`, `zoneGfx`, and `particleGfx`.

---

## 5. UIScene (`src/scenes/UIScene.js`)

New file. `Phaser.Scene` with key `'UIScene'`. No canvas rendering — scene config includes `{ key: 'UIScene', active: false }` with transparent background.

### `create()`
1. Shows `#hud` and `#bottom-bar`.
2. Hides `#game-msg`.
3. Wires all DOM button event listeners:
   - `.tower-btn` clicks → emit `ui:tower-type-select`
   - `#wave-btn` click → emit `ui:wave-start`
   - `#speed-btn` click → emit `ui:speed-toggle`
   - `#panel-upgrade-btn` click → emit `ui:tower-upgrade`
   - `#panel-sell-btn` click → emit `ui:tower-sell`
   - `#msg-btn` click → emit `ui:restart`
4. Subscribes to game-level events:
   - `hud:update` → `_onHudUpdate()`
   - `wave:state` → `_onWaveState()`
   - `tower:panel-open` → `_onPanelOpen()`
   - `tower:panel-close` → `_onPanelClose()`
   - `game:victory` → `_onVictory()`
   - `game:defeat` → `_onDefeat()`

### `shutdown()`
1. Hides `#hud` and `#bottom-bar`.
2. Removes all `this.game.events` listeners registered by this scene (use scene context in `on()` calls so `off()` can remove by context).
3. Clones DOM button nodes to strip listeners: `#wave-btn`, `#speed-btn`, `#panel-upgrade-btn`, `#panel-sell-btn`, `#msg-btn`, and all `.tower-btn`.

### DOM update methods (private)

- `_onHudUpdate({ gold, lives, wave, waveCount, kills })` — sets `#stat-lives`, `#stat-gold`, `#stat-wave`, `#stat-kills`; dims tower buttons the player cannot afford.
- `_onWaveState({ active, done, currentWave })` — sets `#wave-btn` text and disabled state.
- `_onPanelOpen({ tower, def, x, y, mapId })` — populates `#tower-panel` fields and positions the panel; shows it. Identical logic to Phase 1's `_openTowerPanel`.
- `_onPanelClose()` — hides `#tower-panel`.
- `_onVictory({ kills, waveCount })` — sets `#game-msg` content and shows it.
- `_onDefeat({ wave })` — sets `#game-msg` content and shows it.

---

## 6. GameScene Changes

### Removed methods
`_bindDOMEvents`, `_updateHUD`, `_updateWaveButton`, `_openTowerPanel`, `_closeTowerPanel`, `_toggleSpeed`, `_onVictory`, `_onDefeat`, `_drawPath`, `_drawZones`, `_drawTowers`, `_drawEnemies`, `_drawProjectiles`, `_drawParticles`.

### Replaced / updated methods
- `create()` — replaces `this.gfx = this.add.graphics()` with three targeted graphics objects (`pathGfx`, `zoneGfx`, `particleGfx`). Calls `this.scene.launch('UIScene')`. All entity constructors gain `this` as first arg.
- `shutdown()` — replaces DOM cleanup with `this.scene.stop('UIScene')`.
- `_dealDamage()` — removes `document.getElementById('stat-kills')` direct DOM write; emits `hud:update` on `this.game.events` (with current kills count) after incrementing `this.kills`.
- `_onEconomyUpdate()` — new handler subscribed to EconomyManager's `economy:update` (scene-local event). Re-emits `hud:update` on `this.game.events` with `{ gold, lives, wave, waveCount, kills }`. This is the bridge between EconomyManager's local emitter and UIScene's game-level subscription.
- `_spawnEnemy()` — constructs `new Enemy(this, { ... })`.
- `_onPointerDown()` — constructs `new Tower(this, { ... })`. Emits `tower:panel-open` / `tower:panel-close` instead of calling `_openTowerPanel` / `_closeTowerPanel`.
- `_upgradeSelectedTower()` — calls `tower.upgrade(tier)` on the Tower Container. Emits `tower:panel-open` to refresh panel display.
- `_sellSelectedTower()` — calls `tower.sell()` (returns gold, destroys Container). Emits `tower:panel-close`.
- `_checkWaveComplete()` — emits `wave:state` after state change.
- `_startWave()` — emits `wave:state` after starting.
- `_redrawZones()` — new method, replaces `_drawZones`. Called reactively.
- `update()` — removes all `_draw*` calls and `gfx.clear()`. Adds `particleGfx.clear()` + `_drawParticles()` (particles only).

### State that moves to UIScene
`.selected` class management on tower buttons is UIScene's internal concern — handled directly in UIScene's tower button click handler before emitting `ui:tower-type-select`. UIScene does not listen to its own emitted events.

Speed state (`this.speed`) stays in GameScene. UIScene toggles via event; GameScene reads and applies.

---

## 7. File Changes Summary

| File | Action |
|---|---|
| `src/scenes/UIScene.js` | New |
| `src/scenes/GameScene.js` | Major edit |
| `src/entities/Tower.js` | Rewrite (extend Container) |
| `src/entities/Enemy.js` | Rewrite (extend Container) |
| `src/entities/Projectile.js` | Rewrite (extend Container) |
| `src/main.js` | Add UIScene to scene registry |

---

## 8. Testing

Existing 25 tests (data files + EconomyManager + PathManager) must remain green throughout. No new unit tests are added for entity Containers — they have no testable pure logic beyond what already exists; correctness is verified via browser.

Browser verification checklist (same as Phase 1 sign-off):
- Menu → map select → game canvas loads
- Path renders, build zones visible
- All 4 tower types placeable; emoji icon visible on each tower
- Tower panel opens on click, shows correct stats
- Upgrade increases tier, ring thickness increases
- Sell refunds 60%, zone becomes available
- Wave sends, enemies traverse path, kills/gold/lives update in HUD
- Speed toggle works
- Victory and defeat overlays appear; Play Again restarts cleanly (HUD resets)
