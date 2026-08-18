# Phase 8b Remaining SFX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the 5 branching towers distinct fire SFX per Tier-4 branch and the 6 enemy types distinct hit sounds, deriving the key in code with a graceful fallback to the existing base sound so the feature ships before any new audio assets exist.

**Architecture:** One new pure module (`src/systems/sfxKeys.js`) maps `(type, branch)`/`(type)` to a specific SFX key when that key is registered in `SFX_KEYS`, else returns the existing base key. Two call sites (tower fire in `GameScene`, enemy hit in `Enemy`) are rewired to use the helpers. `SFX_KEYS` is unchanged this PR, so every call falls back to the base sound today; the 16 future assets are documented in a curation note and picked up automatically once added.

**Tech Stack:** Vanilla ES modules, Phaser 3, Vitest. Audio plays through `AudioManager.playSfx(key, opts)`.

---

### Task 1: Pure SFX-key helper module

**Files:**
- Create: `src/systems/sfxKeys.js`
- Test: `src/systems/sfxKeys.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/systems/sfxKeys.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { towerFireSfxKey, enemyHitSfxKey } from './sfxKeys.js';

const BASE_KEYS = [
  'tower-fire-archer', 'tower-fire-cannon', 'tower-fire-mage',
  'tower-fire-ice', 'tower-fire-sniper', 'tower-fire-barracks',
  'enemy-hit',
];

describe('towerFireSfxKey', () => {
  it('returns the branch-specific key when it is registered', () => {
    const keys = [...BASE_KEYS, 'tower-fire-archer-A'];
    expect(towerFireSfxKey('archer', 'A', keys)).toBe('tower-fire-archer-A');
  });

  it('falls back to the base key when the specific key is not registered', () => {
    expect(towerFireSfxKey('archer', 'A', BASE_KEYS)).toBe('tower-fire-archer');
  });

  it('returns the base key when branch is null (no specific lookup)', () => {
    const keys = [...BASE_KEYS, 'tower-fire-archer-A'];
    expect(towerFireSfxKey('archer', null, keys)).toBe('tower-fire-archer');
  });

  it('returns the base key when registeredKeys is empty', () => {
    expect(towerFireSfxKey('sniper', 'B', [])).toBe('tower-fire-sniper');
  });
});

describe('enemyHitSfxKey', () => {
  it('returns the type-specific key when it is registered', () => {
    const keys = [...BASE_KEYS, 'enemy-hit-brute'];
    expect(enemyHitSfxKey('brute', keys)).toBe('enemy-hit-brute');
  });

  it('falls back to the generic enemy-hit when the specific key is not registered', () => {
    expect(enemyHitSfxKey('brute', BASE_KEYS)).toBe('enemy-hit');
  });

  it('returns the generic key when registeredKeys is empty', () => {
    expect(enemyHitSfxKey('drone', [])).toBe('enemy-hit');
  });
});

describe('key naming patterns (future-asset contract)', () => {
  const TOWER_TYPES = ['archer', 'mage', 'cannon', 'ice', 'sniper'];
  const BRANCHES = ['A', 'B'];
  const ENEMY_TYPES = ['drone', 'skitter', 'brute', 'colossus', 'phantom', 'titan'];

  it('derives 10 tower-branch keys in tower-fire-<type>-<branch> form', () => {
    const derived = [];
    for (const t of TOWER_TYPES) {
      for (const b of BRANCHES) {
        const keys = [`tower-fire-${t}-${b}`];
        derived.push(towerFireSfxKey(t, b, keys));
      }
    }
    expect(derived).toEqual([
      'tower-fire-archer-A', 'tower-fire-archer-B',
      'tower-fire-mage-A', 'tower-fire-mage-B',
      'tower-fire-cannon-A', 'tower-fire-cannon-B',
      'tower-fire-ice-A', 'tower-fire-ice-B',
      'tower-fire-sniper-A', 'tower-fire-sniper-B',
    ]);
  });

  it('derives 6 enemy-hit keys in enemy-hit-<type> form', () => {
    const derived = ENEMY_TYPES.map((t) => enemyHitSfxKey(t, [`enemy-hit-${t}`]));
    expect(derived).toEqual([
      'enemy-hit-drone', 'enemy-hit-skitter', 'enemy-hit-brute',
      'enemy-hit-colossus', 'enemy-hit-phantom', 'enemy-hit-titan',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/systems/sfxKeys.test.js`
Expected: FAIL — `Failed to resolve import "./sfxKeys.js"` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/systems/sfxKeys.js`:

```js
/**
 * Pure SFX-key derivation with graceful fallback.
 *
 * Returns a branch/enemy-specific SFX key when that key is present in the
 * provided registered-keys list, otherwise the existing base key. This lets the
 * branch/enemy-specific audio assets be added later (registered in SFX_KEYS)
 * with zero code change — until then every call resolves to the base sound.
 */

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/systems/sfxKeys.test.js`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/systems/sfxKeys.js src/systems/sfxKeys.test.js
git commit -m "feat(sfx): pure towerFireSfxKey/enemyHitSfxKey helpers with base fallback (backlog #1)"
```

