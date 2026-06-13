# Phase 9c — Click-to-Inspect Overlay: Design Spec

**Status:** Approved (2026-05-28) — ready for plan.
**Branch:** `feature/phase-9c-click-inspect` (off `feature/phase-3-tower-system` at `ebc0512`)
**Scope:** Third of three "Strategic Depth" sub-features. Phase 9a (send-wave-early) shipped via PR #12; Phase 9b (weakness matrix) shipped via PR #13. 9c completes the trilogy by making the matrix legible from the enemy side and exposing hero internals.

---

## 1. Motivation

Phase 9b made matchups *exist*: every tower has weaknesses and strengths against every enemy. But today the player can only see the matrix from the **placement** side — via the tower-build hover tooltip, the placed TowerPanel matchup line, and the Tier-4 branch picker hint. The enemy side is opaque. A player who sees a wave of Titans incoming can't ask "what should I build to counter this?" — they can only ask "what is each tower good at?"

This sub-feature adds a **click-to-inspect overlay** that opens a stats panel for any clicked enemy or for the hero. The enemy panel includes a reverse-matrix view (*"Vulnerable to: Cannon, Sniper · Resists: Archer"*) — the exact information needed to plan tower placement in response to wave composition. The hero panel surfaces level, kills, ability cooldowns, and the hero's own matchup table in one place.

Paired with 9a's tempo decisions and 9b's matrix, this completes the Strategic Depth pass: every system the player needs to *understand* the battlefield is now exposed via a single consistent click gesture.

---

## 2. Trigger Model

Two complementary surfaces — **hover** and **click** — share a single controller.

### 2.1 Hover peek (transient)

- Mouse enters an enemy or hero hit-region → small tooltip appears anchored near the cursor.
- Mouse leaves the hit-region → tooltip disappears.
- No click consumption; existing input behavior unchanged on hover.
- Tooltip content is intentionally smaller than the pinned panel — name + 1 stat line + 1 matchup line. The pinned panel is the canonical "full" view.

### 2.2 Click pin (persistent)

- Click an enemy or hero → full inspector panel opens.
- Click the same target again → toggle closed.
- Click a different inspectable target → re-pin (replace contents, reposition).
- Click an inspector close button (✕) → close.
- Press `ESC` → close any open inspector.
- Inspected enemy dies or leaks off the path → auto-close.
- Inspected hero stays open during death/respawn (shows live respawn timer).

### 2.3 Click priority in `_onPointerDown`

```
1. aim mode (existing — airstrike targeting)
2. reposition mode (existing — barracks soldier reposition)
3. tower click → TowerPanel (existing)
4. inspect click (enemy or hero) ← NEW
5. tower placement (existing — gated on selectedType)
6. move hero (existing — fallthrough)
```

Step 4 runs unconditionally before steps 5-6. Clicking an enemy while a tower is "selected to place" opens the inspector AND leaves the tower selected; the next zone click still places the tower. Clicking empty space still moves the hero — no regression.

---

## 3. Data: Reverse Matrix Helper

### 3.1 New export in `src/data/weaknessMatrix.js`

`describeMatchups(source)` (from 9b) tells the player which **enemies** a given tower is effective/weak against. `describeEnemyMatchups` is its mirror — given an enemy, which **damage sources** are effective/weak against it.

```js
const TOWER_TYPES = ['archer', 'mage', 'cannon', 'ice', 'sniper', 'barracks'];

export function describeEnemyMatchups(enemyType) {
  const vulnerableTo = [];
  const resists = [];
  for (const towerType of TOWER_TYPES) {
    const m = getWeaknessMultiplier({ kind: 'tower', type: towerType, tier: 1, branch: null }, enemyType);
    if (m >= EFFECTIVE_THRESHOLD) vulnerableTo.push(towerType);
    else if (m <= WEAK_THRESHOLD)  resists.push(towerType);
  }
  const heroMult = getWeaknessMultiplier({ kind: 'hero' }, enemyType);
  if (heroMult >= EFFECTIVE_THRESHOLD) vulnerableTo.push('hero');
  else if (heroMult <= WEAK_THRESHOLD)  resists.push('hero');
  return { vulnerableTo, resists };
}
```

