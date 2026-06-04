# Menu Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single dedicated ambient music loop to `MapSelectScene` so the map-select screen is no longer silent.

**Architecture:** Extend `AudioManager.playMusic` with a new `'menu'` branch that plays a single track on the existing ambient slot, append `'menu'` to `MUSIC_KEYS` (so `BootScene.preload` picks it up), and have `MapSelectScene.create()` call `playMusic('menu')`. Curate one CC0 ambient track and process it through the existing `scripts/convert-audio.sh` to drop dual-format `menu.mp3` + `menu.ogg` into `public/audio/music/`.

**Tech Stack:** Phaser 3, Vitest, existing `AudioManager` system, existing `convert-audio.sh` (ffmpeg with libopus).

**Spec:** [docs/superpowers/specs/2026-06-03-menu-music-design.md](../specs/2026-06-03-menu-music-design.md)

---

## File Map

- **Modify** `src/systems/AudioManager.js` — add `'menu'` to `MUSIC_KEYS`, add `'menu'` branch in `playMusic`.
- **Modify** `src/systems/AudioManager.test.js` — add two new tests in the existing music describe blocks.
- **Modify** `src/scenes/MapSelectScene.js` — add one line in `create()` to call `playMusic('menu')`.
- **Create** `src/scenes/MapSelectScene.menuMusic.test.js` — new test file, one test.
- **Create** `public/audio/music/menu.mp3` + `public/audio/music/menu.ogg` — the new track (asset; produced by curation step).
- **Modify** `ATTRIBUTIONS.md` — one new music entry.

---

## Task 1: Add `'menu'` to `MUSIC_KEYS` and `playMusic('menu')` branch

**Files:**
- Test: `src/systems/AudioManager.test.js` (modify)
- Modify: `src/systems/AudioManager.js:13-17` (MUSIC_KEYS), `:117-130` (playMusic)

- [ ] **Step 1: Write the failing test**

Open `src/systems/AudioManager.test.js`. The file already contains a `describe('AudioManager music — playMusic / setCombatActive / stopMusic', () => { ... })` block with a `makeMusicGame` helper around line 110-134 — read it to confirm the helper signature. Then add this test as a NEW `it(...)` inside that same describe block, right after the existing `playMusic(mapId) starts ambient...` test:

```js
  it("playMusic('menu') plays menu on the ambient slot at musicVol, no combat layer", () => {
    const { game, created } = makeMusicGame();
    const am = new AudioManager(game, new SaveManager());
    am.playMusic('menu');
    const menu   = created.find(s => s.key === 'menu');
    const combat = created.find(s => s.key === 'menu-combat');
    expect(menu).toBeDefined();
    expect(menu.isPlaying).toBe(true);
    expect(menu.volume).toBeCloseTo(0.8 * 0.6); // master * music defaults
    expect(combat).toBeUndefined();
    expect(am._music.ambient).toBe(menu);
    expect(am._music.combat).toBeNull();
    expect(am._music.boss).toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/systems/AudioManager.test.js -t "playMusic('menu')"`