---

### Task 2: Wire tower fire SFX to the branch-aware key

**Files:**
- Modify: `src/scenes/GameScene.js` (import block; tower-fire play site ~line 744)

**Context:** The play site currently reads:
```js
const am = this.game.registry.get('audio');
if (am) am.playSfx(`tower-fire-${tower.type}`);
```
`tower.branch` is `'A'`, `'B'`, or `null` (set by `Tower.upgrade(tier, branch)` only at Tier 4). `SFX_KEYS` and the helper must both be imported.

- [ ] **Step 1: Add imports**

At the top of `src/scenes/GameScene.js`, add (grouped with existing `src/systems` imports):

```js
import { SFX_KEYS } from '../systems/AudioManager.js';
import { towerFireSfxKey } from '../systems/sfxKeys.js';
```

If `GameScene.js` already imports something from `../systems/AudioManager.js`, add `SFX_KEYS` to that existing import instead of adding a duplicate line. Verify first:

Run: `grep -n "systems/AudioManager" src/scenes/GameScene.js`

- [ ] **Step 2: Replace the play call**

Change:
```js
if (am) am.playSfx(`tower-fire-${tower.type}`);
```
to:
```js
if (am) am.playSfx(towerFireSfxKey(tower.type, tower.branch, SFX_KEYS));
```

- [ ] **Step 3: Verify the full suite still passes**

Run: `npx vitest run`
Expected: PASS — same green count as before plus Task 1's new tests; no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.js
git commit -m "feat(sfx): branch-aware tower fire key at GameScene play site (backlog #1)"
```

---

### Task 3: Wire enemy hit SFX to the per-type key

**Files:**
- Modify: `src/entities/Enemy.js` (import block; enemy-hit play site ~line 87)

**Context:** The play site currently reads:
```js
const am = this.scene.game?.registry?.get('audio');
if (am) am.playSfx('enemy-hit', { detune: (Math.random() - 0.5) * 100 });
```
`this.def.type` is one of `drone | skitter | brute | colossus | phantom | titan`. The random detune must be preserved.

**Note on imports:** `Enemy.js` imports Phaser, so its existing tests already `vi.mock` Phaser. Importing two more pure ES modules (`AudioManager`'s `SFX_KEYS` export and `sfxKeys.js`) adds no Phaser-dependent code path to Enemy. `AudioManager.js` itself does not import Phaser at module top-level for the `SFX_KEYS`/`MUSIC_KEYS` constant exports — confirm with `grep -n "^import" src/systems/AudioManager.js` before importing; if `AudioManager.js` imports Phaser at top level, import the key list is still safe because tests mock Phaser, but verify the existing `AudioManager.test.js` pattern.

- [ ] **Step 1: Confirm AudioManager import safety**

Run: `grep -n "^import" src/systems/AudioManager.js`
Expected: note whether Phaser is imported at top level. (`SFX_KEYS` is a plain array constant either way.)

- [ ] **Step 2: Add imports**

At the top of `src/entities/Enemy.js`, add (grouped with existing imports):

```js
import { SFX_KEYS } from '../systems/AudioManager.js';
import { enemyHitSfxKey } from '../systems/sfxKeys.js';
```

- [ ] **Step 3: Replace the play call**

Change:
```js
if (am) am.playSfx('enemy-hit', { detune: (Math.random() - 0.5) * 100 });
```
to:
```js
if (am) am.playSfx(enemyHitSfxKey(this.def.type, SFX_KEYS), { detune: (Math.random() - 0.5) * 100 });
```

- [ ] **Step 4: Verify the full suite still passes**

Run: `npx vitest run`
Expected: PASS — no regressions. If `Enemy.test.js` errors on the new import (jsdom/Phaser), add `SFX_KEYS`/`sfxKeys` to the existing mock setup the same way the file already mocks its dependencies, then re-run.

- [ ] **Step 5: Commit**

```bash
git add src/entities/Enemy.js
git commit -m "feat(sfx): per-enemy-type hit key at Enemy play site (backlog #1)"
```

---

### Task 4: Curation note for the 16 future assets

**Files:**
- Create: `assets/audio/PROMPTS.md`
- Modify: `public/audio/ATTRIBUTIONS.md`

**Context:** Mirrors `assets/overworld/PROMPTS.md` — a deferred-asset checklist. No code depends on this; it documents what to source so the helpers light up later. Read `assets/overworld/PROMPTS.md` first to match tone/format.

- [ ] **Step 1: Read the existing prompt-note pattern**

Run: `sed -n '1,40p' assets/overworld/PROMPTS.md`

- [ ] **Step 2: Create the curation note**

Create `assets/audio/PROMPTS.md`:

```markdown
# Phase 8b Remaining SFX — Curation Checklist

