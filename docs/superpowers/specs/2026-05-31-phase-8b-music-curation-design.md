# Phase 8b — Music Curation + Victory/Defeat Replacement

**Status:** Approved — ready for implementation plan
**Date:** 2026-05-31
**Backlog item:** #1 in `.claude/notes.md`
**Branches off:** `origin/feature/phase-3-tower-system`
**Predecessor:** Phase 8 (PR #10 + #11) — AudioManager, BootScene loader, SettingsOverlay all wired

---

## Goal

Replace 22 missing music tracks (currently a fully empty `public/audio/music/` folder) and 2 placeholder SFX (`victory.mp3`, `defeat.mp3`) with curated CC0 audio, eliminating the 22 console decode errors on every page load and giving each map a distinct musical identity that anticipates the future per-map space themes (backlog #9).

This is **asset curation only**. No system changes to `AudioManager`, `BootScene`, or scene wiring. The keys `SFX_KEYS` and `MUSIC_KEYS` in `src/systems/AudioManager.js` already define the loader filenames — this work just fills those slots with real audio.

---

## Scope

### In scope (24 files)

**20 map tracks** (one ambient + one combat per map):

```
public/audio/music/map-0-ambient.mp3   map-0-combat.mp3
public/audio/music/map-1-ambient.mp3   map-1-combat.mp3
...
public/audio/music/map-9-ambient.mp3   map-9-combat.mp3
```

**2 boss themes:**

```
public/audio/music/boss-mid.mp3
public/audio/music/boss-final.mp3
```

**2 SFX replacements:**

```
public/audio/sfx/victory.mp3   (replace Kenney switch38 placeholder)
public/audio/sfx/defeat.mp3    (replace Kenney switch1  placeholder)
```

### Out of scope (deferred to follow-up PRs, still on backlog #1)

- Per-tower tier-4 branch SFX — 5 tier-4 branches currently reuse the base fire sound; per-branch curation deferred
- Per-enemy-type hit SFX — currently a generic `enemy-hit.mp3` + detuned variants; per-enemy curation deferred
- Any change to `AudioManager`, `BootScene`, `SettingsOverlay`, or cross-fade logic
- Any change to `SFX_KEYS` or `MUSIC_KEYS` arrays (existing slots are correct)
- Backlog #8 (storyline) and #9 (space-themed backgrounds) — separate items

---

## Per-map musical identity

Each map gets a distinct musical signature that anticipates its future visual theme (space backgrounds are backlog #9 and not yet built — music encodes the intended vibe in advance).

| # | Map name | Ambient vibe | Combat vibe |
|---|---|---|---|
| 0 | Outpost Sigma | Calm frontier synths, hopeful sci-fi | Light percussive electronic |
| 1 | Lunar Gate | Sparse, vacuum, choral pads | Driving mid-tempo electronic |
| 2 | The Crater | Wind/dust ambient, slight unease | Tense industrial |
| 3 | Orbital Station | Clean station hum, mechanical | Synth arpeggios, urgent |
| 4 | **Asteroid Belt** (mid-boss map) | Heavy drones, debris ambient | Boss wave swaps to `boss-mid` |
| 5 | Titan's Reach | Icy/distant pads, isolated | Cold electronic, methodical |
| 6 | Deep Space Corridor | Ethereal, FTL hum | Pulsing, claustrophobic |
| 7 | The Void Frontier | Dread/empty, sub-bass | Dissonant, escalating |
| 8 | Enemy Homeworld | Alien tonalities, dread | Aggressive, percussive |
| 9 | **Last Light** (final-boss map) | Defiant orchestral-electronic hybrid | Boss wave swaps to `boss-final` |

### Boss themes

| Key | Trigger | Vibe |
|---|---|---|
| `boss-mid` | Map 4 (Asteroid Belt) boss wave | Mid-campaign climax — heavier than the host map's combat track; ~45-60s loop |
| `boss-final` | Map 9 (Last Light) boss wave | Campaign capstone — most dramatic, orchestral-electronic, "this is the end" energy; ~45-60s loop |

**Boss-trigger verification:** The implementation plan's first task verifies the existing GameScene/AudioManager boss-trigger wiring matches this design. If the wired condition differs (e.g., triggers on any boss wave instead of specifically map-4/map-9), the plan adjusts either the spec or adds a small wiring fix — decided when the trigger code is inspected.

### Cross-fade requirement

Each map's ambient+combat pair must share **key and tempo** so the existing 1.5 s cross-fade in `AudioManager` is seamless. The curator pairs them at source-pick time; the user validates the transition during the listening pass.

---

## Sourcing & process

### Primary source

[freesound.org](https://freesound.org) filtered to **License = `Creative Commons 0`**.

Search seed terms (per map vibe column):
- `sci-fi ambient loop`, `space ambient`, `dark electronic loop`
- `tense electronic`, `industrial loop`, `pulsing electronic`
- `cinematic combat loop`, `boss battle electronic`, `orchestral electronic`

### Backup sources

- Kenney's music packs ([kenney.nl/assets](https://kenney.nl/assets)) — CC0 by default if a Kenney music pack covers a slot better than freesound.
- Any CC0 source acceptable; **NO** CC-BY, CC-BY-SA, or commercial-use-only tracks. License audit per file at download time.

### License audit

Every track verified CC0 at download time. Source URL recorded in `public/audio/ATTRIBUTIONS.md`. If a freesound page shows anything other than "Creative Commons 0", the track is rejected.

### Conversion

Use existing `scripts/convert-audio.sh`:

- Auto-routes `map-*` and `boss-*` filenames to `public/audio/music/`
- Music: 96 kbps mono MP3, current trim 60 s
- Boss themes: 128 kbps mono MP3, current trim 60 s

**Potential script tweak:** boss themes target 45-60 s but the current trim is 60 s. If a boss source is longer than 60 s and the natural loop point is past 60 s, raise the boss-branch trim to 75 s. Decision made during curation; documented in the plan task that runs the conversion.

### Filenames

Source files in the staging directory must be named exactly to match the target slot (the script preserves the basename):

```
~/Downloads/stage/map-0-ambient.wav      → public/audio/music/map-0-ambient.mp3
~/Downloads/stage/boss-final.flac        → public/audio/music/boss-final.mp3
~/Downloads/stage/victory.wav            → public/audio/sfx/victory.mp3
~/Downloads/stage/defeat.wav             → public/audio/sfx/defeat.mp3
```

### Attribution

`public/audio/ATTRIBUTIONS.md` updated with a new music section listing every track:

```
| File | Source | Source URL | Author | License |
|---|---|---|---|---|
| `map-0-ambient.mp3` | freesound.org | https://freesound.org/s/<id>/ | <handle> | CC0 |
...
```

The existing SFX table stays as-is. The victory/defeat rows update to point at the new sources and the "Known placeholders" note at the bottom of the SFX section is removed.

---

## Budget

| Asset class | Current | After Phase 8b | Cap |
|---|---|---|---|
| `public/audio/sfx/` | 248 KB | 248 KB + (≤200 KB × 2 replacements) | ≤500 KB |
| `public/audio/music/` | 0 | ≤7.5 MB (22 tracks, ~340 KB avg) | ≤7.5 MB |
| `public/audio/` total | 252 KB | ≤8 MB | **≤8 MB hard ceiling** |

Per-track guidance (sized to fit the 7.5 MB music cap):
- Map ambient/combat loops: ~20-25 s sources, ~250-300 KB each at 96 kbps mono → 20 tracks ≈ 5.5-6.0 MB
- Boss themes: ~45-50 s sources, ~700-800 KB each at 128 kbps mono → 2 tracks ≈ 1.4-1.6 MB
- Reserve: ~0.5-1.0 MB headroom

Running total target: ~7.0-7.5 MB music + ~350 KB SFX ≈ 7.4-7.9 MB total.

If the bundle exceeds 8 MB after conversion, drop bitrate on the largest offenders (60 kbps mono is still acceptable for ambient pads) or trim source duration. Don't ship a bundle larger than 8 MB.

---

## Verification

A track is considered "shipped" only when all of these pass:

1. File exists at the correct path in `public/audio/music/` or `public/audio/sfx/`
2. Listed with author + source URL + CC0 in `public/audio/ATTRIBUTIONS.md`
3. `du -sh public/audio/` reports ≤8.0 M
4. `npm test` green (asset changes should be no-op for the test suite)
5. `npm run build` green
6. Dev server loads with **zero** audio decode errors in the Chrome console (currently 22 errors from the missing music files)
7. User listening pass: every map's ambient+combat cross-fade is audibly seamless; boss themes feel climactic; victory/defeat fanfares read as triumph/loss respectively

Items 1-6 are machine-verifiable. Item 7 requires the user — I have no audio playback. The plan includes an explicit "user listening pass" task before merge.

---

## Constraints

- **CC0 only.** No CC-BY, no commercial-use-only, no unknown license. Every source URL recorded.
- **No system changes.** AudioManager, BootScene, SettingsOverlay, cross-fade logic are all out of scope. If a defect is found in those systems during curation, it gets a separate bug ticket; this PR stays asset-only.
- **MP3 commit policy.** MP3 files are tracked in git (existing pattern; 248 KB SFX bundle already committed). Total repo growth ≤7.75 MB.
- **Branch base.** Off `origin/feature/phase-3-tower-system` (verified fresh — PR #18 merged at 7971b72). Don't branch off a stale local ref per [feedback_branch_base_verification.md].
- **No npm dependency adds.** convert-audio.sh uses ffmpeg (system binary); listening uses Chrome (user). Nothing to install.

---

## Risks

| Risk | Mitigation |
|---|---|
| My listening blind spot — can't verify vibe | User listening pass before merge; swap-and-reconvert if a track is wrong |
| Boss-trigger wiring doesn't match Map 4 / Map 9 design intent | First plan task inspects GameScene + AudioManager trigger code; spec or wiring adjusted accordingly |
| Cross-fade key/tempo mismatch produces audible jump | Curator pairs ambient+combat at source-pick time using freesound tag/BPM metadata; user spot-checks transitions |
| Bundle exceeds 8 MB after conversion | Drop bitrate to 60 kbps on largest offenders OR trim source duration; never ship >8 MB |
| Freesound source revoked / link rot post-merge | Every file is committed locally; source URL is for attribution traceability, not runtime dependency |
| convert-audio.sh 60s trim cuts boss themes too short | Raise boss-branch `-t` value to 75s if needed; documented in the conversion-run plan task |

---

## Open questions resolved during brainstorm

- ✅ **Scope:** Music + victory/defeat replacement; per-tower-branch and per-enemy SFX deferred
- ✅ **Selection criteria:** Per-map identity (each map's vibe defined above) + distinct boss themes
- ✅ **Boss triggers:** Map 4 → `boss-mid`, Map 9 → `boss-final` (subject to verification of existing wiring)
- ✅ **Bundle budget:** 8 MB total, no lazy-loading (preserves existing AudioManager loader)
- ✅ **Licensing/workflow:** freesound CC0 uses the same `convert-audio.sh` workflow as Kenney; license filter required at download time

---

## Out of scope (explicitly deferred)

- Per-tower tier-4 branch SFX (5 branches) — backlog #1, future PR
- Per-enemy-type hit SFX — backlog #1, future PR
- Lazy-loading music per map (would require AudioManager.loadAssets refactor)
- Music mixer/EQ tooling
- Voice-over / narration audio
- Storyline integration (backlog #8)
- Space-themed visual backgrounds (backlog #9)