Expected: FAIL. The current `playMusic(id)` will treat `'menu'` as if it were a numeric mapId and try to load `map-menu-ambient` / `map-menu-combat` — neither will be found, so `_music.ambient` will be null and the assertion `expect(am._music.ambient).toBe(menu)` will fail. (Specifically the `expect(menu).toBeDefined()` line will fail first because `created` won't contain a key `'menu'`.)

- [ ] **Step 3: Append `'menu'` to `MUSIC_KEYS`**

In `src/systems/AudioManager.js`, change the `MUSIC_KEYS` export from:

```js
export const MUSIC_KEYS = [
  ...Array.from({ length: 10 }, (_, i) => `map-${i}-ambient`),
  ...Array.from({ length: 10 }, (_, i) => `map-${i}-combat`),
  'boss-mid', 'boss-final',
];
```

to:

```js
export const MUSIC_KEYS = [
  ...Array.from({ length: 10 }, (_, i) => `map-${i}-ambient`),
  ...Array.from({ length: 10 }, (_, i) => `map-${i}-combat`),
  'boss-mid', 'boss-final', 'menu',
];
```

- [ ] **Step 4: Add the `'menu'` branch to `playMusic`**

In `src/systems/AudioManager.js`, the current `playMusic` method (around line 117) starts with:

```js
  playMusic(id) {
    if (id === 'boss-mid' || id === 'boss-final') {
      this._stopLayers();
      this._music.boss = this._addMusic(id);
      if (this._music.boss) this._music.boss.play({ volume: this.getEffectiveVolume('music'), loop: true });
      return;
    }
    this._stopLayers();
    this._music.combatActive = false;
    this._music.ambient = this._addMusic(`map-${id}-ambient`);
    if (this._music.ambient) this._music.ambient.play({ volume: this.getEffectiveVolume('music'), loop: true });
    this._music.combat = this._addMusic(`map-${id}-combat`);
    if (this._music.combat) this._music.combat.play({ volume: 0, loop: true });
  }
```

Add a new `if` branch immediately after the boss branch and before the default ambient/combat path:

```js
  playMusic(id) {
    if (id === 'boss-mid' || id === 'boss-final') {
      this._stopLayers();
      this._music.boss = this._addMusic(id);
      if (this._music.boss) this._music.boss.play({ volume: this.getEffectiveVolume('music'), loop: true });
      return;
    }
    if (id === 'menu') {
      this._stopLayers();
      this._music.combatActive = false;
      this._music.ambient = this._addMusic('menu');
      if (this._music.ambient) this._music.ambient.play({ volume: this.getEffectiveVolume('music'), loop: true });
      return;
    }
    this._stopLayers();
    this._music.combatActive = false;
    this._music.ambient = this._addMusic(`map-${id}-ambient`);
    if (this._music.ambient) this._music.ambient.play({ volume: this.getEffectiveVolume('music'), loop: true });
    this._music.combat = this._addMusic(`map-${id}-combat`);
    if (this._music.combat) this._music.combat.play({ volume: 0, loop: true });
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/systems/AudioManager.test.js -t "playMusic('menu')"`

Expected: PASS.

- [ ] **Step 6: Run the full AudioManager test suite to confirm no regressions**

Run: `npx vitest run src/systems/AudioManager.test.js`

Expected: All tests pass (the existing count + 1 new test).

- [ ] **Step 7: Commit**

```bash
git add src/systems/AudioManager.js src/systems/AudioManager.test.js
git commit -m "feat(audio): AudioManager.playMusic('menu') branch"
```

---

## Task 2: Test the menu → mapId transition

**Files:**
- Test: `src/systems/AudioManager.test.js` (modify)

This verifies that `playMusic('menu')` followed by `playMusic(0)` cleanly stops the menu loop and starts the level pair — no stray menu instance, no leaked references.

- [ ] **Step 1: Write the new test**

Add this test in the same `describe('AudioManager music — playMusic / setCombatActive / stopMusic', ...)` block, immediately after the test added in Task 1:

```js
  it("playMusic('menu') -> playMusic(0) stops menu and starts map-0 layers", () => {
    const { game, created } = makeMusicGame();
    const am = new AudioManager(game, new SaveManager());
    am.playMusic('menu');
    const menu = created.find(s => s.key === 'menu');
    expect(menu.isPlaying).toBe(true);
    am.playMusic(0);
    const ambient = created.find(s => s.key === 'map-0-ambient');
    const combat  = created.find(s => s.key === 'map-0-combat');
    expect(menu.isPlaying).toBe(false);
    expect(ambient.isPlaying).toBe(true);
    expect(combat.isPlaying).toBe(true);
    expect(am._music.ambient).toBe(ambient);
    expect(am._music.combat).toBe(combat);
  });
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run src/systems/AudioManager.test.js -t "playMusic('menu') -> playMusic(0)"`

Expected: PASS. Task 1 already implemented the behavior this test verifies — `_stopLayers()` is called inside the default ambient/combat branch, which stops the menu sound that's living on the ambient slot.

- [ ] **Step 3: Run the full AudioManager test suite**

Run: `npx vitest run src/systems/AudioManager.test.js`

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/systems/AudioManager.test.js
git commit -m "test(audio): cover playMusic('menu') -> mapId transition"
```

---

## Task 3: Wire `MapSelectScene.create()` to play menu music

**Files:**
- Create: `src/scenes/MapSelectScene.menuMusic.test.js`
- Modify: `src/scenes/MapSelectScene.js:17-42` (create method)

- [ ] **Step 1: Write the failing test in a new file**

Create `src/scenes/MapSelectScene.menuMusic.test.js` with the following contents:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: { Scene: class { constructor(){} events = { on(){} } } },
}));

import MapSelectScene from './MapSelectScene.js';

function setupDom() {
  document.body.replaceChildren();
  const ids = [
    'map-select', 'map-sidebar', 'featured-name', 'featured-stars',
    'featured-blurb', 'featured-tier', 'featured-play', 'total-stars',
    'lifetime-stats', 'hero-picker-cards', 'open-upgrades', 'open-settings',
  ];
  for (const id of ids) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
}

describe('MapSelectScene menu music', () => {
  beforeEach(() => {
    setupDom();
    localStorage.clear();
  });

  it("create() calls audio.playMusic('menu') exactly once", () => {
    const playMusicSpy = vi.fn();
    const am = { playMusic: playMusicSpy };
    const registry = new Map([['audio', am]]);
    const scene = new MapSelectScene();
    scene.game = { registry };
    scene.create();
    expect(playMusicSpy).toHaveBeenCalledTimes(1);
    expect(playMusicSpy).toHaveBeenCalledWith('menu');
  });

  it('create() does not throw when no audio manager is registered', () => {
    const scene = new MapSelectScene();
    scene.game = { registry: new Map() };
    expect(() => scene.create()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify the first one fails**

Run: `npx vitest run src/scenes/MapSelectScene.menuMusic.test.js`

Expected:
- The `does not throw` test PASSES (current `create()` already runs without audio).
- The `playMusic('menu')` test FAILS — the spy is never called because `create()` currently has no audio wiring.

- [ ] **Step 3: Wire `MapSelectScene.create()` to call `playMusic('menu')`**

In `src/scenes/MapSelectScene.js`, the current `create()` method is:

```js
  create() {
    this.events.on('shutdown', this.shutdown, this);

    const container = document.getElementById('map-select');
    container.style.display = 'flex';

    this._saveMgr = new SaveManager();
    this._upgradeMgr = new UpgradeManager(this._saveMgr);
    this._overlay    = new UpgradeTreeOverlay(this._upgradeMgr);

    // Default to highest unlocked map
    let defaultId = 0;
    for (let i = MAPS.length - 1; i >= 0; i--) {
      if (this._saveMgr.isUnlocked(i)) { defaultId = i; break; }
    }
    this._selectedId = defaultId;

    this._populateSidebar();
    this._renderFeatured(this._selectedId);
    this._bindPlay();
    this._renderMetaBar();
    this._renderStats();
    this._renderHeroPicker();
    this._bindUpgrades();
    this._bindSettings();
  }
```

Add two new lines at the end of the method, right after `this._bindSettings();`:

```js
    const am = this.game.registry.get('audio');
    if (am) am.playMusic('menu');
```

The full updated `create()` should read:

```js
  create() {
    this.events.on('shutdown', this.shutdown, this);

    const container = document.getElementById('map-select');
    container.style.display = 'flex';

    this._saveMgr = new SaveManager();
    this._upgradeMgr = new UpgradeManager(this._saveMgr);
    this._overlay    = new UpgradeTreeOverlay(this._upgradeMgr);

    // Default to highest unlocked map
    let defaultId = 0;
    for (let i = MAPS.length - 1; i >= 0; i--) {
      if (this._saveMgr.isUnlocked(i)) { defaultId = i; break; }
    }
    this._selectedId = defaultId;

    this._populateSidebar();
    this._renderFeatured(this._selectedId);
    this._bindPlay();
    this._renderMetaBar();
    this._renderStats();
    this._renderHeroPicker();
    this._bindUpgrades();
    this._bindSettings();

    const am = this.game.registry.get('audio');
    if (am) am.playMusic('menu');
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/scenes/MapSelectScene.menuMusic.test.js`

Expected: Both tests pass.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npx vitest run`

Expected: All tests pass. Particularly verify that `MapSelectScene.heroPicker.test.js` still passes — it does not invoke `create()`, so it should not regress, but a global run confirms.

- [ ] **Step 6: Commit**

```bash
git add src/scenes/MapSelectScene.js src/scenes/MapSelectScene.menuMusic.test.js
git commit -m "feat(scenes): MapSelectScene plays 'menu' music on create"
```

---

## Task 4: Curate the `menu` audio asset

This task is the manual curation step. It does NOT block Tasks 1–3 — they're complete on their own. With `'menu'` in `MUSIC_KEYS` but no file on disk, `_addMusic` will log one console warning and the game runs fine. The asset can land in a follow-up commit (still on this branch) or after manual sourcing.

**Files:**
- Create: `public/audio/music/menu.mp3`
- Create: `public/audio/music/menu.ogg`
- Modify: `ATTRIBUTIONS.md`

- [ ] **Step 1: Source one CC0 ambient/menu track**

Manual step. Browse the same CC0 wells used in Phase 8b — Kenney, OpenGameArt.org, Patrick de Arteaga, Bensound (CC0/free tier). Target:

- Calm, mysterious, slightly cinematic tone
- 60–90 s seamless loop preferred (the AudioManager loops via `loop: true`)
- No prominent percussion or combat motifs
- License must be CC0 or equivalent (CC-BY acceptable if attribution is added)

Place the raw source file in the project's audio staging area following Phase 8b convention. Refer to the previous music curation spec at [docs/superpowers/specs/2026-05-31-phase-8b-music-curation-design.md](../specs/2026-05-31-phase-8b-music-curation-design.md) if the staging path is non-obvious; the Phase 8b downloader script `scripts/fetch-phase-8b-staging.sh` is also a reference for how the existing tracks were sourced.

- [ ] **Step 2: Run `convert-audio.sh` to produce both formats**

The existing `scripts/convert-audio.sh` writes MP3 + Opus(.ogg) for every input. Run it. The output file basename must be `menu` so the final paths are `public/audio/music/menu.mp3` and `public/audio/music/menu.ogg`.

Run: `./scripts/convert-audio.sh` (or the project's documented invocation if it takes args — check `scripts/convert-audio.sh --help` or read the top of the script).

Verify both files exist and play correctly:

```bash
ls -lh public/audio/music/menu.*
file public/audio/music/menu.ogg
file public/audio/music/menu.mp3
```

Expected: two files present, OGG identified as Ogg/Opus, MP3 identified as MPEG ADTS.

- [ ] **Step 3: Update `ATTRIBUTIONS.md`**

Open `ATTRIBUTIONS.md`. Find the Music section (the existing Phase 8b tracks are listed there). Add a new entry in the same format as the existing ones — typically `Track Title — Artist — License — Source URL — used as: menu loop`. Read the existing entries to confirm the exact format before adding.

- [ ] **Step 4: Commit**

```bash
git add public/audio/music/menu.mp3 public/audio/music/menu.ogg ATTRIBUTIONS.md
git commit -m "feat(audio): add CC0 'menu' track for MapSelectScene"
```

---

## Task 5: Browser verification

This task is manual end-to-end verification. Per `CLAUDE.md` step 7 ("Verify"), it is non-skippable.

**Files:** none modified.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (or whatever the project's documented dev command is — check `package.json` scripts).

- [ ] **Step 2: Verify menu music plays on first load**

Open the game in a browser. After the boot splash completes and `MapSelectScene` is visible, confirm the `menu` track is audible. Check the browser console for any `[AudioManager] music key "menu" not found in cache` warning — if present, the asset is missing or the path is wrong.

- [ ] **Step 3: Verify menu→level transition**

Click Play on Map 1. Confirm the menu music cuts and the map-0 ambient+combat pair starts. The cut should be in the same frame (no overlap, no silence gap beyond a few ms).

- [ ] **Step 4: Verify return-to-menu resumes the loop**

In-game, click the Exit button (or die / win). Land back on `MapSelectScene` and confirm the menu music resumes from the start.

- [ ] **Step 5: Verify overlays do not stop music**

On `MapSelectScene`, click the ⚙ Upgrades or ♪ Audio buttons to open the DOM overlays. Confirm menu music continues playing underneath. Close the overlay and confirm it's still playing.

- [ ] **Step 6: Verify volume controls work**

Open the Settings overlay (♪). Drag the Music slider to 0 — menu music should fade or drop to silent. Drag back up — should return. Toggle mute — should silence everything including menu music.

- [ ] **Step 7: Commit any final touch-ups discovered during verification**

If verification reveals a tweak is needed (e.g., volume balance, a missed test), make the change and commit it with a descriptive message. If no tweaks are needed, this step is a no-op.

---

## Final test sweep

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`

Expected: All tests pass (existing count + 3 new tests added in this plan: 2 in AudioManager, 1 in MapSelectScene.menuMusic — the "does not throw" test does not count as a new behavior assertion since it merely guards an existing code path, but it does add to the test count).

- [ ] **Step 2: Final commit if anything is pending**

If the working tree is clean, this is a no-op. Otherwise commit any straggler files.

---

## Self-Review (already run)

**Spec coverage:**
- §Asset → Task 4 (curation + convert + attributions)
- §API extension `MUSIC_KEYS` → Task 1 Step 3
- §API extension `playMusic('menu')` branch → Task 1 Step 4
- §Backward compatibility → covered implicitly (Task 1 is additive only)
- §Scene wiring `create()` → Task 3 Step 3
- §Scene wiring `shutdown()` → no change required, documented in Task 3 narrative
- §Return-to-menu → covered by Task 5 Step 4
- §DOM overlays → covered by Task 5 Step 5
- §Test coverage (1) playMusic('menu') → Task 1 Step 1
- §Test coverage (2) transition → Task 2 Step 1
- §Test coverage (4) MapSelectScene calls playMusic('menu') → Task 3 Step 1
- §Implementation order → mirrors the spec ordering
- §Risks → asset-agnostic claim verified (Task 4 deferral is explicit in plan narrative)
- §Files touched → all 6 file paths from the spec appear in the File Map

**Placeholder scan:** No TBDs, no "similar to Task N", no abstract "add validation" — every step has code or commands.

**Type/name consistency:** Key name `'menu'` consistent everywhere. Spy name `playMusicSpy` consistent within Task 3. Test file name `MapSelectScene.menuMusic.test.js` consistent across Task 3 and File Map.
