# Campaign Storyline + Per-Level Mini-Stories — Design Spec

**Date:** 2026-06-21
**Backlog item:** #4 — Overarching storyline + per-level mini-stories
**Branch:** `feature/campaign-storyline` (based on `feature/map0-path-fit`)
**Scope:** Approach A, **Phase 1 only** — narrative engine + full written campaign + text/placeholder portraits. Real portrait art and any cinematic polish are a separate **Phase 2** backlog item.

---

## 1. Problem & Goal

The game already has a thin story layer: `STORY_PANELS` in `src/data/story.js` provides two mid-wave single-banner beats per map plus a post-victory "unlock" panel, driven by `StoryManager` and the `#story-banner` DOM element. The content is generic filler ("hold the line", "trust the defenses") with **no overarching narrative**: no faction identity, no stated motivation, no end goal, and no pre-battle framing. Boss levels are not tied to deliberate story beats.

**Goal:** Deliver a cohesive, fully-written campaign — *Last Light* — surfaced as a "full narrative experience": a campaign opener, a pre-battle briefing and post-battle epilogue per map, weightier boss beats, and a final ending, presented through a new multi-panel story dialog. Story sequences show once (persisted), auto-skip on replay, are always skippable mid-sequence, and are re-readable from a Story Log entry point.

**Non-goals (Phase 2, separate backlog item):** real portrait artwork; animated/cinematic opener or ending; voice/audio for dialog. Phase 1 ships complete and playable using the deferred-asset fallback.

---

## 2. Narrative Bible

**Title:** *Last Light.*

**Faction (player):** the **Sol Vanguard** — the remnant of humanity's unified military after a surprise alien incursion shattered the home fleet. The player is field commander **Commander Rael** (the existing lead hero, `heroes.js` → `rael`), directing tower defenses and hero units.

**Enemy:** the **Vorn** — a hive-species that consumes worlds, advancing as a tide of bio-engineered drones (the swarm enemy types) and living siege-beasts (the **Titans**, bred by the hive). Driven by a single hive-mind; they do not negotiate.

**End goal:** push the Vorn out of the Sol system, carry the war to their homeworld, and extinguish the hive-core at the final stronghold — **Last Light** — ending the war permanently.

**Speakers:** `command` (Sol Command — strategic briefings), `rael` (Commander Rael — field voice), `vorn` (the hive-mind — rare, ominous interjections at boss beats). All three are in the `STORY_SPEAKERS` registry.

**Arc (turning point at Map 5):**

| Act | Maps | `storyKey` | Beat |
|-----|------|-----------|------|
| **I — Hold & Reclaim** | 0 Outpost Sigma | `outpost_sigma` | Last forward base; hold the line. |
| | 1 Lunar Gate | `lunar_gate` | First counter-push; retake the gate. |
| | 2 The Crater | `the_crater` | Secure the crater approach. |
| | 3 Orbital Station | `orbital_station` | Reclaim the station; Vorn air units appear. |
| | 4 Asteroid Belt | `asteroid_belt` | Clear the edge of Sol; Vorn massing beyond. |
| **Turning point** | 5 Titan's Reach | `titans_reach` | Cross into Vorn space; **first Titan**. War flips to offense. |
| **II — The Long Hunt** | 6 Deep Space Corridor | `deep_space_corridor` | Behind enemy lines, no support. |
| | 7 The Void Frontier | `the_void_frontier` | Titan packs; homeworld coordinates acquired. |
| **III — The End** | 8 Enemy Homeworld | `enemy_homeworld` | Assault the Vorn world; hive defenses. |
| | 9 Last Light | `last_light` | Final stronghold; destroy the hive-core. Campaign ends. |

**Tone:** heroic military sci-fi; earnest, high-stakes, no twist. Boss maps (5, 8, 9) get weightier beats including rare `vorn` hive-mind lines.

---

## 3. Architecture Overview

Five units, each independently testable:

1. **`src/data/story.js`** (expanded) — pure data: `STORY_SPEAKERS`, `STORY_SEQUENCES`, and the retained `STORY_PANELS`.
2. **`src/systems/storySequence.js`** (new, pure) — sequence navigation state machine; no DOM, no Phaser.
3. **`src/ui/StoryDialogOverlay.js`** (new, DOM) — renders a sequence's panels with Next/Skip; mirrors `SettingsOverlay` lifecycle.
4. **`src/systems/SaveManager.js`** (extended) — `seenStoryBeats` persistence with v3→v4 migration.
5. **Wiring** — `MapSelectScene` (opener + Story Log), `GameScene` (briefing + epilogue/ending), retained `StoryManager` mid-wave banner.

```
MapSelectScene.create ──(first load, unseen)──> StoryDialogOverlay.play('campaign_intro')
MapSelectScene "Story Log" button ───────────> StoryDialogOverlay.play(<any seen beat>)
GameScene.create ──(before wave 1, unseen)───> StoryDialogOverlay.play('brief_<storyKey>')
GameScene._checkWaveComplete ────────────────> StoryManager.showBanner(...)   (unchanged)
GameScene._onVictory ──(non-final)───────────> StoryDialogOverlay.play('epilogue_<storyKey>')
GameScene._onVictory ──(map 9)───────────────> StoryDialogOverlay.play('campaign_ending')
```

---

## 4. Data Schema — `src/data/story.js`

### 4.1 `STORY_SPEAKERS`

```js
export const STORY_SPEAKERS = {
  command: { name: 'Sol Command',     color: 0x4aa3ff, portraitKey: 'portrait-command' },
  rael:    { name: 'Commander Rael',  color: 0xffd24a, portraitKey: 'portrait-rael'    },
  vorn:    { name: 'The Vorn',        color: 0x9b4dff, portraitKey: 'portrait-vorn'    },
};
```

### 4.2 `STORY_SEQUENCES`

Keyed by beat id; each value is `{ panels: Panel[] }` where `Panel = { speaker: string, text: string }`. `speaker` must be a key of `STORY_SPEAKERS`.

Required keys:
- `campaign_intro` — the opener (3–5 panels: the incursion, the Vanguard, Rael, the objective).
- `brief_<storyKey>` for all 10 maps — pre-battle objective + what's new this map (2–4 panels).
- `epilogue_<storyKey>` for maps 0–8 — outcome + propulsion to the next map (1–3 panels). **Map 9 has no epilogue;** `campaign_ending` is shown instead.
- `campaign_ending` — the finale (3–5 panels).

Briefing/epilogue keys derive by convention from each map's existing `storyKey` (`brief_${storyKey}`, `epilogue_${storyKey}`) — no new field in `maps.js`. Helper exports `briefKey(storyKey)` and `epilogueKey(storyKey)` centralize the convention.

### 4.3 `STORY_PANELS` (retained)

Unchanged structure (`{ [storyKey]: { waves: { [n]: {headline, body} }, unlock: {headline, body} } }`), consumed by the existing `StoryManager` for the **mid-wave single banner only**. The `unlock` sub-panel is **removed** — post-victory narrative now lives in `epilogue_*`/`campaign_ending` sequences (see §7 migration of call site). Mid-wave `waves` text is **rewritten** to fit the bible. Keeping mid-wave beats as a lightweight banner avoids interrupting active combat with a modal sequence.

---

## 5. Pure Logic — `src/systems/storySequence.js`

A pure, framework-free navigator over a sequence's panels.

```js
// createSequence(sequence): returns a navigator with immutable transitions.
export function createSequence(sequence) // sequence = { panels: Panel[] }
// Returns: { panels, index: 0 }
export function currentPanel(state)   // -> Panel | null  (null if panels empty)
export function advance(state)        // -> new state with index+1 (clamped to panels.length)
export function atEnd(state)          // -> boolean (index >= panels.length - 1, or empty)
export function isComplete(state)     // -> boolean (index >= panels.length)
```

Pure functions, no mutation of inputs (return new state objects). This holds all navigation logic so the overlay is a thin DOM renderer.

---

## 6. Presentation — `src/ui/StoryDialogOverlay.js`

DOM overlay mirroring `SettingsOverlay`'s lifecycle (constructor caches elements; `open`/`close` add/remove listeners tracked in a `_listeners` array; backdrop-click and Escape close).