**Tier-4 overrides intentionally NOT folded in.** Rationale: at click-time the player doesn't know which Tier-4 they'll pick later. Showing "Sniper-A 2.5× vs Titan" alongside "base Sniper 1.5× vs Titan" muddies the headline. The Tier-3 branch picker exposes the Tier-4 nuance from the placement side; the enemy-side stays simple. Reversible if playtesting shows a different need.

### 3.2 New `icon` field on `enemies.js`

`ENEMY_DEFS` currently has no icon. The inspector header reads `${def.icon} ${def.name}` for visual consistency with tower-build buttons. One-line diff per row:

```diff
- drone:    { type: 'drone',    name: 'Veth Drone',    hp: 70, ... },
+ drone:    { type: 'drone',    name: 'Veth Drone',    icon: '🤖', hp: 70, ... },
```

Starting icon proposal (refine in playtesting):
- `drone: 🤖`, `skitter: 🪲`, `brute: 🦏`, `colossus: 🦖`, `phantom: 👻`, `titan: 👹`

Fallback in renderer: `def.icon ?? '?'` — a future enemy without an icon still renders.

---

## 4. UI Surface

### 4.1 New DOM elements in `index.html`

Three new top-level elements, all hidden by default.

```html
<!-- pinned, full panel for enemies -->
<div id="enemy-inspector" class="inspector-panel" style="display:none">
  <div class="inspector-header">
    <span class="inspector-name" id="ei-name">Enemy</span>
    <button class="inspector-close" id="ei-close">✕</button>
  </div>
  <div class="inspector-hpbar"><div class="inspector-hpfill" id="ei-hpfill"></div></div>
  <div class="inspector-hp-label" id="ei-hp-label">- / -</div>
  <div class="inspector-stat" id="ei-stats">Speed: - · Armor: -</div>
  <div class="inspector-stat" id="ei-meta">Reward: - · Ground</div>
  <div class="inspector-stat" id="ei-status">Status: —</div>
  <div class="inspector-matchups" id="ei-matchups"></div>
</div>

<!-- pinned, full panel for hero -->
<div id="hero-inspector" class="inspector-panel" style="display:none">
  <div class="inspector-header">
    <span class="inspector-name">🛡️ Commander Rael</span>
    <button class="inspector-close" id="hi-close">✕</button>
  </div>
  <div class="inspector-hpbar"><div class="inspector-hpfill" id="hi-hpfill"></div></div>
  <div class="inspector-hp-label" id="hi-hp-label">- / -</div>
  <div class="inspector-stat" id="hi-level">Level: -</div>
  <div class="inspector-stat" id="hi-attack">Attack: - dmg @ - range</div>
  <div class="inspector-abilities" id="hi-abilities"></div>
  <div class="inspector-matchups" id="hi-matchups"></div>
</div>

<!-- transient peek tooltip (shared for enemy + hero) -->
<div id="inspect-peek" style="display:none"></div>
```

### 4.2 New CSS rules

```css
.inspector-panel { position: absolute; background: #0f0f1e; border: 2px solid #8b6914;
                   border-radius: 6px; padding: 8px 10px; font-size: 11px; color: #ddd;
                   min-width: 200px; max-width: 260px; z-index: 40; }
.inspector-header { display: flex; justify-content: space-between; align-items: center;
                    margin-bottom: 6px; }
.inspector-name { font-weight: bold; color: #ffd700; }
.inspector-close { background: none; border: none; color: #aaa; cursor: pointer;
                   font-size: 14px; padding: 0 4px; }
.inspector-close:hover { color: #fff; }
.inspector-hpbar { background: #222; height: 8px; border-radius: 2px; overflow: hidden;
                   margin-bottom: 2px; }
.inspector-hpfill { background: #6f6; height: 100%; transition: width 0.1s linear; }
.inspector-hp-label { font-size: 10px; color: #888; margin-bottom: 5px; }
.inspector-stat { font-size: 11px; color: #aaa; margin: 2px 0; }
.inspector-stat .ei-status-active { color: #6cf; }
.inspector-matchups { margin-top: 5px; font-size: 10px; line-height: 1.4; }
.inspector-matchups .mu-good { display: block; color: #6f6; }
.inspector-matchups .mu-bad  { display: block; color: #f88; }
.inspector-abilities .ab-line { display: flex; justify-content: space-between;
                                margin: 1px 0; }
.inspector-abilities .ab-line.locked { color: #555; }
#inspect-peek { position: absolute; display: none; z-index: 45; pointer-events: none;
                background: #0f0f1e; border: 1px solid #8b6914; border-radius: 4px;
                padding: 5px 7px; font-size: 10px; color: #ddd; white-space: nowrap;
                max-width: 220px; }
#inspect-peek strong { display: block; color: #ffd700; margin-bottom: 2px; }
```

