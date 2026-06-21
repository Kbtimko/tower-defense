# Campaign Storyline + Per-Level Mini-Stories — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a cohesive, fully-written *Last Light* campaign — opener, per-map briefing/epilogue, boss beats, and ending — surfaced through a new multi-panel story dialog with once-then-replayable persistence.

**Architecture:** Pure data (`story.js`) + pure navigator (`storySequence.js`) + pure portrait resolver (`portraitFallback.js`) + a DOM overlay (`StoryDialogOverlay.js`) mirroring `SettingsOverlay`, with SaveManager v3→v4 `seenStoryBeats` persistence, wired into `MapSelectScene` (opener + Story Log) and `GameScene` (briefing + epilogue/ending). The existing `StoryManager`/`#story-banner` is retained for lightweight mid-wave beats.

**Tech Stack:** Vanilla ES modules, Phaser 3, Vitest 2 + jsdom. No TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-21-campaign-storyline-design.md`

---

## File Structure

| File | Responsibility | Status |
|------|----------------|--------|
| `src/systems/SaveManager.js` | add `seenStoryBeats` + v3→v4 migration + beat methods | modify |
| `src/systems/SaveManager.test.js` | migration + beat tests | modify |
| `src/systems/storySequence.js` | pure sequence navigator | create |
| `src/systems/storySequence.test.js` | navigator tests | create |
| `src/systems/portraitFallback.js` | pure portrait resolver + `REGISTERED_PORTRAITS` set | create |
| `src/systems/portraitFallback.test.js` | resolver tests | create |
| `src/data/story.js` | `STORY_SPEAKERS`, `STORY_SEQUENCES`, key helpers, `STORY_LOG_LABELS`, rewritten `STORY_PANELS` (no `unlock`) | modify |
| `src/data/story.test.js` | content-integrity tests | create |
| `src/systems/StoryManager.js` | remove `getUnlockPanel` | modify |
| `src/systems/StoryManager.test.js` | drop unlock test | modify |
| `src/ui/StoryDialogOverlay.js` | DOM multi-panel dialog | create |
| `src/ui/StoryDialogOverlay.test.js` | overlay behavior tests | create |
| `index.html` | `#story-dialog` + `#story-log` markup + CSS + `#open-story-log` button | modify |
| `src/scenes/MapSelectScene.js` | opener + Story Log wiring | modify |
| `src/scenes/GameScene.js` | briefing + epilogue/ending wiring; drop `getUnlockPanel` call | modify |
| `assets/portraits/PROMPTS.md` | Phase 2 portrait asset prompts | create |

Tasks are ordered so the suite stays green after every task. Tasks 1–3 are independent pure modules. Task 4 (data) leaves `getUnlockPanel` returning `null` harmlessly (safe intermediate). Task 8 removes the now-dead `getUnlockPanel` together with its only call site.

---

## Task 1: SaveManager v3→v4 + `seenStoryBeats`

**Files:**
- Modify: `src/systems/SaveManager.js`
- Test: `src/systems/SaveManager.test.js`

- [ ] **Step 1: Write failing tests**

Add to `src/systems/SaveManager.test.js` (append inside the top-level `describe`, or as a new `describe`):

```js
describe('seenStoryBeats (v4)', () => {
  beforeEach(() => localStorage.clear());

  it('fresh save starts with empty seenStoryBeats and version 4', () => {
    const sm = new SaveManager();
    expect(sm.hasSeenBeat('campaign_intro')).toBe(false);
    expect(sm.getSeenBeats()).toEqual({});
    const raw = JSON.parse(localStorage.getItem('lastlight_save'));
    expect(raw.version).toBe(4);
  });

  it('markBeatSeen persists and round-trips through a reload', () => {
    const sm = new SaveManager();
    sm.markBeatSeen('brief_outpost_sigma');
    expect(sm.hasSeenBeat('brief_outpost_sigma')).toBe(true);
    const sm2 = new SaveManager();
    expect(sm2.hasSeenBeat('brief_outpost_sigma')).toBe(true);
    expect(sm2.getSeenBeats()).toEqual({ brief_outpost_sigma: true });
  });

  it('migrates a v3 save to v4 preserving all fields and adding seenStoryBeats', () => {
    const v3 = {
      version: 3,
      maps: [3, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      upgrades: ['rael_hp'],
      stats: { kills: 42, gamesPlayed: 5, victories: 3, defeats: 2, bestWave: 9 },
      settings: { masterVol: 0.5, sfxVol: 0.5, musicVol: 0.5, muted: true, ambientMotion: false },
      selectedHeroId: 'dax',
    };
    localStorage.setItem('lastlight_save', JSON.stringify(v3));
    const sm = new SaveManager();
    expect(sm.getStars(0)).toBe(3);
    expect(sm.getStars(1)).toBe(1);
    expect(sm.getPurchasedUpgrades()).toEqual(['rael_hp']);
    expect(sm.getStats().kills).toBe(42);
    expect(sm.getSettings().muted).toBe(true);
    expect(sm.getSelectedHero()).toBe('dax');
    expect(sm.getSeenBeats()).toEqual({});
    const raw = JSON.parse(localStorage.getItem('lastlight_save'));
    expect(raw.version).toBe(4);
  });

  it('migrates a v1 save all the way to v4', () => {
    const v1 = {
      version: 1,
      maps: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      upgrades: ['cmd_veteran'],
      stats: { kills: 1, gamesPlayed: 1, victories: 1, defeats: 0, bestWave: 1 },
      settings: { masterVol: 0.8, sfxVol: 1, musicVol: 0.6, muted: false, ambientMotion: null },
    };
    localStorage.setItem('lastlight_save', JSON.stringify(v1));
    const sm = new SaveManager();
    expect(sm.getPurchasedUpgrades()).toEqual(['rael_veteran']); // cmd_*→rael_* still applied
    expect(sm.getSeenBeats()).toEqual({});
    expect(JSON.parse(localStorage.getItem('lastlight_save')).version).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/systems/SaveManager.test.js`
Expected: FAIL — `hasSeenBeat is not a function` / version is 3.

- [ ] **Step 3: Implement migration + methods**

In `src/systems/SaveManager.js`:

Change the version constant:
```js
const VERSION     = 4;
```

Add `seenStoryBeats` to `freshEnvelope()`:
```js
function freshEnvelope() {
  return {
    version:        VERSION,
    maps:           new Array(MAP_COUNT).fill(0),
    upgrades:       [],
    stats:          { kills: 0, gamesPlayed: 0, victories: 0, defeats: 0, bestWave: 0 },
    settings:       defaultSettings(),
    selectedHeroId: 'rael',
    seenStoryBeats: {},
  };
}
```

