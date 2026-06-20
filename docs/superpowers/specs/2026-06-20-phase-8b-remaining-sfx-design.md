# Phase 8b — Remaining SFX: Per-Branch Tower Fire + Per-Enemy Hit Sounds

**Date:** 2026-06-20
**Backlog item:** #1 — Phase 8b remaining SFX work
**Branch:** off `origin/feature/map0-path-fit`; PR targets `feature/map0-path-fit`

## Problem

Two placeholder-sound gaps remain from Phase 8b:

1. **Tower fire SFX are keyed by base tower type only.** `GameScene` plays
   `tower-fire-${tower.type}` (GameScene.js:~744), so both Tier-4 branches of each
   branching tower share the base fire sound. The 5 branching towers each have two
   distinct end-states that should sound different:
   - archer → **Volley** (A) / **Marksman** (B)
   - mage → **Archmage** (A) / **Frost Mage** (B)
   - cannon → **Artillery** (A) / **Rapid Cannon** (B)
   - ice → **Permafrost** (A) / **Shatter** (B)
   - sniper → **Assassin** (A) / **Rapid Fire** (B)
2. **Every enemy plays one generic hit sound.** `Enemy.takeDamage` plays a single
   `enemy-hit` with random detune (Enemy.js:~87) for all 6 enemy types
   (drone, skitter, brute, colossus, phantom, titan).

The new sounds require new CC0 audio assets — a manual curation step. We do **not**
want code to wait on asset curation.

## Goal

Ship the code now so the feature is wired and tested, with a **graceful fallback** to
the existing base sound whenever a branch/enemy-specific asset is not yet present.
This mirrors the overworld node-art pattern (PR #37): the renderer/player derives the
specific key but falls back to the base until the real asset drops in — at which point
the asset works with **zero code change**.

## Design

### New module: `src/systems/sfxKeys.js` (pure)

Two pure, dependency-free functions. The caller passes the list of registered SFX keys
(`SFX_KEYS` from `AudioManager`) so the module has no import coupling and is fully
unit-testable.

```js
export function towerFireSfxKey(type, branch, registeredKeys) {
  const specific = branch ? `tower-fire-${type}-${branch}` : null;
  return specific && registeredKeys.includes(specific)
    ? specific
    : `tower-fire-${type}`;
}

export function enemyHitSfxKey(type, registeredKeys) {
  const specific = `enemy-hit-${type}`;
  return registeredKeys.includes(specific) ? specific : 'enemy-hit';
}
```

Both functions are total: any unknown/missing/null input resolves to the existing base
key (`tower-fire-${type}` / `enemy-hit`). `branch` is `'A'`, `'B'`, or `null` (lower
tiers and non-upgraded towers have `branch === null`).

### Call-site rewires

**`src/scenes/GameScene.js` (~line 744)** — tower fire:

```js
// before
if (am) am.playSfx(`tower-fire-${tower.type}`);
// after
if (am) am.playSfx(towerFireSfxKey(tower.type, tower.branch, SFX_KEYS));
```
Import `{ towerFireSfxKey }` from `../systems/sfxKeys.js` and `{ SFX_KEYS }` from the
AudioManager module.

**`src/entities/Enemy.js` (~line 87)** — enemy hit:

```js
// before
if (am) am.playSfx('enemy-hit', { detune: (Math.random() - 0.5) * 100 });
// after
if (am) am.playSfx(enemyHitSfxKey(this.def.type, SFX_KEYS), { detune: (Math.random() - 0.5) * 100 });
```
Import `{ enemyHitSfxKey }` and `{ SFX_KEYS }`. **The random detune is preserved** on
whichever key resolves, keeping per-hit pitch variation.

### Asset handling — deferred

`SFX_KEYS` is **unchanged** in this PR. With no new keys registered, every call falls
back to the base sound today — identical audible behavior to current, zero new decode
risk. The 16 future assets are documented in a curation note; when a real `.mp3` lands
in `public/audio/sfx/` **and** its key is added to `SFX_KEYS`, the helpers pick it up
automatically.

**16 future files** (`public/audio/sfx/<key>.mp3`):

| Group | Keys |
|-------|------|
| Tower branch (10) | `tower-fire-{archer,mage,cannon,ice,sniper}-{A,B}` |
| Enemy hit (6) | `enemy-hit-{drone,skitter,brute,colossus,phantom,titan}` |

Curation note: new `assets/audio/PROMPTS.md` (mirrors `assets/overworld/PROMPTS.md`),
listing each file, the branch/enemy character it should convey, and the existing
workflow (Kenney CC0 source → `scripts/convert-audio.sh` → register in `SFX_KEYS` →
add credit to `public/audio/ATTRIBUTIONS.md`). A one-line pointer is added to
`public/audio/ATTRIBUTIONS.md` referencing the pending curation list.

## Testing

### Unit — `src/systems/sfxKeys.test.js`
- `towerFireSfxKey`:
  - specific key registered → returns `tower-fire-<type>-<branch>`
  - specific key NOT registered → returns `tower-fire-<type>` (base)
  - `branch === null` → returns base (no specific lookup)
  - empty/whatever `registeredKeys` → returns base
- `enemyHitSfxKey`:
  - specific registered → `enemy-hit-<type>`
  - not registered → `enemy-hit`
  - empty `registeredKeys` → `enemy-hit`
- Pattern coverage: the 10 tower-branch + 6 enemy names follow the documented
  `tower-fire-<type>-<branch>` / `enemy-hit-<type>` shape.

### Suite + build
- Full `npx vitest run` green (no regressions).
- `npm run build` clean.

### Browser verification
- Page loads with **zero audio decode errors** in console (Phase 8b drove this to 0 —
  must not regress).
- Spy `AudioManager.playSfx`: building & upgrading a tower to a Tier-4 branch then
  firing requests `tower-fire-<type>-<A|B>` resolution (falls back to base on play
  today); damaging each enemy type resolves `enemy-hit-<type>`.

## Out of scope
- Sourcing/converting the actual `.mp3` assets (separate manual curation pass).
- Barracks fire SFX — barracks deploys soldiers, fires no projectiles; unaffected.
- Per-tier (non-branch) tower fire variation — only the 5 Tier-4 branches are split.