Deferred audio assets for backlog #1. The code derives these keys today and falls
back to the base sound until each file exists AND its key is registered in
`SFX_KEYS` (`src/systems/AudioManager.js`). See
`src/systems/sfxKeys.js` for the derivation.

## How to add a sound

1. Source a CC0 clip (Kenney CC0 packs: https://kenney.nl/assets — see
   `public/audio/ATTRIBUTIONS.md` for the packs already used).
2. Convert/normalize via `scripts/convert-audio.sh` to `public/audio/sfx/<key>.mp3`.
3. Add `<key>` to the `SFX_KEYS` array in `src/systems/AudioManager.js`.
4. Add a credit line to `public/audio/ATTRIBUTIONS.md`.

No call-site changes are needed — the helpers pick the key up automatically.

## Tower fire — 10 files (per Tier-4 branch)

| Key | Tower branch | Character to convey |
|-----|--------------|---------------------|
| `tower-fire-archer-A.mp3`  | Volley       | rapid multi-arrow flurry |
| `tower-fire-archer-B.mp3`  | Marksman     | single heavy long-range thwip |
| `tower-fire-mage-A.mp3`    | Archmage     | crackling chain-lightning zap |
| `tower-fire-mage-B.mp3`    | Frost Mage   | icy AoE frost burst |
| `tower-fire-cannon-A.mp3`  | Artillery    | deep boom, shell-splitting |
| `tower-fire-cannon-B.mp3`  | Rapid Cannon | fast light cannon pops |
| `tower-fire-ice-A.mp3`     | Permafrost   | sustained freezing hiss |
| `tower-fire-ice-B.mp3`     | Shatter      | sharp ice-crack snap |
| `tower-fire-sniper-A.mp3`  | Assassin     | suppressed precision shot |
| `tower-fire-sniper-B.mp3`  | Rapid Fire   | fast repeated rifle cracks |

## Enemy hit — 6 files (per enemy type)

| Key | Enemy | Character to convey |
|-----|-------|---------------------|
| `enemy-hit-drone.mp3`    | drone    | light metallic ping |
| `enemy-hit-skitter.mp3`  | skitter  | small chitinous crunch |
| `enemy-hit-brute.mp3`    | brute    | heavy fleshy thud |
| `enemy-hit-colossus.mp3` | colossus | massive armored clang |
| `enemy-hit-phantom.mp3`  | phantom  | ethereal warped impact |
| `enemy-hit-titan.mp3`    | titan    | deep resonant boss hit |
```

- [ ] **Step 3: Add a pointer in ATTRIBUTIONS.md**

Append to `public/audio/ATTRIBUTIONS.md` (after the existing content):

```markdown

## Pending curation

Backlog #1 (Phase 8b remaining SFX) reserves 16 not-yet-sourced keys — 10
per-tower-branch fire sounds and 6 per-enemy-type hit sounds. The code falls back
to the existing base sounds until they are added. See `assets/audio/PROMPTS.md`
for the checklist.
```

- [ ] **Step 4: Commit**

```bash
git add assets/audio/PROMPTS.md public/audio/ATTRIBUTIONS.md
git commit -m "docs(audio): curation checklist for 16 deferred Phase 8b SFX (backlog #1)"
```

---

## Self-Review

**Spec coverage:**
- Per-branch tower fire SFX → Task 1 (helper) + Task 2 (wire). ✓
- Per-enemy-type hit SFX → Task 1 (helper) + Task 3 (wire). ✓
- Graceful base fallback → Task 1 logic + tests. ✓
- Caller passes `SFX_KEYS` (no import coupling in helper) → Task 1 signature, Tasks 2/3 pass `SFX_KEYS`. ✓
- Preserve random detune on enemy hit → Task 3 keeps the `detune` opt. ✓
- Deferred assets, `SFX_KEYS` unchanged → no task modifies `SFX_KEYS`; Task 4 documents the 16 files. ✓
- Curation note mirrors overworld pattern + ATTRIBUTIONS pointer → Task 4. ✓
- Unit tests for both helpers incl. fallback/empty/null cases + pattern coverage → Task 1 tests. ✓

**Placeholder scan:** No TBD/TODO/"similar to Task N" — all code shown in full. ✓

**Type/name consistency:** `towerFireSfxKey(type, branch, registeredKeys)` and `enemyHitSfxKey(type, registeredKeys)` used identically in helper definition (Task 1), tests (Task 1), and call sites (Tasks 2–3). Key strings `tower-fire-<type>-<branch>` / `enemy-hit-<type>` consistent across helper, tests, and curation note. ✓

**Browser verification** (after Task 4, done in main session): load app → 0 audio decode errors in console; spy `playSfx` to confirm branched-tower fire and per-enemy-type hits resolve the expected keys (fall back to base on play today).