Add the v3→v4 migration after `migrateV2toV3`:
```js
function migrateV3toV4(env) {
  return {
    ...env,
    version:        4,
    seenStoryBeats: env.seenStoryBeats ?? {},
  };
}
```

In `_load()`, accept version 4 and chain the new migration. Replace the version guard and the migration block:
```js
        if (parsed && Array.isArray(parsed.maps) && parsed.maps.length === MAP_COUNT
            && (parsed.version === 1 || parsed.version === 2 || parsed.version === 3 || parsed.version === 4)) {
          let normalized = this._normalize(parsed);
          if (parsed.version === 1) {
            normalized = migrateV3toV4(migrateV2toV3({ ...normalized, version: 2 }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          } else if (parsed.version === 2) {
            normalized = migrateV3toV4(migrateV2toV3(normalized));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          } else if (parsed.version === 3) {
            normalized = migrateV3toV4(normalized);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          }
          return normalized;
        }
```

In `_normalize(parsed)`, carry `seenStoryBeats` (add before `return env;`):
```js
    if (parsed.seenStoryBeats && typeof parsed.seenStoryBeats === 'object'
        && !Array.isArray(parsed.seenStoryBeats)) {
      env.seenStoryBeats = { ...parsed.seenStoryBeats };
    }
```

Add the public methods (after `isHeroUnlocked`, before the closing brace):
```js
  // ─── Story beats ───
  hasSeenBeat(id) {
    return !!this._data.seenStoryBeats[id];
  }

  markBeatSeen(id) {
    if (this._data.seenStoryBeats[id]) return;
    this._data.seenStoryBeats[id] = true;
    this._save();
  }

  getSeenBeats() {
    return { ...this._data.seenStoryBeats };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/systems/SaveManager.test.js`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/systems/SaveManager.js src/systems/SaveManager.test.js
git commit -m "feat(save): seenStoryBeats persistence + v3→v4 migration"
```

---

## Task 2: `storySequence.js` pure navigator

**Files:**
- Create: `src/systems/storySequence.js`
- Test: `src/systems/storySequence.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/systems/storySequence.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { createSequence, currentPanel, advance, atEnd, isComplete } from './storySequence.js';

const seq = { panels: [{ speaker: 'rael', text: 'a' }, { speaker: 'command', text: 'b' }] };

