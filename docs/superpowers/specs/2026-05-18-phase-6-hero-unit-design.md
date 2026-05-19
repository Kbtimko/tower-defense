# Phase 6: Hero Unit — Design Spec

**Date:** 2026-05-18
**Branch:** feature/barracks-soldier-rebuild → feature/phase-3-tower-system

---

## 1. Summary

Add Commander Rael — a player-controlled hero unit — to every map. Rael walks to wherever the player clicks, auto-attacks nearby enemies in melee range, and levels up by kill count. Each level unlocks one active ability (Q/W/E). Rael respawns 20s after death. Ability buttons live in the bottom bar to the left of the tower buttons.

---

## 2. Decisions

| Question | Decision |
|---|---|
| Movement | Click-to-move anywhere on canvas |
| Airstrike targeting | Aim mode: W activates → player clicks target point → AoE lands |
| Ability button location | Bottom bar, left of tower buttons, separated by a divider |
| Kill thresholds | L1 (start), L2 at 25 kills, L3 at 75 kills |
| Architecture | Hero entity class (`Hero.js extends Container`), mirrors Soldier pattern |

---

## 3. Hero Entity (`src/entities/Hero.js`)

Extends `Phaser.GameObjects.Container`. Placed at `pathMgr.path[0]` on `GameScene.create()`.

### Visual
Blue humanoid: filled circle head, rect body, cyan (`#4fc3f7`) stroke outline. Distinct from green soldiers. HP bar above head (same style as Soldier).

### State
```js
hp            = 150
maxHp         = 150
level         = 1         // 1 | 2 | 3
killCount     = 0
dead          = false
respawnTimer  = 0         // counts down from 20s after death
targetX/Y               // destination set by moveTo()
moving        = false
// Per-ability cooldown timers (seconds remaining):
overchargeTimer  = 0
airstrikeTimer   = 0
empTimer         = 0
overchargeActive = false  // true while the 6s buff is running
overchargeRemaining = 0   // counts down the 6s buff window
```

### Combat
- Auto-attacks nearest enemy within **40px** range
- Attack rate: **1.5 attacks/s** | Damage: **18** | No pierce
- `takeDamage(amount)` — reduces hp; at 0 sets `dead = true`, starts `respawnTimer = 20`
- `respawn()` — resets hp, clears dead, repositions to path start

### Movement
- `moveTo(x, y)` — sets target, `moving = true`
- Speed: **130 px/s**
- Stops within **8px** of target; sets `moving = false`

### Leveling
- `killCount++` on every enemy kill landed by hero
- `level` advances at 25 kills (→ L2) and 75 kills (→ L3)
- Emits `hero:level-up` with `{ level }` on each advance

### Abilities

| Slot | Key | Unlocks | Cooldown | Effect |
|---|---|---|---|---|
| Overcharge | Q | L1 (immediately) | 30s | Sets `overchargeActive = true` for 6s; GameScene boosts all tower fire rates +50% while active |
| Airstrike | W | L2 | 25s | Returns `{ x, y, radius: 70, damage: 80 }` after player clicks target; GameScene deals AoE pierce damage + particle burst |
| EMP Pulse | E | L3 | 45s | GameScene applies `{ type: 'stun', duration: 3 }` to all living enemies |

Abilities are no-ops (and return false) if called while on cooldown or while dead.

### `update(dt, enemies)` responsibilities
1. Tick all cooldown timers down
2. Tick `overchargeRemaining` down; clear `overchargeActive` when it hits 0
3. If dead: tick `respawnTimer` down; call `respawn()` when it hits 0; return early
4. Move toward target (if `moving`)
5. Auto-attack nearest enemy in range; if kill → `_registerKill()` → increments `killCount`, checks thresholds, emits `this.scene.events.emit('hero:level-up', { level })` when level advances

---

## 4. HTML Changes (`index.html`)

### Bottom bar — hero section (insert before first `.tower-btn`)