**Constructor:** `constructor(game = null)` — caches `#story-dialog`, `#story-dialog-portrait`, `#story-dialog-name`, `#story-dialog-text`, `#story-dialog-next`, `#story-dialog-skip`.

**API:**
- `play(sequenceId, onComplete)` — looks up `STORY_SEQUENCES[sequenceId]`; if missing, calls `onComplete()` immediately and returns (defensive: never blocks gameplay on missing content). Otherwise builds a `storySequence` state, renders the first panel, shows the overlay, and wires Next/Skip.
  - **Next:** advances; if now `isComplete`, closes and calls `onComplete()`; else renders the new panel. The Next button reads "Begin" / "Continue" on the last panel.
  - **Skip:** closes immediately and calls `onComplete()`.
- `close()` — removes listeners, hides overlay. Idempotent.

**Rendering a panel:** sets speaker name + accent color from `STORY_SPEAKERS[panel.speaker]`; sets text; sets the portrait via the deferred-asset fallback (§8).

**Re-entrancy:** `play` while already open closes the current sequence first (last-wins), preventing stacked listeners.

### 6.1 DOM + CSS (`index.html`)

New block mirroring `#settings-overlay`:

```html
<div id="story-dialog" class="story-dialog-overlay" style="display:none">
  <div class="story-dialog-card">
    <div id="story-dialog-portrait" class="story-dialog-portrait"></div>
    <div class="story-dialog-body">
      <div id="story-dialog-name" class="story-dialog-name"></div>
      <div id="story-dialog-text" class="story-dialog-text"></div>
      <div class="story-dialog-actions">
        <button id="story-dialog-skip">Skip</button>
        <button id="story-dialog-next">Continue</button>
      </div>
    </div>
  </div>
</div>
```

Plus a **Story Log** trigger button on the MapSelect DOM (`#story-log-btn`) and a small **`#story-log`** list overlay (re-readable beats). CSS follows the existing overlay aesthetic (dark card, centered, backdrop dim).

---

## 7. Persistence — `src/systems/SaveManager.js`

- Bump `VERSION` to `4`.
- `freshEnvelope()` adds `seenStoryBeats: {}`.
- `_normalize(parsed)` copies `seenStoryBeats` when present (object, not array), else `{}`.
- Accept versions `1|2|3|4` in `_load()`; add `migrateV3toV4(env)` returning `{ ...env, version: 4, seenStoryBeats: env.seenStoryBeats ?? {} }`. Chain v1→v2→v3→v4 so any older save lands on v4 and is re-persisted.
- The "future version" warning branch already handles `version > VERSION` — no change beyond the new `VERSION` value.
- New methods:
  - `hasSeenBeat(id)` → `!!this._data.seenStoryBeats[id]`.
  - `markBeatSeen(id)` → sets `true`, `_save()`.
  - `getSeenBeats()` → shallow copy of keys, for the Story Log.

**Call-site migration of the removed `unlock` panel:** GameScene currently shows `StoryManager.getUnlockPanel(storyKey)` on victory. That call is replaced by the epilogue/ending sequence (§3). `getUnlockPanel` and the `unlock` data are removed in the same change (no dead code).

---

## 8. Portraits — deferred-asset fallback

Follows the project's established deferred-asset pattern (overworld art PR #37, SFX PR #38). A pure helper resolves a portrait to either a real asset reference or a generated fallback:

```js
// src/systems/portraitFallback.js
// resolvePortrait(speaker, registeredKeys) -> { kind: 'image', key } | { kind: 'fallback', initial, color }
```

- `registeredKeys` is the set of portrait asset keys actually loaded (empty in Phase 1, so everything falls back).
- Fallback renders a colored square (speaker `color`) with the speaker name's initial — the overlay builds this DOM when `kind === 'fallback'`.
- New `assets/portraits/PROMPTS.md` documents the 3 portrait assets (`portrait-command`, `portrait-rael`, `portrait-vorn`) for Phase 2; dropping the PNGs + registering keys flips `resolvePortrait` to `kind: 'image'` with zero overlay-code change.

---

## 9. Wiring