describe('storySequence', () => {
  it('starts at index 0 on the first panel', () => {
    const s = createSequence(seq);
    expect(s.index).toBe(0);
    expect(currentPanel(s)).toEqual({ speaker: 'rael', text: 'a' });
  });

  it('atEnd is false on a non-last panel, true on the last', () => {
    const s = createSequence(seq);
    expect(atEnd(s)).toBe(false);
    expect(atEnd(advance(s))).toBe(true);
  });

  it('advance moves forward and is complete past the final panel', () => {
    let s = createSequence(seq);
    s = advance(s);                 // index 1 (last)
    expect(isComplete(s)).toBe(false);
    s = advance(s);                 // index 2 (past end)
    expect(isComplete(s)).toBe(true);
    expect(currentPanel(s)).toBe(null);
  });

  it('advance does not mutate the input state', () => {
    const s = createSequence(seq);
    advance(s);
    expect(s.index).toBe(0);
  });

  it('empty panels: currentPanel null, atEnd true, isComplete true', () => {
    const s = createSequence({ panels: [] });
    expect(currentPanel(s)).toBe(null);
    expect(atEnd(s)).toBe(true);
    expect(isComplete(s)).toBe(true);
  });

  it('single panel: atEnd true at index 0', () => {
    const s = createSequence({ panels: [{ speaker: 'rael', text: 'x' }] });
    expect(atEnd(s)).toBe(true);
    expect(isComplete(s)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/systems/storySequence.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/systems/storySequence.js`:
```js
// Pure navigator over a story sequence's panels. No DOM, no Phaser.
// A sequence is { panels: Array<{ speaker, text }> }.
// State is { panels, index }; all transitions return new state objects.

export function createSequence(sequence) {
  return { panels: sequence?.panels ?? [], index: 0 };
}

export function currentPanel(state) {
  return state.panels[state.index] ?? null;
}

export function advance(state) {
  return { panels: state.panels, index: Math.min(state.index + 1, state.panels.length) };
}

export function atEnd(state) {
  return state.index >= state.panels.length - 1;
}

export function isComplete(state) {
  return state.index >= state.panels.length;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/systems/storySequence.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/storySequence.js src/systems/storySequence.test.js
git commit -m "feat(story): pure storySequence navigator"
```

---

## Task 3: `portraitFallback.js` pure resolver

**Files:**
- Create: `src/systems/portraitFallback.js`
- Test: `src/systems/portraitFallback.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/systems/portraitFallback.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { resolvePortrait } from './portraitFallback.js';

const command = { name: 'Sol Command', color: 0x4aa3ff, portraitKey: 'portrait-command' };

describe('resolvePortrait', () => {
  it('falls back when the portrait key is not registered', () => {
    const r = resolvePortrait(command, new Set());
    expect(r).toEqual({ kind: 'fallback', initial: 'S', color: 0x4aa3ff });
  });

  it('resolves to an image when the key is registered', () => {
    const r = resolvePortrait(command, new Set(['portrait-command']));
    expect(r).toEqual({ kind: 'image', key: 'portrait-command' });
  });

  it('uses the first character of the name, uppercased', () => {
    const r = resolvePortrait({ name: 'the Vorn', color: 1, portraitKey: 'x' }, new Set());
    expect(r.initial).toBe('T');
  });

  it('falls back with "?" when speaker is missing', () => {
    const r = resolvePortrait(undefined, new Set());
    expect(r).toEqual({ kind: 'fallback', initial: '?', color: 0x444444 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/systems/portraitFallback.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/systems/portraitFallback.js`:
```js
// Resolves a story speaker to a portrait. Until real art is registered
// (Phase 2), every speaker resolves to a generated fallback (colored block
// + name initial). Mirrors the deferred-asset pattern from overworld art / SFX.

// Phase 2 populates this set with the portrait keys actually loaded by BootScene.
export const REGISTERED_PORTRAITS = new Set();

export function resolvePortrait(speaker, registeredKeys = REGISTERED_PORTRAITS) {
  if (!speaker) return { kind: 'fallback', initial: '?', color: 0x444444 };
  if (registeredKeys.has(speaker.portraitKey)) {
    return { kind: 'image', key: speaker.portraitKey };
  }
  return {
    kind: 'fallback',
    initial: (speaker.name?.[0] ?? '?').toUpperCase(),
    color: speaker.color ?? 0x444444,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/systems/portraitFallback.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/portraitFallback.js src/systems/portraitFallback.test.js
git commit -m "feat(story): portrait resolver with deferred-asset fallback"
```

---

## Task 4: `story.js` data — speakers, sequences, helpers, rewritten panels

**Files:**
- Modify: `src/data/story.js`
- Test: `src/data/story.test.js`

This task authors all narrative content and the helper API. It removes the `unlock` sub-panels from `STORY_PANELS` (post-victory narrative moves to `epilogue_*`/`campaign_ending` sequences). `StoryManager.getUnlockPanel` then returns `null` until removed in Task 8 — a safe intermediate (GameScene simply shows the victory overlay with no banner).

- [ ] **Step 1: Write failing integrity tests**

Create `src/data/story.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  STORY_SPEAKERS, STORY_SEQUENCES, STORY_PANELS,
  briefKey, epilogueKey, victorySequenceId, storyLogEntries, STORY_LOG_LABELS,
} from './story.js';
import { MAPS } from './maps.js';

describe('story content integrity', () => {
  it('every speaker has name, color, portraitKey', () => {
    for (const s of Object.values(STORY_SPEAKERS)) {
      expect(typeof s.name).toBe('string');
      expect(typeof s.color).toBe('number');
      expect(typeof s.portraitKey).toBe('string');
    }
  });

  it('campaign_intro and campaign_ending exist with panels', () => {
    expect(STORY_SEQUENCES.campaign_intro.panels.length).toBeGreaterThan(0);
    expect(STORY_SEQUENCES.campaign_ending.panels.length).toBeGreaterThan(0);
  });

  it('every map has a briefing sequence', () => {
    for (const m of MAPS) {
      expect(STORY_SEQUENCES[briefKey(m.storyKey)], `missing brief for ${m.storyKey}`)
        .toBeDefined();
    }
  });

  it('maps 0-8 have an epilogue; map 9 (final) does not', () => {
    MAPS.forEach((m, i) => {
      const hasEpilogue = !!STORY_SEQUENCES[epilogueKey(m.storyKey)];
      if (i < MAPS.length - 1) expect(hasEpilogue, `missing epilogue for ${m.storyKey}`).toBe(true);
      else expect(hasEpilogue).toBe(false);
    });
  });

  it('every panel references a known speaker', () => {
    for (const seq of Object.values(STORY_SEQUENCES)) {
      for (const p of seq.panels) {
        expect(STORY_SPEAKERS[p.speaker], `unknown speaker ${p.speaker}`).toBeDefined();
        expect(typeof p.text).toBe('string');
        expect(p.text.length).toBeGreaterThan(0);
      }
    }
  });

  it('victorySequenceId routes final map to the ending, others to epilogue', () => {
    expect(victorySequenceId('outpost_sigma', false)).toBe('epilogue_outpost_sigma');
    expect(victorySequenceId('last_light', true)).toBe('campaign_ending');
  });

  it('STORY_PANELS no longer carries unlock sub-panels', () => {
    for (const entry of Object.values(STORY_PANELS)) {
      expect(entry.unlock).toBeUndefined();
      expect(entry.waves).toBeDefined();
    }
  });

  it('storyLogEntries returns only seen sequence beats, labeled, in order', () => {
    const seen = { campaign_intro: true, brief_outpost_sigma: true, brief_lunar_gate: true };
    const entries = storyLogEntries(seen);
    expect(entries[0]).toEqual({ id: 'campaign_intro', label: STORY_LOG_LABELS.campaign_intro });
    expect(entries.map(e => e.id)).toEqual(['campaign_intro', 'brief_outpost_sigma', 'brief_lunar_gate']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/data/story.test.js`
Expected: FAIL — named exports missing.

- [ ] **Step 3: Rewrite `src/data/story.js`**

Replace the entire file with:
```js
export const STORY_SPEAKERS = {
  command: { name: 'Sol Command',    color: 0x4aa3ff, portraitKey: 'portrait-command' },
  rael:    { name: 'Commander Rael', color: 0xffd24a, portraitKey: 'portrait-rael'    },
  vorn:    { name: 'The Vorn',       color: 0x9b4dff, portraitKey: 'portrait-vorn'    },
};

// Convention: briefing/epilogue sequence ids derive from a map's storyKey.
export function briefKey(storyKey)    { return `brief_${storyKey}`; }
export function epilogueKey(storyKey) { return `epilogue_${storyKey}`; }

// Which full-screen sequence plays on victory: the finale on the last map, else the epilogue.
export function victorySequenceId(storyKey, isFinalMap) {
  return isFinalMap ? 'campaign_ending' : epilogueKey(storyKey);
}

export const STORY_SEQUENCES = {
  campaign_intro: { panels: [
    { speaker: 'command', text: 'Forty years of silence beyond the orbit of Mars — and then they came. The Vorn fleet burned through the home fleet in a single night.' },
    { speaker: 'command', text: 'Earth still stands. Barely. Every defense line that holds buys the evacuation convoys another hour.' },
    { speaker: 'rael',    text: "This is Commander Rael, Sol Vanguard. I've held worse with less. Give me towers and a field of fire, and I'll give you that hour." },
    { speaker: 'command', text: 'Outpost Sigma is the last station between the Vorn and the inner colonies, Commander. Hold it.' },
  ] },

  brief_outpost_sigma: { panels: [
    { speaker: 'command', text: "Outpost Sigma — humanity's last forward base. Vorn drones inbound in waves." },
    { speaker: 'rael',    text: "Standard swarm. Build your line, layer your fire, don't let a single one reach the core." },
  ] },
  epilogue_outpost_sigma: { panels: [
    { speaker: 'rael',    text: 'Sigma holds. The drones broke on our towers like surf on rock.' },
    { speaker: 'command', text: 'Confirmed. Command authorizes advance to the Lunar Gate. Push them off the Moon, Commander.' },
  ] },

  brief_lunar_gate: { panels: [
    { speaker: 'command', text: 'The Lunar Gate controls every approach to Earth. The Vorn took it in the first hour. Take it back.' },
    { speaker: 'rael',    text: 'They learn fast. Expect them harder and quicker than Sigma. We come harder still.' },
  ] },
  epilogue_lunar_gate: { panels: [
    { speaker: 'rael',    text: "Gate's ours. The road to the outer system is open." },
    { speaker: 'command', text: "Good. The enemy is regrouping near the old mining crater. Don't give them time." },
  ] },

  brief_the_crater: { panels: [
    { speaker: 'command', text: 'The Crater rim is cover for us — and a maze the Vorn have already mapped. Watch your chokepoints.' },
    { speaker: 'rael',    text: "Let them think they know the ground. We'll teach them otherwise." },
  ] },
  epilogue_the_crater: { panels: [
    { speaker: 'rael',    text: "Crater secured. We're pushing them back faster than they can dig in." },
    { speaker: 'command', text: "Intel shows a heavy presence at the Orbital Station — they've taken our own guns. Prepare to launch." },
  ] },

  brief_orbital_station: { panels: [
    { speaker: 'command', text: "The Vorn hold Orbital Station, and they're calling in fliers. Expect airborne drones this assault." },
    { speaker: 'rael',    text: 'Anything that flies still falls. Keep your firing arcs wide.' },
  ] },
  epilogue_orbital_station: { panels: [
    { speaker: 'rael',    text: "Station's back under human guns. They're retreating toward the belt." },
    { speaker: 'command', text: 'Then we follow. The Asteroid Belt is the edge of Sol — and the edge of what we know.' },
  ] },

  brief_asteroid_belt: { panels: [
    { speaker: 'command', text: "The mining platforms give you high ground. The Vorn are massing beyond the belt in numbers we can't count." },
    { speaker: 'rael',    text: "High ground and a clear shot. That's all I've ever needed." },
  ] },
  epilogue_asteroid_belt: { panels: [
    { speaker: 'rael',    text: "Belt's clear. We've pushed them out of Sol entirely." },
    { speaker: 'command', text: 'Commander… long-range scans just picked up something moving in Vorn space. Something enormous.' },
    { speaker: 'vorn',    text: 'You come to us now. Good.' },
  ] },

  brief_titans_reach: { panels: [
    { speaker: 'command', text: "You've crossed into Vorn-held space, Commander. We can't protect you out here." },
    { speaker: 'rael',    text: "We're not here to be protected. We're here to finish it." },
    { speaker: 'command', text: 'Surface scanners read an organism the size of a frigate. Designation: TITAN. Armor like a hull — pierce is the only thing that bites.' },
    { speaker: 'vorn',    text: 'We grow our walls from the bones of the worlds we eat. Yours will do nicely.' },
  ] },
  epilogue_titans_reach: { panels: [
    { speaker: 'rael',    text: "First Titan's down. Big. Slow. Dead." },
    { speaker: 'command', text: "More where that came from — but for the first time, we're the ones advancing. Press deeper." },
  ] },

  brief_deep_space_corridor: { panels: [
    { speaker: 'command', text: "Every comm relay ahead is dark. Past this point you're on your own, Vanguard." },
    { speaker: 'rael',    text: "On our own is how we started. Nothing's changed but the scenery." },
  ] },
  epilogue_deep_space_corridor: { panels: [
    { speaker: 'rael',    text: "Corridor's clear. No support, no losses we couldn't take." },
    { speaker: 'command', text: 'Ahead is the Void Frontier — the deep dark outside their homeworld. Whatever waits there has waited a long time.' },
  ] },

  brief_the_void_frontier: { panels: [
    { speaker: 'command', text: 'Multiple Titan-class contacts. This close to home, they travel in packs.' },
    { speaker: 'rael',    text: 'Then we kill them in packs. Layer the pierce. Hold the line.' },
  ] },
  epilogue_the_void_frontier: { panels: [
    { speaker: 'rael',    text: "Frontier's broken. We have a clear lane to their world." },
    { speaker: 'command', text: "We've got the homeworld coordinates, Commander. We're going to end this where it began." },
  ] },

  brief_enemy_homeworld: { panels: [
    { speaker: 'command', text: "This is it — the Vorn homeworld. Their defenses are unlike anything we've faced. Hold the perimeter and push in." },
    { speaker: 'vorn',    text: 'You stand on the shell of a living world. It does not want you here.' },
    { speaker: 'rael',    text: "Noted. We're not staying — we're just here to turn the lights off." },
  ] },
  epilogue_enemy_homeworld: { panels: [
    { speaker: 'rael',    text: 'Their outer defenses are shattered. One stronghold left.' },
    { speaker: 'command', text: 'Their last redoubt, Commander — the Last Light, the core of the hive-mind itself. Finish this.' },
  ] },

  brief_last_light: { panels: [
    { speaker: 'command', text: "Everything they have left is here, between you and the hive-core. Six waves of their absolute best." },
    { speaker: 'vorn',    text: 'If we fall, the silence will be very long, little commander. For both of us.' },
    { speaker: 'rael',    text: 'This is Rael, Sol Vanguard. If we hold here, Earth lives. So we hold. We do not fall.' },
  ] },

  campaign_ending: { panels: [
    { speaker: 'rael',    text: "The core's dark. The voices… they've stopped. It's over." },
    { speaker: 'command', text: 'Confirmed across every channel. The Vorn hive-mind is gone. The war is won, Commander.' },
    { speaker: 'command', text: 'Earth is sending word to every colony, every convoy, every soul who hid in the dark waiting for it to end. You held the line — all of it.' },
    { speaker: 'rael',    text: "We all did. This is the Last Light — and it's still burning. Rael out." },
  ] },
};

// Friendly labels for the replay Story Log, ordered as the campaign plays.
export const STORY_LOG_LABELS = {
  campaign_intro:            'Prologue',
  brief_outpost_sigma:       'Outpost Sigma — Briefing',
  epilogue_outpost_sigma:    'Outpost Sigma — Epilogue',
  brief_lunar_gate:          'Lunar Gate — Briefing',
  epilogue_lunar_gate:       'Lunar Gate — Epilogue',
  brief_the_crater:          'The Crater — Briefing',
  epilogue_the_crater:       'The Crater — Epilogue',
  brief_orbital_station:     'Orbital Station — Briefing',
  epilogue_orbital_station:  'Orbital Station — Epilogue',
  brief_asteroid_belt:       'Asteroid Belt — Briefing',
  epilogue_asteroid_belt:    'Asteroid Belt — Epilogue',
  brief_titans_reach:        "Titan's Reach — Briefing",
  epilogue_titans_reach:     "Titan's Reach — Epilogue",
  brief_deep_space_corridor: 'Deep Space Corridor — Briefing',
  epilogue_deep_space_corridor: 'Deep Space Corridor — Epilogue',
  brief_the_void_frontier:   'The Void Frontier — Briefing',
  epilogue_the_void_frontier: 'The Void Frontier — Epilogue',
  brief_enemy_homeworld:     'Enemy Homeworld — Briefing',
  epilogue_enemy_homeworld:  'Enemy Homeworld — Epilogue',
  brief_last_light:          'Last Light — Briefing',
  campaign_ending:           'Finale',
};

// Returns the seen sequence beats as ordered {id,label} entries for the Story Log.
export function storyLogEntries(seenBeats) {
  return Object.keys(STORY_LOG_LABELS)
    .filter(id => seenBeats[id])
    .map(id => ({ id, label: STORY_LOG_LABELS[id] }));
}

// Mid-wave single-banner beats (consumed by StoryManager). No `unlock` sub-panel —
// post-victory narrative now lives in epilogue_*/campaign_ending sequences.
export const STORY_PANELS = {
  outpost_sigma: { waves: {
    3: { headline: 'Intel — Wave 3', body: 'Three more drone waves inbound. Reinforce the line before they regroup.' },
    7: { headline: "Rael's Log — Wave 7", body: 'Seven waves held. Whatever the Vorn send next will be bigger. Stay sharp.' },
  } },
  lunar_gate: { waves: {
    3: { headline: 'Intel — Wave 3', body: 'The Vorn are adapting to our positions. Expect faster assault patterns.' },
    7: { headline: 'Transmission — Wave 7', body: 'Hold three more waves and the gate is ours for good.' },
  } },
  the_crater: { waves: {
    4: { headline: 'Intel — Wave 4', body: 'They have our chokepoints mapped. Expect a new approach vector.' },
    8: { headline: "Rael's Log — Wave 8", body: 'The towers have held against everything. Trust the line.' },
  } },
  orbital_station: { waves: {
    4: { headline: 'Intercept — Wave 4', body: 'Vorn calling in aerial support. Flying drones next assault.' },
    8: { headline: 'Status — Wave 8', body: 'Station systems at 60%. Eight waves repelled. They are throwing everything at us.' },
  } },
  asteroid_belt: { waves: {
    4: { headline: 'Mining Log — Wave 4', body: 'Multiple attack vectors active across the platforms.' },
    9: { headline: 'Field Report — Wave 9', body: 'They are clustering heavier units. Prioritize armor-piercing fire.' },
  } },
  titans_reach: { waves: {
    5: { headline: 'Warning — Wave 5', body: 'TITAN-class organism on approach. Pierce is the only thing that bites.' },
    10: { headline: 'Broadcast — Wave 10', body: 'First Titan neutralized. There are more. Armor-piercing towers are keeping us alive.' },
  } },
  deep_space_corridor: { waves: {
    5: { headline: 'Nav Alert — Wave 5', body: 'No comm relays, no support. Every resource matters.' },
    10: { headline: 'Tactical — Wave 10', body: 'The corridor narrows ahead — the enemy will have nowhere to flank.' },
  } },
  the_void_frontier: { waves: {
    5: { headline: 'Sensors — Wave 5', body: 'Titan-class contacts emerging from the void. They run in packs out here.' },
    10: { headline: 'Warning — Wave 10', body: 'Network still holding. Five more waves. Let nothing through.' },
  } },
  enemy_homeworld: { waves: {
    5: { headline: 'Breach — Wave 5', body: 'Inside enemy territory. Their home defenses are unlike anything we have seen.' },
    11: { headline: 'Last Stand — Wave 11', body: 'Their numbers are not infinite. Keep pushing.' },
  } },
  last_light: { waves: {
    6: { headline: 'Final Transmission — Wave 6', body: 'Six waves of their absolute best. This is what we trained for.' },
    12: { headline: "Rael's Last Log — Wave 12", body: 'Six waves left. If we fall here, no one is left to defend Earth. We do not fall.' },
  } },
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/data/story.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite to confirm no regression**

Run: `npx vitest run`
Expected: PASS. `StoryManager.test.js` stays green — it uses its own inline fixture (with its own `unlock` field) and `getUnlockPanel` still exists (removed in Task 8), so it is unaffected by removing `unlock` from the real `STORY_PANELS` here. The only behavior change in the app is that `GameScene`'s `getUnlockPanel(map.storyKey)` now returns `null`, so victory shows the overlay directly — a safe intermediate.

- [ ] **Step 6: Commit**

```bash
git add src/data/story.js src/data/story.test.js
git commit -m "feat(story): full campaign content — speakers, sequences, helpers, rewritten mid-wave panels"
```

---

## Task 5: `StoryDialogOverlay` + DOM markup

**Files:**
- Create: `src/ui/StoryDialogOverlay.js`
- Test: `src/ui/StoryDialogOverlay.test.js`
- Modify: `index.html` (markup + CSS)

- [ ] **Step 1: Write failing tests**

Create `src/ui/StoryDialogOverlay.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoryDialogOverlay } from './StoryDialogOverlay.js';

// Mirrors src/ui/SettingsOverlay.test.js: append real elements with ids to the
// document body and use jsdom's real getElementById (no monkeypatching).
function setupDom() {
  while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
  const overlay = document.createElement('div');
  overlay.id = 'story-dialog';
  overlay.style.display = 'none';
  for (const [tag, id] of [
    ['div', 'story-dialog-portrait'], ['div', 'story-dialog-name'],
    ['div', 'story-dialog-text'], ['button', 'story-dialog-next'], ['button', 'story-dialog-skip'],
  ]) {
    const el = document.createElement(tag);
    el.id = id;
    overlay.appendChild(el);
  }
  document.body.appendChild(overlay);
}

describe('StoryDialogOverlay', () => {
  beforeEach(setupDom);

  it('renders the first panel and shows the overlay on play', () => {
    const ov = new StoryDialogOverlay();
    ov.play('campaign_intro', () => {});
    expect(document.getElementById('story-dialog').style.display).toBe('flex');
    expect(document.getElementById('story-dialog-name').textContent.length).toBeGreaterThan(0);
    expect(document.getElementById('story-dialog-text').textContent.length).toBeGreaterThan(0);
  });

  it('advances through panels and fires onComplete after the last', () => {
    const done = vi.fn();
    const ov = new StoryDialogOverlay();
    ov.play('epilogue_outpost_sigma', done); // 2 panels
    const next = document.getElementById('story-dialog-next');
    next.click();           // -> panel 2 (last)
    expect(done).not.toHaveBeenCalled();
    next.click();           // -> complete
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.getElementById('story-dialog').style.display).toBe('none');
  });

  it('Skip closes and fires onComplete immediately', () => {
    const done = vi.fn();
    const ov = new StoryDialogOverlay();
    ov.play('campaign_intro', done);
    document.getElementById('story-dialog-skip').click();
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.getElementById('story-dialog').style.display).toBe('none');
  });

  it('missing sequence id fires onComplete immediately without showing', () => {
    const done = vi.fn();
    const ov = new StoryDialogOverlay();
    ov.play('does_not_exist', done);
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.getElementById('story-dialog').style.display).toBe('none');
  });

  it('re-entrant play does not stack Next listeners', () => {
    const ov = new StoryDialogOverlay();
    ov.play('campaign_intro', () => {});
    ov.play('epilogue_outpost_sigma', () => {}); // 2 panels, replaces
    const next = document.getElementById('story-dialog-next');
    next.click(); // advance to last of the SECOND sequence only
    // name should reflect second sequence's 2nd panel speaker (Sol Command)
    expect(document.getElementById('story-dialog-name').textContent).toContain('Command');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/ui/StoryDialogOverlay.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the overlay**

Create `src/ui/StoryDialogOverlay.js`:
```js
import { STORY_SEQUENCES, STORY_SPEAKERS } from '../data/story.js';
import { createSequence, currentPanel, advance, isComplete } from '../systems/storySequence.js';
import { resolvePortrait } from '../systems/portraitFallback.js';

function hexColor(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

export class StoryDialogOverlay {
  constructor() {
    this._overlay  = document.getElementById('story-dialog');
    this._portrait = document.getElementById('story-dialog-portrait');
    this._name     = document.getElementById('story-dialog-name');
    this._text     = document.getElementById('story-dialog-text');
    this._next     = document.getElementById('story-dialog-next');
    this._skip     = document.getElementById('story-dialog-skip');
    this._state    = null;
    this._onComplete = null;
    this._onNext   = () => this._advance();
    this._onSkip   = () => this._finish();
  }

  play(sequenceId, onComplete) {
    if (this._overlay.style.display === 'flex') this.close(); // last-wins, drop old listeners
    const seq = STORY_SEQUENCES[sequenceId];
    this._onComplete = onComplete || (() => {});
    if (!seq || seq.panels.length === 0) { this._onComplete(); this._onComplete = null; return; }
    this._state = createSequence(seq);
    this._next.addEventListener('click', this._onNext);
    this._skip.addEventListener('click', this._onSkip);
    this._overlay.style.display = 'flex';
    this._render();
  }

  _advance() {
    this._state = advance(this._state);
    if (isComplete(this._state)) { this._finish(); return; }
    this._render();
  }

  _finish() {
    const cb = this._onComplete;
    this.close();
    if (cb) cb();
  }

  _render() {
    const panel = currentPanel(this._state);
    if (!panel) return;
    const speaker = STORY_SPEAKERS[panel.speaker];
    this._name.textContent = speaker?.name ?? '';
    this._name.style.color = speaker ? hexColor(speaker.color) : '#fff';
    this._text.textContent = panel.text;
    this._renderPortrait(speaker);
    // Last panel: relabel Next to a closing verb.
    this._next.textContent = (this._state.index >= this._state.panels.length - 1) ? 'Continue ▸' : 'Next ▸';
  }

  _renderPortrait(speaker) {
    const p = resolvePortrait(speaker);
    this._portrait.replaceChildren();
    if (p.kind === 'image') {
      const img = document.createElement('img');
      img.src = `assets/portraits/${p.key}.png`;
      img.alt = speaker?.name ?? '';
      this._portrait.appendChild(img);
      this._portrait.style.background = 'transparent';
    } else {
      this._portrait.textContent = p.initial;
      this._portrait.style.background = hexColor(p.color);
    }
  }

  close() {
    this._next.removeEventListener('click', this._onNext);
    this._skip.removeEventListener('click', this._onSkip);
    this._overlay.style.display = 'none';
    this._state = null;
    this._onComplete = null;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/ui/StoryDialogOverlay.test.js`
Expected: PASS.

- [ ] **Step 5: Add DOM markup + CSS to `index.html`**

Add CSS in the `<style>` block (near the `.story-banner` rules, around line 90):
```css
    .story-dialog-overlay { display:none; position:absolute; inset:0; z-index:18;
      background:rgba(2,4,10,0.78); align-items:center; justify-content:center; }
    .story-dialog-card { width:90%; max-width:680px; background:linear-gradient(135deg,#0a1426,#0a1a14);
      border:1px solid #2a4a6a; border-radius:10px; padding:22px; display:flex; gap:18px; }
    .story-dialog-portrait { width:96px; height:96px; flex:0 0 96px; border-radius:8px;
      display:flex; align-items:center; justify-content:center; font-size:42px; font-weight:bold;
      color:#0a0a0a; overflow:hidden; }
    .story-dialog-portrait img { width:100%; height:100%; object-fit:cover; }
    .story-dialog-body { flex:1; display:flex; flex-direction:column; }
    .story-dialog-name { font-size:13px; letter-spacing:1px; text-transform:uppercase; margin-bottom:8px; font-weight:bold; }
    .story-dialog-text { font-size:15px; color:#e6e6e6; line-height:1.6; flex:1; }
    .story-dialog-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:16px; }
    .story-dialog-actions button { background:#16324a; border:1px solid #2a5a7a; color:#cfe;
      padding:7px 16px; border-radius:6px; cursor:pointer; font-size:13px; }
    .story-dialog-actions button:hover { background:#1d4360; }
    #story-dialog-skip { background:transparent; border-color:#3a4a5a; color:#8aa; }
    #story-log-overlay { display:none; position:absolute; inset:0; z-index:17;
      background:rgba(2,4,10,0.85); align-items:center; justify-content:center; }
    #story-log-inner { width:90%; max-width:420px; max-height:70%; overflow:auto;
      background:#0a1018; border:1px solid #2a4a6a; border-radius:10px; padding:18px; }
    #story-log-inner h3 { color:#6bf; margin:0 0 12px; font-size:16px; }
    .story-log-entry { display:block; width:100%; text-align:left; background:#12202e;
      border:1px solid #24405a; color:#cde; padding:9px 12px; border-radius:6px; margin-bottom:7px; cursor:pointer; }
    .story-log-entry:hover { background:#1a3145; }
    #story-log-empty { color:#789; font-size:13px; }
    #story-log-close { margin-top:8px; background:transparent; border:1px solid #3a4a5a; color:#8aa;
      padding:6px 14px; border-radius:6px; cursor:pointer; }
```

Add the markup just before the closing of the game container (right after the `#story-banner` block, around line 318):
```html
    <div id="story-dialog" class="story-dialog-overlay">
      <div class="story-dialog-card">
        <div id="story-dialog-portrait" class="story-dialog-portrait"></div>
        <div class="story-dialog-body">
          <div id="story-dialog-name" class="story-dialog-name"></div>
          <div id="story-dialog-text" class="story-dialog-text"></div>
          <div class="story-dialog-actions">
            <button id="story-dialog-skip">Skip</button>
            <button id="story-dialog-next">Next ▸</button>
          </div>
        </div>
      </div>
    </div>
    <div id="story-log-overlay">
      <div id="story-log-inner">
        <h3>Story Log</h3>
        <div id="story-log-list"></div>
        <button id="story-log-close">Close</button>
      </div>
    </div>
```

Add a Story Log button to the map-meta-bar (around line 326, after `#open-settings`):
```html
        <button id="open-story-log" title="Story log">📖 Story</button>
```

- [ ] **Step 6: Verify build compiles**

Run: `npm run build`
Expected: build succeeds (no syntax errors in index.html/CSS).

- [ ] **Step 7: Commit**

```bash
git add src/ui/StoryDialogOverlay.js src/ui/StoryDialogOverlay.test.js index.html
git commit -m "feat(story): StoryDialogOverlay multi-panel dialog + DOM/CSS"
```

---

## Task 6: `assets/portraits/PROMPTS.md` (Phase 2 doc)

**Files:**
- Create: `assets/portraits/PROMPTS.md`

- [ ] **Step 1: Create the doc**

Create `assets/portraits/PROMPTS.md`:
```markdown
# Story Portrait Assets (Phase 2)

The campaign story dialog (`src/ui/StoryDialogOverlay.js`) renders a speaker portrait
per panel. Until these PNGs exist, `src/systems/portraitFallback.js` draws a colored
block with the speaker's initial. To enable real art with **zero code change**:

1. Generate the three 256×256 PNGs below and save them to `public/assets/portraits/`.
2. In `src/systems/portraitFallback.js`, add their keys to `REGISTERED_PORTRAITS`:
   `new Set(['portrait-command', 'portrait-rael', 'portrait-vorn'])`.
   (Or, preferred: have BootScene load them and populate the set at runtime.)

| Key | Speaker | Prompt |
|-----|---------|--------|
| `portrait-command` | Sol Command | Stern human military officer bust, dark blue Sol Vanguard uniform, command-deck lighting, sci-fi, semi-realistic painterly style, neutral background. |
| `portrait-rael` | Commander Rael | Battle-worn field commander bust, gold-accented Vanguard armor, scarred but resolute, warm key light, semi-realistic painterly style, neutral background. |
| `portrait-vorn` | The Vorn (hive-mind) | Alien hive-mind visage, chitinous violet carapace, many faint glowing eyes, unsettling, cold purple light, semi-realistic painterly style, dark background. |

Colors used by the fallback (keep art tonally consistent): command `#4aa3ff`, rael `#ffd24a`, vorn `#9b4dff`.
```

- [ ] **Step 2: Commit**

```bash
git add assets/portraits/PROMPTS.md
git commit -m "docs(portraits): Phase 2 portrait asset prompts"
```

---

## Task 7: Wire opener + Story Log into MapSelectScene

**Files:**
- Modify: `src/scenes/MapSelectScene.js`

No new unit test (Phaser-scene glue; logic it calls is already tested in Tasks 1 & 4). Verified in the browser at Task 9.

- [ ] **Step 1: Import and instantiate the overlay**

At the top of `src/scenes/MapSelectScene.js`, add to the imports:
```js
import { StoryDialogOverlay } from '../ui/StoryDialogOverlay.js';
import { storyLogEntries } from '../data/story.js';
```

In `create()`, after `this._heroOverlay = ...` (line ~23), add:
```js
    this._storyDialog = new StoryDialogOverlay();
```

- [ ] **Step 2: Play the opener on first load**

In `create()`, after `this._bindSettings();` (line ~38), add:
```js
    this._bindStoryLog();
    if (!this._saveMgr.hasSeenBeat('campaign_intro')) {
      this._storyDialog.play('campaign_intro', () => this._saveMgr.markBeatSeen('campaign_intro'));
    }
```

- [ ] **Step 3: Add the Story Log binding**

Add a new method (near `_bindSettings`):
```js
  _bindStoryLog() {
    const openBtn  = document.getElementById('open-story-log');
    const overlay  = document.getElementById('story-log-overlay');
    const list     = document.getElementById('story-log-list');
    const closeBtn = document.getElementById('story-log-close');
    if (!openBtn || !overlay) return;

    this._onOpenStoryLog = () => {
      list.replaceChildren();
      const entries = storyLogEntries(this._saveMgr.getSeenBeats());
      if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.id = 'story-log-empty';
        empty.textContent = 'No story unlocked yet. Play a mission to begin.';
        list.appendChild(empty);
      } else {
        for (const e of entries) {
          const btn = document.createElement('button');
          btn.className = 'story-log-entry';
          btn.textContent = e.label;
          btn.addEventListener('click', () => {
            overlay.style.display = 'none';
            this._storyDialog.play(e.id, () => {});
          });
          list.appendChild(btn);
        }
      }
      overlay.style.display = 'flex';
    };
    this._onCloseStoryLog = () => { overlay.style.display = 'none'; };

    openBtn.addEventListener('click', this._onOpenStoryLog);
    closeBtn.addEventListener('click', this._onCloseStoryLog);
  }
```

- [ ] **Step 4: Clean up listeners on shutdown**

In the existing `shutdown()` method, add:
```js
    const openBtn  = document.getElementById('open-story-log');
    const closeBtn = document.getElementById('story-log-close');
    if (openBtn && this._onOpenStoryLog)  openBtn.removeEventListener('click', this._onOpenStoryLog);
    if (closeBtn && this._onCloseStoryLog) closeBtn.removeEventListener('click', this._onCloseStoryLog);
    this._storyDialog?.close();
```

- [ ] **Step 5: Run the full suite (no regression)**

Run: `npx vitest run`
Expected: PASS (unchanged count; scene has no unit tests).

- [ ] **Step 6: Commit**

```bash
git add src/scenes/MapSelectScene.js
git commit -m "feat(story): campaign opener + Story Log on MapSelect"
```

---

## Task 8: Wire briefing + epilogue/ending into GameScene; remove `getUnlockPanel`

**Files:**
- Modify: `src/scenes/GameScene.js`
- Modify: `src/systems/StoryManager.js`
- Modify: `src/systems/StoryManager.test.js`

- [ ] **Step 1: Remove `getUnlockPanel` from StoryManager and its test**

In `src/systems/StoryManager.js`, delete the method:
```js
  getUnlockPanel(storyKey) {
    return this._panels[storyKey]?.unlock ?? null;
  }
```

In `src/systems/StoryManager.test.js`, remove any test that calls `getUnlockPanel` (search the file). If a `describe`/`it` block references `unlock`, delete that block. Keep the `getPanelForWave` and banner tests.

- [ ] **Step 2: Run StoryManager tests**

Run: `npx vitest run src/systems/StoryManager.test.js`
Expected: PASS.

- [ ] **Step 3: Import helpers + instantiate overlay in GameScene**

In `src/scenes/GameScene.js`, extend the story import (line 16 region). Find:
```js
import { StoryManager }    from '../systems/StoryManager.js';
```
and the existing `STORY_PANELS` import (search for `STORY_PANELS`). Add:
```js
import { StoryDialogOverlay } from '../ui/StoryDialogOverlay.js';
import { briefKey, victorySequenceId, STORY_SEQUENCES } from '../data/story.js';
```

After `this.storyMgr = new StoryManager(STORY_PANELS);` (line ~83), add:
```js
    this._storyDialog = new StoryDialogOverlay();
```

- [ ] **Step 4: Play the briefing before the first wave**

In `create()`, just before `if (import.meta.env.DEV) window.__game = this;` (line ~212), add:
```js
    // Pre-battle briefing (once per map). Combat hasn't started; the wave button waits.
    const briefId = briefKey(map.storyKey);
    if (STORY_SEQUENCES[briefId] && !this.saveMgr.hasSeenBeat(briefId)) {
      this._storyDialog.play(briefId, () => this.saveMgr.markBeatSeen(briefId));
    }
```

> Executor note: `map` is the map object already in scope in `create()` (used at line 76+). Confirm the local variable name by reading the top of `create()`; it is `const map = MAPS[this.mapId]` or similar. Use whatever name is already bound.

- [ ] **Step 5: Replace the victory `unlock` banner with the epilogue/ending sequence**

In `_onVictory()` (line ~1174), replace:
```js
    const panel = this.storyMgr.getUnlockPanel(map.storyKey);
    if (panel) {
      this.storyMgr.showBanner(panel, () => this._showVictoryOverlay(stars));
    } else {
      this._showVictoryOverlay(stars);
    }
```
with:
```js
    const isFinal = this.mapId === MAPS.length - 1;
    const seqId   = victorySequenceId(map.storyKey, isFinal);
    if (STORY_SEQUENCES[seqId] && !this.saveMgr.hasSeenBeat(seqId)) {
      this._storyDialog.play(seqId, () => {
        this.saveMgr.markBeatSeen(seqId);
        this._showVictoryOverlay(stars);
      });
    } else {
      this._showVictoryOverlay(stars);
    }
```

> Executor note: `map` is bound earlier in `_onVictory()` as `const map = MAPS[this.mapId];` (line 1180). Confirm before editing.

- [ ] **Step 6: Close the overlay on shutdown**

Find GameScene's shutdown handler:
```bash
grep -n "shutdown" src/scenes/GameScene.js
```
In the `shutdown()` method body, add:
```js
    this._storyDialog?.close();
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS — all green, no `getUnlockPanel` references remain.

- [ ] **Step 8: Verify no dangling references**

Run: `grep -rn "getUnlockPanel\|\.unlock" src/ | grep -v node_modules`
Expected: no matches (the `unlock` data and method are fully removed).

- [ ] **Step 9: Commit**

```bash
git add src/scenes/GameScene.js src/systems/StoryManager.js src/systems/StoryManager.test.js
git commit -m "feat(story): pre-battle briefing + epilogue/ending in GameScene; drop getUnlockPanel"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite + build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 2: Browser verify (Definition of Done)**

Run `npm run dev`, then in the browser:
1. **Fresh save** (clear localStorage): MapSelect shows the **Prologue** opener; Skip works; reload → opener does NOT re-show.
2. Enter an unseen map (e.g. map 0): the **briefing** dialog plays before wave 1; portrait shows the speaker initial on a colored block; speaker name is accent-colored; Next advances; last panel reads "Continue ▸".
3. Re-enter the same map: briefing does NOT auto-play.
4. Win a non-final map: the **epilogue** sequence plays, then the victory overlay appears.
5. Win map 9 (or temporarily set stars to reach it): the **Finale** (`campaign_ending`) plays instead of an epilogue.
6. Open **📖 Story** on MapSelect: seen beats are listed with friendly labels; clicking one replays it; an unseen-everything save shows the empty message.
7. Mid-wave banner still appears at the configured waves with rewritten text.

- [ ] **Step 3: Confirm coverage of edge cases**

Manually confirm (or note) each spec §11 edge case: missing sequence id (no crash, proceeds), empty panels, re-entrant play, old-save migration (full story shows once), Story Log only lists seen beats, map 9 routes to ending, skipped opener stays seen.

---

## Self-Review (planner)

- **Spec coverage:** §2 bible → Task 4 content. §4 schema → Task 4. §5 storySequence → Task 2. §6 overlay + DOM → Task 5. §7 persistence → Task 1. §8 portraits → Tasks 3 & 6. §9 wiring → Tasks 7 & 8. §10 testing → tests across Tasks 1–5. §11 edge cases → Task 9 Step 3 + overlay/sequence tests. ✓
- **Type/name consistency:** `briefKey`/`epilogueKey`/`victorySequenceId`/`storyLogEntries`/`STORY_LOG_LABELS`/`STORY_SPEAKERS`/`STORY_SEQUENCES` defined in Task 4, consumed identically in Tasks 5/7/8. `resolvePortrait`/`REGISTERED_PORTRAITS` defined Task 3, used Task 5. `createSequence`/`currentPanel`/`advance`/`atEnd`/`isComplete` defined Task 2, used Task 5. `hasSeenBeat`/`markBeatSeen`/`getSeenBeats` defined Task 1, used Tasks 7/8. ✓
- **Safe intermediate:** Task 4 removes `unlock` data but leaves `getUnlockPanel` (returns null → victory overlay shows directly); Task 8 removes the method + call site together. ✓
- **Placeholders:** none — all content and code authored inline. (Two deliberate executor-notes flag a CSS typo to fix and local-variable-name confirmation.) ✓
```