```html
<div id="hero-section">
  <div id="hero-portrait">R</div>
  <div id="hero-info">
    <div id="hero-level">Rael L1</div>
    <div id="hero-hp-bg"><div id="hero-hp-fill"></div></div>
  </div>
  <button class="ability-btn" id="ability-q" disabled title="Overcharge — +50% tower fire rate 6s">
    <span class="ability-key">Q</span><span class="ability-name">⚡</span><span class="ability-cd"></span>
  </button>
  <button class="ability-btn locked" id="ability-w" disabled title="Airstrike — AoE damage on target area">
    <span class="ability-key">W</span><span class="ability-name">🎯</span><span class="ability-cd"></span>
  </button>
  <button class="ability-btn locked" id="ability-e" disabled title="EMP Pulse — stuns all aliens 3s">
    <span class="ability-key">E</span><span class="ability-name">💥</span><span class="ability-cd"></span>
  </button>
</div>
<div class="bar-divider"></div>
```

Q starts `disabled` but NOT `.locked` (unlocked at L1 — enabled at game start). W and E start `.locked` + `disabled`.

### New CSS (add to `<style>`)
```css
#hero-section { display:flex; align-items:center; gap:6px; }
#hero-portrait { width:30px; height:30px; border-radius:50%; background:#1a2a4a;
                 border:2px solid #4fc3f7; display:flex; align-items:center;
                 justify-content:center; font-size:13px; color:#4fc3f7; font-weight:bold; }
#hero-info { display:flex; flex-direction:column; gap:3px; }
#hero-level { font-size:10px; color:#4fc3f7; }
#hero-hp-bg { width:52px; height:5px; background:#333; border-radius:2px; overflow:hidden; }
#hero-hp-fill { height:100%; background:#4fc3f7; border-radius:2px; transition:width 0.15s; }
.ability-btn { background:#1a2a3a; border:2px solid #4fc3f7; border-radius:5px;
               padding:4px 7px; cursor:pointer; display:flex; flex-direction:column;
               align-items:center; gap:1px; color:#4fc3f7; }
.ability-btn.locked { background:#111; border-color:#333; color:#444; cursor:default; }
.ability-btn:disabled { opacity:0.45; cursor:not-allowed; }
.ability-btn:not(:disabled):not(.locked):hover { background:#253a4a; }
.ability-key { font-size:11px; font-weight:bold; letter-spacing:1px; }
.ability-name { font-size:12px; }
.ability-cd { font-size:9px; color:#aaa; min-height:11px; }
.bar-divider { width:1px; height:36px; background:#333; }
```

---

## 5. UIScene Changes

### `_bindDOMEvents()`
- Wire `#ability-q`, `#ability-w`, `#ability-e` click → `game.events.emit('ui:ability', { slot })`
- Add `document` `keydown` listener for `q`, `w`, `e` → same emit
- Store the keydown handler ref on `this` for cleanup in `shutdown()`

### `_subscribeToGameEvents()`
Add:
- `hero:update` → `_onHeroUpdate({ hp, maxHp, level })`
- `hero:level-up` → `_onHeroLevelUp({ level })`
- `hero:aim-mode` → set `document.body.style.cursor = 'crosshair'`; show brief "Click target" hint
- `hero:aim-cancel` → restore `document.body.style.cursor = ''`
- `hero:cooldown-tick` → `_onHeroCooldownTick({ q, w, e })` — update `.ability-cd` text with seconds remaining; re-disable if on cooldown, re-enable when 0

### `_onHeroUpdate({ hp, maxHp, level })`
- Set `#hero-hp-fill` width to `${(hp / maxHp) * 100}%`
- Set `#hero-level` text to `Rael L${level}`

### `_onHeroLevelUp({ level })`
- L2: remove `.locked`, enable `#ability-w`
- L3: remove `.locked`, enable `#ability-e`
- Brief gold flash on the newly-unlocked button (`setTimeout` CSS class toggle)

### `shutdown()`
- Remove `keydown` listener
- Clone and replace `#ability-q`, `#ability-w`, `#ability-e` (same pattern as existing buttons)

---

## 6. GameScene Changes

### `create()`
```js
this.hero    = new Hero(this, this.pathMgr.path[0]);
this.aimMode = false;
this.overchargeTimer = 0;  // tracks buff duration for tower boost
this.events.on('ui:ability', this._onAbility, this);
```
Emit `hero:level-up` with `{ level: 1 }` after a 100ms delay so UIScene is ready to receive it (enables Q button).

### `update()` loop
```js
this._updateHero(dt);
```
Added after `_updateSoldiers(dt)`.