- **`MapSelectScene`**: instantiate `StoryDialogOverlay`. On `create()`, if `!save.hasSeenBeat('campaign_intro')`, `play('campaign_intro', () => save.markBeatSeen('campaign_intro'))`. Add `#story-log-btn` opening the Story Log; selecting a beat replays it (no seen-gating on replay). On overlay teardown, remove DOM listeners (scene `shutdown`).
- **`GameScene.create()`**: after scene/economy/UI are ready and before the first wave can start, if `!save.hasSeenBeat(briefKey(storyKey))`, play the briefing and `markBeatSeen` on complete. Briefing must not block wave-1 readiness in a way that traps the player — the wave start button simply waits behind the modal (combat hasn't begun).
- **`GameScene._onVictory()`** (line ~1171): before showing the victory overlay, play `epilogue_<storyKey>` (maps 0–8) or `campaign_ending` (map 9) if unseen, then `markBeatSeen` and proceed to the existing victory overlay on complete. If already seen, proceed immediately.
- **Mid-wave** (`_checkWaveComplete`): unchanged — `StoryManager.showBanner` with rewritten `STORY_PANELS` text.

Each scene owns its overlay instance and tears down listeners on `shutdown` (Phaser 3.60+ requires explicit `this.events.on('shutdown', ...)`, per existing project convention).

---

## 10. Testing

| Unit | Tests (Vitest + jsdom) |
|------|------------------------|
| `storySequence.js` | empty panels → `currentPanel` null, `atEnd` true; single panel → `atEnd` true at index 0; multi-panel advance/clamp; `isComplete` after final advance; inputs not mutated. |
| `SaveManager` | v3→v4 migration preserves maps/upgrades/stats/settings/hero and adds `seenStoryBeats`; v1/v2 chain through to v4; future-version warning unchanged; `hasSeenBeat`/`markBeatSeen`/`getSeenBeats` round-trip + persistence. |
| `story.js` integrity | every map `storyKey` has `brief_*`; maps 0–8 have `epilogue_*`; `campaign_intro` + `campaign_ending` exist; every panel's `speaker` is a key of `STORY_SPEAKERS`; `briefKey`/`epilogueKey` helpers match keys present. |
| `portraitFallback.js` | unregistered → `kind:'fallback'` with correct initial + color; registered → `kind:'image'` with key. |
| `StoryDialogOverlay` | `play` renders first panel; Next advances + relabels on last panel; Next on last panel closes + fires `onComplete`; Skip closes + fires `onComplete`; missing sequenceId fires `onComplete` immediately; re-entrant `play` doesn't stack listeners. |

All entity/scene imports that transitively pull Phaser must `vi.mock` it (jsdom canvas crash otherwise), per project convention.

**Browser verification (Definition of Done):** opener shows on first MapSelect load and not on the second; briefing shows entering an unseen map and auto-skips on replay; Skip works mid-sequence; epilogue shows on victory; `campaign_ending` shows after map 9; Story Log replays a seen beat; portrait fallback renders speaker initial + accent color.

---

## 11. Edge Cases

- **Missing sequence id** → overlay fires `onComplete` immediately; gameplay never blocks on absent content.
- **Empty panels array** → `currentPanel` null; overlay treats as complete and fires `onComplete`.
- **Re-entrant `play`** (e.g., rapid navigation) → last-wins; prior listeners removed first.
- **Old save (v1/v2/v3)** → migrates to v4 with empty `seenStoryBeats`; all beats treated as unseen (player sees the full story once).
- **Future save (v5+)** → existing warn-and-load-as-is branch; `seenStoryBeats` read defensively (`?? {}`).
- **Replaying a never-seen beat from Story Log** → only seen beats are listed, so this can't happen; Story Log reads `getSeenBeats()`.
- **Map 9** → no `epilogue_last_light`; integrity test asserts maps 0–8 only, and victory wiring routes map 9 to `campaign_ending`.
- **Skipping the opener** → still marked seen (Skip fires `onComplete`); opener won't re-show. Re-readable via Story Log.

---

## 12. Out of Scope (Phase 2 — new backlog item)

Real portrait artwork (3 PNGs per `assets/portraits/PROMPTS.md`); animated/cinematic opener and ending; per-speaker audio/voice. All drop in over this engine with no logic change.