### 4.3 Pinned enemy panel — example render

```
┌─ 🦏 Veth Brute ─────────────── [×] ─┐
│ ████████████████░░░░░░░  87 / 120  │
│ Speed: 38 · Armor: 8               │
│ Reward: 22g · Ground               │
│ Status: ❄ slowed (1.4s)            │
│                                    │
│ Vulnerable to:                     │
│   Cannon, Sniper, Barracks         │
│ Resists:                           │
│   Archer                           │
└────────────────────────────────────┘
```

Field sources:
| Element | Source |
|---|---|
| Icon | `ENEMY_DEFS[type].icon` (with `?? '?'` fallback) |
| Name | `ENEMY_DEFS[type].name` |
| HP bar fill | `enemy.hp / enemy.maxHp` |
| HP label | `Math.ceil(enemy.hp) + ' / ' + enemy.maxHp` |
| Speed / Armor | `def.speed` / `def.armor` |
| Reward / Ground-Flying | `def.reward + 'g · ' + (def.flying ? 'Flying' : 'Ground')` |
| Status | comma-joined active statusEffects, each as `name (Xs)`; "—" if none |
| Vulnerable to | `describeEnemyMatchups(def.type).vulnerableTo` mapped to display names |
| Resists | same, `.resists` |

**Tower display names** (single source of truth — derive from `TOWER_DEFS[type].name`, no hardcoded second list).

If `vulnerableTo` or `resists` is empty, omit that line entirely.

### 4.4 Pinned hero panel — example render

```
┌─ 🛡️ Commander Rael ─────────── [×] ─┐
│ ████████████░░░░░░░░░░  120 / 200  │
│ Level: 2 / 3 · Kills: 47           │
│ Attack: 25 dmg @ 100 range         │
│                                    │
│ Abilities:                         │
│   Q Overcharge    ready            │
│   W Airstrike     18s              │
│   E EMP Pulse     🔒 (lvl 3)       │
│                                    │
│ Matchups:                          │
│   1.5× vs Phantom                  │
└────────────────────────────────────┘
```

Field sources:
| Element | Source |
|---|---|
| HP bar / label | `hero.hp / hero.maxHp` |
| Level | `'Level: ' + hero.level + ' / 3'` |
| Kills | `hero.killCount` |
| Attack | constants in `Hero.js` (`ATTACK_DAMAGE`, `ATTACK_RANGE`); export them or read from a new `Hero.STATS` map |
| Abilities | three rows: Q/W/E. State is one of: `ready` if cooldown=0 and unlocked; `${Math.ceil(timer)}s` if cooling; `🔒 (lvl N)` if locked by hero level (W=2, E=3) |
| Matchups | iterate `HERO_MULTIPLIERS`, format each non-1.0 entry as `${value}× vs ${enemyName}` |

If `hero.dead`, replace the abilities line with `Respawning ${Math.ceil(hero.respawnTimer)}s` and grey out the ability list.

### 4.5 Peek tooltip — example render

```
┌─ Veth Brute ──────────┐
│ HP 87 / 120 · Armor 8 │
│ Weak: Cannon          │
│ Resist: Archer        │
└───────────────────────┘
```

Smaller, single floating element. For both enemies and heroes:

- **Header:** name only — no icon, no close button (it's transient).
- **Stat line:** HP + (armor for enemies / level for hero).
- **Matchup lines:** at most one effective + one resist line; if neutral across the board, just stat line.

---

## 5. Architecture

### 5.1 New module: `src/scenes/InspectController.js`

Follows the Phase 8 pattern (sibling to `ParticleSpawner`, `DamageNumberOverlay`, `ShakeController`). All inspector state and DOM manipulation live here so `GameScene.js` doesn't grow further.

```js
import { getWeaknessMultiplier, describeEnemyMatchups, HERO_MULTIPLIERS } from '../data/weaknessMatrix.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { TOWER_DEFS } from '../data/towers.js';

export class InspectController {
  constructor(scene) {
    this.scene = scene;
    this.pinned = null;          // { kind: 'enemy'|'hero', target } | null
    this.peekTarget = null;
    // bind close buttons + ESC key once
    document.getElementById('ei-close').addEventListener('click', () => this.dismiss());
    document.getElementById('hi-close').addEventListener('click', () => this.dismiss());
    this._onKeyDown = (e) => { if (e.key === 'Escape') this.dismiss(); };
    window.addEventListener('keydown', this._onKeyDown);
  }

  tryClickInspect(mx, my) { /* returns true if click consumed */ }
  onPointerMove(mx, my)   { /* updates peek visibility */ }
  refresh()                { /* called from scene.update each tick */ }
  pin(spec)                { /* opens panel; toggle off if same target */ }
  dismiss()                { /* closes any open panel */ }
  destroy()                { /* removes window listener */ }

  // private:
  _hitTestEnemy(mx, my)   { /* radius-based, +4px slop */ }
  _hitTestHero(mx, my)    { /* hero body 18px */ }
  _showPeek(kind, target, mx, my) { /* populates + positions #inspect-peek */ }
  _hidePeek()             { /* display: none */ }
  _renderPinned()         { /* delegates to _renderEnemyPanel or _renderHeroPanel */ }
  _renderEnemyPanel(enemy) { /* fills #enemy-inspector */ }
  _renderHeroPanel(hero)   { /* fills #hero-inspector */ }
  _positionPanel(el, targetX, targetY) { /* anchor with flip-on-overflow */ }
}
```

All DOM construction uses `createElement` + `textContent` + `appendChild` — no `innerHTML`, no string concatenation into the DOM.

### 5.2 GameScene wiring (≈20 lines)

```js
// in GameScene.create(), after other Phase-8 systems are constructed:
import { InspectController } from './InspectController.js';
this.inspector = new InspectController(this);
this.input.on('pointermove', (p) => this.inspector.onPointerMove(p.worldX, p.worldY));

// in GameScene._onPointerDown, BETWEEN existing step 3 (tower click) and step 4 (placement):
if (this.inspector.tryClickInspect(mx, my)) return;

// in GameScene.update(dt) at the end:
this.inspector.refresh();

// in GameScene.shutdown():
this.inspector?.destroy();
```

### 5.3 Hit-test radii

- **Enemy:** `Math.hypot(mx - enemy.x, my - enemy.y) <= enemy.def.radius + 4` (4px slop)
- **Hero:** `Math.hypot(mx - hero.x, my - hero.y) <= 18` (matches hero body)

Returns the first match in iteration order — overlapping enemies are not disambiguated.

### 5.4 Panel positioning

A single private helper `_positionPanel(el, targetX, targetY)`:
- Default: `el.style.left = (targetX + 24) + 'px'`, `el.style.top = (targetY - 60) + 'px'`
- If panel would clip the viewport right edge → flip to `targetX - panelWidth - 24`
- If panel would clip the top → anchor below the target

Same helper used for pinned panels and peek tooltip.

### 5.5 Live updates

`refresh()` runs each `GameScene.update(dt)` tick (~60Hz). It:

1. Returns immediately if `pinned === null`.
2. If pinned is an enemy and `target.dead || !scene.enemies.includes(target)` → `dismiss()`.
3. Otherwise re-renders dynamic fields:
   - HP bar fill + label
   - Status line (status effects can tick down)
   - For hero: ability cooldown timers, level (if just leveled up), kill count

Cost: a few `textContent` writes per frame. Negligible.

### 5.6 Files touched

| File | Change |
|---|---|
| `src/data/weaknessMatrix.js` | new export: `describeEnemyMatchups` |
| `src/data/weaknessMatrix.test.js` | new test block for `describeEnemyMatchups` |
| `src/data/enemies.js` | add `icon` field to each of 6 entries |
| `src/data/enemies.test.js` | assert `icon` is a non-empty string for each entry |
| `src/scenes/InspectController.js` | **new** — all inspector logic |
| `src/scenes/InspectController.test.js` | **new** — jsdom-based unit tests |
| `src/scenes/GameScene.js` | ~20 lines: import, construct, wire pointermove, click step 4, refresh, destroy |
| `src/entities/Hero.js` | export `ATTACK_DAMAGE`/`ATTACK_RANGE`/`ATTACK_RATE` constants (or a `HERO_STATS` const) so the panel can read them |
| `index.html` | three new DOM elements + ~25 lines of CSS |

Estimated total diff: ~250 lines of source + ~250 lines of tests + ~50 lines of HTML/CSS. No new dependencies.

---

## 6. Edge Cases

| Case | Behavior |
|---|---|
| Inspected enemy leaks off path | Same as death — filtered from `scene.enemies`. `refresh()` `includes` check catches it, dismisses. |
| Inspected enemy takes lethal damage | HP bar reaches 0 in one frame, next tick `refresh()` sees `target.dead` and dismisses. No flicker. |
| Wave cleared while panel pinned | All enemies filtered → next `refresh()` finds target missing → dismiss. |
| Player clicks during airstrike aim | Aim mode (step 1) consumes click. Inspector never sees it. |
| Player clicks hero during reposition mode | Reposition (step 2) consumes click. Hero inspect not triggered. |
| Player has tower selected, clicks enemy | Step 4 (inspect) wins. Panel opens. Tower stays selected for next zone click. |
| Player has tower selected, clicks hero | Same — hero inspect opens, tower stays selected. |
| Player clicks already-pinned target | Toggle off — `pin()` sees `pinned.target === spec.target`, calls `dismiss()`. |
| Player clicks different enemy with pin open | Re-pin replaces — `pin()` re-renders, repositions. |
| Player clicks empty space (no inspectable, no zone) | Inspector returns false. Falls through to move-hero. Pinned panel stays open (only dismissed by explicit close, ESC, or target death). |
| ESC with no panel open | `dismiss()` early-returns if `pinned === null`. No-op. |
| Hero dies (HP→0, respawn timer) | Hero panel stays open. Abilities line replaced with `Respawning Xs`. HP bar at 0. |
| Multiple enemies overlap exactly | `_hitTestEnemy` returns first match in spawn order. Stable. |
| Peek showing, player clicks target | `pin()` calls `_hidePeek()` first, then opens pinned panel. No double-display. |
| Peek showing, player moves mouse to different enemy | Peek updates contents + position (one DOM mutation pass). |
| Peek showing, then mouse over a pinned panel | Peek hides if cursor leaves enemy/hero hit region; the pinned panel doesn't suppress peek over a different target. |
| Player resizes browser with panel open | `position: absolute` pixel coords; no re-anchor on resize. If clipped, player can close+re-pin. Acceptable v1. |
| Game paused (if pause feature exists) | Inspector stays visible. Live updates pause because `update()` doesn't run. Resume → updates resume. |
| Scene shutdown (return to menu) | `destroy()` removes ESC listener. Phaser auto-removes pointermove. No leaks. |
| New enemy added later without icon field | `def.icon ?? '?'` fallback — panel renders, just shows `? Name`. |
| Tier-4 placement override vs base-row reverse-matchup | Intentional inconsistency (§3.1). Placement panel shows folded Tier-4; inspect panel shows base-row. |

---

## 7. Testing Strategy

### 7.1 `weaknessMatrix.test.js` — `describeEnemyMatchups`

Table-driven, one assertion per enemy type. Numbers below are derived from the published `WEAKNESS_MATRIX` + `HERO_MULTIPLIERS`; implementer must re-verify each row against `src/data/weaknessMatrix.js` before committing (matrix tuning may have shifted since this spec was written).

```js
describe('describeEnemyMatchups', () => {
  it('drone → vulnerableTo [mage], resists [cannon]', () => {
    expect(describeEnemyMatchups('drone')).toEqual({ vulnerableTo: ['mage'], resists: ['cannon'] });
  });
  it('skitter → vulnerableTo [archer, barracks], resists [cannon, sniper]', () => {
    const r = describeEnemyMatchups('skitter');
    expect(r.vulnerableTo.sort()).toEqual(['archer', 'barracks']);
    expect(r.resists.sort()).toEqual(['cannon', 'sniper']);
  });
  it('brute → vulnerableTo [barracks, cannon, sniper], resists [archer]', () => {
    const r = describeEnemyMatchups('brute');
    expect(r.vulnerableTo.sort()).toEqual(['barracks', 'cannon', 'sniper']);
    expect(r.resists.sort()).toEqual(['archer']);
  });
  it('colossus → vulnerableTo [cannon, mage, sniper], resists [archer]', () => {
    const r = describeEnemyMatchups('colossus');
    expect(r.vulnerableTo.sort()).toEqual(['cannon', 'mage', 'sniper']);
    expect(r.resists.sort()).toEqual(['archer']);
  });
  it('phantom → vulnerableTo [archer, hero, mage], resists [barracks, cannon, sniper]', () => {
    const r = describeEnemyMatchups('phantom');
    expect(r.vulnerableTo.sort()).toEqual(['archer', 'hero', 'mage']);
    expect(r.resists.sort()).toEqual(['barracks', 'cannon', 'sniper']);
  });
  it('titan → vulnerableTo [cannon, mage, sniper], resists [archer, barracks, ice]', () => {
    const r = describeEnemyMatchups('titan');
    expect(r.vulnerableTo.sort()).toEqual(['cannon', 'mage', 'sniper']);
    expect(r.resists.sort()).toEqual(['archer', 'barracks', 'ice']);
  });
  it('unknown enemy → empty arrays', () => {
    expect(describeEnemyMatchups('unknown')).toEqual({ vulnerableTo: [], resists: [] });
  });
  it('hero appears in phantom vulnerableTo (HERO_MULTIPLIERS phantom: 1.5)', () => {
    expect(describeEnemyMatchups('phantom').vulnerableTo).toContain('hero');
  });
  it('hero is NOT in any other enemy\'s vulnerableTo today', () => {
    for (const e of ['drone', 'skitter', 'brute', 'colossus', 'titan']) {
      expect(describeEnemyMatchups(e).vulnerableTo).not.toContain('hero');
    }
  });
});
```

### 7.2 `enemies.test.js` — icon field

```js
it('every enemy def has a non-empty icon string', () => {
  for (const [type, def] of Object.entries(ENEMY_DEFS)) {
    expect(typeof def.icon).toBe('string');
    expect(def.icon.length).toBeGreaterThan(0);
  }
});
```

### 7.3 `InspectController.test.js` — new unit tests

jsdom (already a devDep) lets us test the DOM manipulation without Phaser. Each test sets up the panel DOM in `beforeEach` and exercises one transition.

10 tests covering:
- `pin` opens enemy inspector and writes name/HP
- Clicking same target toggles closed
- Switching target replaces panel
- `refresh` dismisses when inspected enemy dies (and is filtered from `scene.enemies`)
- `refresh` updates HP label as enemy takes damage
- `tryClickInspect` returns false for empty space
- `tryClickInspect` hits enemy within `radius + 4` slop
- Hero panel renders ability state (ready / cooldown / locked)
- Peek shows on hover, hides when cursor leaves
- ESC dismisses pinned panel

Full code lives in `src/scenes/InspectController.test.js` (see plan).

### 7.4 No GameScene integration test

Per the project's testing pattern (Phases 8 + 9b precedent), `GameScene` has no unit tests. The ~20 lines of glue in `_onPointerDown`, `create`, `update`, and `shutdown` are covered by:
- `InspectController.test.js` for the controller behavior
- Manual walkthrough (§7.5) for the end-to-end click priority

### 7.5 Manual browser walkthrough (acceptance)

On a clean build of `feature/phase-9c-click-inspect` after `npm run dev`:

1. **Enemy hover peek.** Map 1, let wave 1 spawn. Hover a Veth Drone — confirm small tooltip showing name, HP, armor, single matchup hint. Move away — peek disappears.
2. **Enemy click pin.** Click the drone. Full panel opens to right of it with name, HP bar, stats, "Vulnerable to: Mage" and "Resists: Cannon" lines. HP bar shrinks as towers damage it.
3. **Death auto-dismiss.** Let the drone die. Panel closes within a frame. No console errors.
4. **Toggle off.** Click another drone, then click it again. Panel closes.
5. **Replace pin.** Click drone A. Then click drone B without closing first. Panel switches to drone B (name and stats update).
6. **Hero hover + pin.** Hover hero — peek shows HP/level. Click hero — full hero panel opens. Trigger Q ability — confirm "Q Overcharge" cooldown appears in the panel and ticks down.
7. **ESC dismissal.** With panel pinned, press ESC. Closes.
8. **All enemy types render.** Across waves 1-10, click at least one of each: drone, skitter, brute, colossus, phantom, titan. Sanity-check the "Vulnerable to / Resists" lists against `src/data/weaknessMatrix.js`.
9. **Tower-click priority preserved.** Click a placed tower — TowerPanel opens (not inspector). 9b matchup line still renders.
10. **Tower-placement priority interaction.** Select Cannon from bottom bar. Click an enemy — inspector opens (step 4 beats step 5). Cannon stays selected. Click an empty zone — cannon places (existing behavior preserved).
11. **Hero-move priority preserved.** Click an empty path tile (no enemy/hero/tower/zone). Hero moves to that spot — inspector does not open.
12. **Wave clear auto-dismiss.** Pin late-wave enemy. Let it die or leak. Inspector closes when target is gone.
13. **No regression** on existing flows: gold income, wave progression, hero abilities Q/W/E, story banners, audio cues, 9a send-wave-early bonus, 9b weakness matrix display.

---

## 8. Out of Scope

- **Floating damage-number color tint by multiplier** — originally listed as deferred in 9b §6.4; explicitly not in 9c either. Could ship as a tiny follow-up phase.
- **Range-ring tint by matrix on enemy hover** — same disposition.
- **Tower inspect via this controller** — the existing TowerPanel already serves this need; not duplicating it here.
- **Soldier or projectile inspect** — too transient to be useful.
- **Inspector while in main menu / map select** — only relevant inside `GameScene`.
- **Mobile / touch long-press** — desktop only for v1 (same v1-scope decision as 9b).
- **Re-anchoring on browser resize** — pixel coords static after open.
- **Tier-4 folded into reverse-matchup view** — §3.1 design decision; revisit if playtesting reveals confusion.

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Click priority bug — enemy clicks accidentally consumed by placement or move-hero | Step 4 inserted explicitly between step 3 (tower) and step 5 (placement). Manual walkthrough §7.5 steps 9-11 cover all three priority cases. |
| Live `refresh()` runs every frame even with no panel open | Early-return on `pinned === null` — single null check. Cost is essentially zero. |
| `describeEnemyMatchups` returns stale data if matrix is retuned | It reads `WEAKNESS_MATRIX` at call time, not at module load. Always current. |
| Hero auto-attack constants are buried inside `Hero.js` | Plan calls for exporting them as a `HERO_STATS` const or top-level exports. Pure refactor — no behavior change. |
| New enemy added later (e.g., Phase 10+) without `icon` | `?? '?'` fallback + `enemies.test.js` icon assertion fails loudly. Catches the gap at CI time. |
| DOM listeners leak on scene shutdown | `destroy()` removes the ESC window listener. Phaser-attached pointermove is auto-removed by `this.input.on(...)` scene-tracking. |
| Players don't discover the feature | Hover peek is the discovery hook — moving the mouse over any enemy reveals the tooltip with zero friction. No tutorial needed. |
| Tier-4 placement vs reverse-matchup inconsistency | Documented in §3.1. If playtesting shows confusion, fold overrides in — `describeEnemyMatchups(enemyType, {includeTier4: true})` is a one-flag change. |

---

## 10. Acceptance Criteria

The feature ships when:

1. Unit tests in §7.1, §7.2, and §7.3 pass.
2. Manual walkthrough in §7.5 passes on a fresh build.
3. `npm test` shows no regression (~263 tests at start of phase; ~285 expected after).
4. `npm run build` is clean.
5. All DOM construction uses `createElement` + `textContent` + `appendChild` (no `innerHTML`).
6. PR description includes a short walkthrough description plus a screenshot of (a) a pinned enemy inspector showing reverse-matchup lines, and (b) a pinned hero inspector showing ability cooldowns.