### `_updateHero(dt)`
```js
this.hero.update(dt, this.enemies);
// tick overcharge buff
if (this.hero.overchargeActive !== this._prevOverchargeActive) {
  this._applyOvercharge(this.hero.overchargeActive);
  this._prevOverchargeActive = this.hero.overchargeActive;
}
this.game.events.emit('hero:update', {
  hp: this.hero.hp, maxHp: this.hero.maxHp, level: this.hero.level
});
// emit cooldown tick once per second (tracked via _heroCooldownAccum)
```

### `_applyOvercharge(active)`
Iterates `this.placementManager.getTowers()` and multiplies/divides each tower's `fireRate` by 1.5. Stores original values on first call so restoring is exact.

### `_onPointerDown(pointer)` — priority order
1. If `this.aimMode` → `_triggerAirstrike(pointer.x, pointer.y)`; return
2. Else if `this.selectedType` → existing tower placement logic
3. Else if click hits existing tower → open panel
4. Else → `this.hero.moveTo(pointer.x, pointer.y)`

### `_onAbility({ slot })`
```js
switch (slot) {
  case 'q': this.hero.overcharge(); break;
  case 'w':
    if (this.hero.airstrikeTimer > 0 || this.hero.dead) return;
    this.aimMode = true;
    this.game.events.emit('hero:aim-mode');
    break;
  case 'e':
    if (!this.hero.empPulse()) return;
    for (const e of this.enemies) e.applyStatus({ type: 'stun', duration: 3 });
    break;
}
```

### `_triggerAirstrike(x, y)`
```js
const result = this.hero.airstrike(x, y);
if (!result) return;  // on cooldown / dead
for (const e of this.enemies) {
  if (Math.hypot(e.x - x, e.y - y) <= result.radius) {
    this._dealDamage(e, result.damage, true);
  }
}
this._addAirstrikeParticles(x, y);
this.aimMode = false;
this.game.events.emit('hero:aim-cancel');
```

### Hero level-up relay
GameScene listens on `this.events.on('hero:level-up', ...)` (scene-local events emitted by Hero) and re-emits on `this.game.events` so UIScene receives it. Add to `create()`:
```js
this.events.on('hero:level-up', ({ level }) => {
  this.game.events.emit('hero:level-up', { level });
}, this);
```

### `shutdown()`
Add `'ui:ability'` to the list of cleaned-up listeners.

---

## 7. Enemy Changes

Add `'stun'` status effect alongside existing `'slow'`:
```js
statusEffects = {
  slow:  { active: false, timer: 0, factor: 1 },
  stun:  { active: false, timer: 0 }
}
```
In `Enemy.update(dt)`: tick stun timer; in `_updateEnemies` (GameScene), skip movement step if `enemy.statusEffects.stun.active`. In `Enemy._redrawBody()`: apply a brief white tint while stunned.

In `Enemy.applyStatus()`:
```js
if (type === 'stun') {
  this.statusEffects.stun = { active: true, timer: duration };
}
```

---

## 8. Tests (`src/entities/Hero.test.js`)

| Test | Covers |
|---|---|
| Moves toward target, stops at threshold | `moveTo` + `update` movement |
| Auto-attacks enemy in range, not out of range | Attack range gating |
| Kill increments killCount | `registerKill` |
| Level-up at 25 and 75 kills | Threshold logic |
| takeDamage sets dead, starts respawn timer | Death + respawn countdown |
| Respawn resets hp and position | `respawn()` |
| Abilities return false while on cooldown | Cooldown guard |
| Abilities return false while dead | Dead guard |
| Overcharge sets active flag for 6s | Buff timer |
| Airstrike returns correct radius/damage | Return value |

---

## 9. File Checklist

| File | Change |
|---|---|
| `src/entities/Hero.js` | **new** |
| `src/entities/Hero.test.js` | **new** |
| `src/entities/Enemy.js` | Add stun status |
| `src/scenes/GameScene.js` | Instantiate hero, `_updateHero`, `_onAbility`, `_triggerAirstrike`, `_applyOvercharge`, pointer disambiguation |
| `src/scenes/UIScene.js` | Hero events, keydown listener, ability button wiring |
| `index.html` | Hero section markup + CSS |
