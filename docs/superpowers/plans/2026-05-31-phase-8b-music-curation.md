# Phase 8b — Music Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Curate 22 CC0 music tracks (10 ambient/combat map pairs + 2 boss themes) and replace 2 placeholder SFX (victory/defeat), filling the empty `public/audio/music/` folder and eliminating the 22 console decode errors on every page load.

**Architecture:** Asset curation only — no system code changes. `AudioManager`, `BootScene`, `SettingsOverlay`, and the boss-music trigger in `GameScene` are all out of scope. Two-stage workflow: (1) subagent curates candidate freesound.org CC0 URLs into a scratch document, then (2) the user downloads + stages files, the subagent converts via `scripts/convert-audio.sh`, updates `ATTRIBUTIONS.md`, runs machine verification, and the user does a listening pass.

**Tech Stack:** freesound.org (CC0 source), Kenney music packs (CC0 fallback), `ffmpeg` via `scripts/convert-audio.sh`, Phaser 3 audio loader.

**Spec:** [docs/superpowers/specs/2026-05-31-phase-8b-music-curation-design.md](../specs/2026-05-31-phase-8b-music-curation-design.md)

---

## File Inventory

**Create:**
- `public/audio/music/map-0-ambient.mp3` through `map-9-ambient.mp3` (10 files)
- `public/audio/music/map-0-combat.mp3` through `map-9-combat.mp3` (10 files)
- `public/audio/music/boss-mid.mp3`
- `public/audio/music/boss-final.mp3`
- `docs/superpowers/plans/2026-05-31-phase-8b-candidates.md` (scratch — committed during work, deleted at final commit)

**Replace (overwrite):**
- `public/audio/sfx/victory.mp3` (currently Kenney switch38 placeholder)
- `public/audio/sfx/defeat.mp3` (currently Kenney switch1 placeholder)

**Modify:**
- `public/audio/ATTRIBUTIONS.md` — add Music section, update Victory/Defeat rows, remove placeholder note
- `scripts/convert-audio.sh` — add `BOSS_DURATION` variable for 75s boss-theme trim (vs current 60s for maps)
- `.claude/notes.md` — mark Phase 8b music portion complete; restate that per-tower-branch + per-enemy SFX remain on backlog #1

**Do not touch:**
- `src/systems/AudioManager.js` (keys + wiring already correct)
- `src/scenes/GameScene.js` (boss trigger already correct: line 261 picks `boss-mid` when `mapId === 4`, else `boss-final`)
- `src/scenes/BootScene.js` (loader already correct)
- Any test file (this is asset work; no test changes expected)

---

## Task 1: Verify boss-trigger wiring (smoke check, no changes)

**Files:**
- Read: `src/scenes/GameScene.js:255-265`
- Read: `src/systems/AudioManager.js:115-130`

- [ ] **Step 1: Confirm boss trigger condition matches spec**

Read `src/scenes/GameScene.js:258-263`. Verify the wiring:

```js
if (!this._bossMusicTriggered && def.type === 'titan' /* ... */ ) {
  // ...
  const theme = this.mapId === 4 ? 'boss-mid' : 'boss-final';
  if (am) am.playMusic(theme);
  this._bossMusicTriggered = true;
}
```

Expected: `mapId === 4` plays `boss-mid`; all other titan-boss maps play `boss-final`. This matches the spec's design intent (Map 4 → mid, Map 9 → final). Map 9 reaches the `boss-final` branch via the `else`.

- [ ] **Step 2: Confirm AudioManager.playMusic handles boss keys**

Read `src/systems/AudioManager.js:117-122`. Verify:

```js
playMusic(id) {
  if (id === 'boss-mid' || id === 'boss-final') {
    this._stopMusic();
    this._music.boss = this._addMusic(id);
    if (this._music.boss) this._music.boss.play({ volume: this.getEffectiveVolume('music'), loop: true });
    return;
  }
  // ... map music handling
}
```

Expected: `playMusic('boss-mid')` and `playMusic('boss-final')` route to the boss branch, stop current music, load + loop the boss track. ✅

- [ ] **Step 3: Document findings (no commit)**

Wiring matches spec. No code changes needed for boss triggers. Note in next task's context.

---

## Task 2: Extend convert-audio.sh boss-theme trim to 75 s

**Files:**
- Modify: `scripts/convert-audio.sh:40-65`

- [ ] **Step 1: Edit the script to add BOSS_DURATION**

In `scripts/convert-audio.sh`, after line 44 (the existing `MUSIC_DURATION="60"`), add:

```bash
# Boss themes have a longer trim to accommodate 45-60s climactic loops.
BOSS_DURATION="75"
```

Then in the `boss-*)` case (around line 57-60), change:

```bash
boss-*)
  out="$MUSIC_OUT/$name.mp3"
  ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$BOSS_BITRATE" -t "$MUSIC_DURATION" "$out"
  ;;
```

To:

```bash
boss-*)
  out="$MUSIC_OUT/$name.mp3"
  ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$BOSS_BITRATE" -t "$BOSS_DURATION" "$out"
  ;;
```

- [ ] **Step 2: Smoke-test the script with a generated dummy file**

Generate an 80-second silence WAV and run the script to confirm both branches honor their trim values.

Run:
```bash
mkdir -p /tmp/convert-audio-smoketest
ffmpeg -y -loglevel error -f lavfi -i "anullsrc=r=44100:cl=mono" -t 80 /tmp/convert-audio-smoketest/map-test-ambient.wav
ffmpeg -y -loglevel error -f lavfi -i "anullsrc=r=44100:cl=mono" -t 80 /tmp/convert-audio-smoketest/boss-test.wav
./scripts/convert-audio.sh /tmp/convert-audio-smoketest
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 public/audio/music/map-test-ambient.mp3
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 public/audio/music/boss-test.mp3
```

Expected output (durations within ±0.1 s):
- `map-test-ambient.mp3` → `60.0XX...`
- `boss-test.mp3` → `75.0XX...`

- [ ] **Step 3: Clean up smoke-test artifacts**

```bash
rm public/audio/music/map-test-ambient.mp3 public/audio/music/boss-test.mp3
rm -rf /tmp/convert-audio-smoketest
```

- [ ] **Step 4: Commit**

```bash
git add scripts/convert-audio.sh
git commit -m "build(audio): add BOSS_DURATION=75s for longer boss-theme trims

Boss themes target 45-60s climactic loops; the previous 60s trim left no
headroom for sources that look better past the 60s mark. Map ambient/combat
loops continue to trim at MUSIC_DURATION=60s.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Curate freesound.org CC0 candidates for maps 0-4 (10 tracks)

**Files:**
- Create: `docs/superpowers/plans/2026-05-31-phase-8b-candidates.md`

- [ ] **Step 1: Create candidate-list scratch file with header**

Write the file with this exact starting content:

```markdown
# Phase 8b — Curated CC0 Music Candidates

Working artifact only. Deleted at final commit; canonical record lives in
`public/audio/ATTRIBUTIONS.md`.

Each row: target filename | freesound URL | author | duration | license note | vibe match.

## Maps 0-4

| Filename | freesound URL | Author | Duration | License | Vibe match |
|---|---|---|---|---|---|

## Maps 5-9

| Filename | freesound URL | Author | Duration | License | Vibe match |
|---|---|---|---|---|---|

## Boss themes + SFX replacements

| Filename | freesound URL | Author | Duration | License | Vibe match |
|---|---|---|---|---|---|
```

- [ ] **Step 2: For each of the 10 map-0 through map-4 slots, search and verify**

For each filename below, use this loop:

1. `WebSearch` for the vibe terms from the spec (e.g. `site:freesound.org cc0 sci-fi ambient loop`)
2. `WebFetch` on each candidate freesound.org URL to confirm the page shows **License: Creative Commons 0** (NOT CC-BY, NOT CC-BY-SA)
3. Read the page for: author handle, duration (in seconds), tag list, BPM/key if shown, comment quality
4. Pick the best match by tags + duration + license
5. Append a row to the appropriate table in the candidate file

Required slots (from spec section "Per-map musical identity"):

| Filename | Vibe target |
|---|---|
| `map-0-ambient.mp3` | Calm frontier synths, hopeful sci-fi, ~20-25s |
| `map-0-combat.mp3` | Light percussive electronic, ~20-25s, same key/tempo as ambient |
| `map-1-ambient.mp3` | Sparse, vacuum, choral pads, ~20-25s |
| `map-1-combat.mp3` | Driving mid-tempo electronic, ~20-25s, paired key/tempo |
| `map-2-ambient.mp3` | Wind/dust ambient, slight unease, ~20-25s |
| `map-2-combat.mp3` | Tense industrial, ~20-25s, paired key/tempo |
| `map-3-ambient.mp3` | Clean station hum, mechanical, ~20-25s |
| `map-3-combat.mp3` | Synth arpeggios, urgent, ~20-25s, paired key/tempo |
| `map-4-ambient.mp3` | Heavy drones, debris ambient (mid-boss host map), ~20-25s |
| `map-4-combat.mp3` | Driving combat that sets up the boss-mid swap, ~20-25s |

For each row, the "Vibe match" cell explains in 1-2 sentences why this track fits (tag matches, mood, why it pairs with its partner).

**Hard requirement:** if a freesound page shows anything other than `Creative Commons 0`, reject and pick another. CC-BY is NOT acceptable.

- [ ] **Step 3: Commit the in-progress candidate file**

```bash
git add docs/superpowers/plans/2026-05-31-phase-8b-candidates.md
git commit -m "chore(phase-8b): curated candidate list for maps 0-4

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Curate freesound.org CC0 candidates for maps 5-9 (10 tracks)

**Files:**
- Modify: `docs/superpowers/plans/2026-05-31-phase-8b-candidates.md`

- [ ] **Step 1: Append rows for maps 5-9 to the "Maps 5-9" table**

Same loop as Task 3 (WebSearch → WebFetch license check → pick best match → append row).

Required slots:

| Filename | Vibe target |
|---|---|
| `map-5-ambient.mp3` | Icy/distant pads, isolated, ~20-25s |
| `map-5-combat.mp3` | Cold electronic, methodical, ~20-25s, paired key/tempo |
| `map-6-ambient.mp3` | Ethereal, FTL hum, ~20-25s |
| `map-6-combat.mp3` | Pulsing, claustrophobic, ~20-25s, paired key/tempo |
| `map-7-ambient.mp3` | Dread/empty, sub-bass, ~20-25s |
| `map-7-combat.mp3` | Dissonant, escalating, ~20-25s, paired key/tempo |
| `map-8-ambient.mp3` | Alien tonalities, dread, ~20-25s |
| `map-8-combat.mp3` | Aggressive, percussive, ~20-25s, paired key/tempo |
| `map-9-ambient.mp3` | Defiant orchestral-electronic hybrid (final-boss host map), ~20-25s |
| `map-9-combat.mp3` | Final-stand combat that sets up the boss-final swap, ~20-25s |

Same hard CC0-only license requirement.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-05-31-phase-8b-candidates.md
git commit -m "chore(phase-8b): curated candidate list for maps 5-9

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Curate boss themes + victory/defeat SFX replacements (4 tracks)

**Files:**
- Modify: `docs/superpowers/plans/2026-05-31-phase-8b-candidates.md`

- [ ] **Step 1: Append rows for boss themes + SFX replacements**

Required slots:

| Filename | Vibe target |
|---|---|
| `boss-mid.mp3` | Mid-campaign climax — heavier than Map 4 combat track, dramatic synths/percussion, ~45-50s, can go up to 60s |
| `boss-final.mp3` | Campaign capstone — orchestral-electronic hybrid, "this is the end" energy, ~45-50s, can go up to 60s |
| `victory.mp3` | Triumphant short fanfare/jingle, sci-fi flavored, ~2-4s |
| `defeat.mp3` | Somber/loss-themed short cue, descending tone, ~2-4s |

Search terms: `boss battle electronic loop`, `cinematic boss loop`, `victory jingle sci-fi`, `game over sad cue`.

Same hard CC0-only license requirement. Victory/defeat SFX may also come from Kenney's music packs or other CC0 sources if freesound doesn't yield good matches — record source in the table either way.

- [ ] **Step 2: Commit completed candidate list**

```bash
git add docs/superpowers/plans/2026-05-31-phase-8b-candidates.md
git commit -m "chore(phase-8b): curated candidate list complete (24 tracks)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: USER ACTION — download + stage candidate files

**This task pauses for the user.** The subagent prints instructions and waits.

- [ ] **Step 1: Print the staging instructions for the user**

Print this verbatim to the user (no tool call needed — just message text):

```
Phase 8b candidate list complete. To stage files for conversion:

1. mkdir -p ~/Downloads/phase-8b-stage
2. Open docs/superpowers/plans/2026-05-31-phase-8b-candidates.md
3. For each row, visit the freesound URL in your browser, click "Download" (login may be required for original quality), and save the file to ~/Downloads/phase-8b-stage/ — RENAMED to the exact target filename from the row (e.g. "map-0-ambient.wav", "boss-final.flac"). Source format (wav/flac/ogg/mp3) doesn't matter; the basename does.
4. When all 24 files are staged, reply "staged" so I can proceed with conversion.

If a download is blocked (login wall, broken link, etc.) reply with the offending filename(s) and I'll pick alternates.
```

- [ ] **Step 2: Wait for user confirmation**

The subagent stops here and yields control. The parent agent resumes Task 7 only after the user replies "staged" (or after handling any alternate-pick requests).

---

## Task 7: Run convert-audio.sh on staged files

**Files:**
- Read: `~/Downloads/phase-8b-stage/`
- Create: 24 files under `public/audio/music/` + 2 overwrites under `public/audio/sfx/`

- [ ] **Step 1: Verify staging dir has exactly 24 files with expected basenames**

```bash
ls ~/Downloads/phase-8b-stage/ | sort > /tmp/staged-basenames.txt
wc -l /tmp/staged-basenames.txt
cat /tmp/staged-basenames.txt
```

Expected: 24 lines, basenames (stripped of extension) covering: `map-0-ambient` through `map-9-combat` (20), `boss-mid`, `boss-final`, `victory`, `defeat`.

If any are missing or misnamed, halt and ask the user to fix before proceeding.

- [ ] **Step 2: Run conversion**

```bash
./scripts/convert-audio.sh ~/Downloads/phase-8b-stage
```

Expected output: 24 conversion lines + a final "converted 24 file(s)" + "audio size: <size>" line.

- [ ] **Step 3: Verify outputs**

```bash
ls public/audio/music/ | grep -v .gitkeep | wc -l   # expect 22
ls public/audio/sfx/  | grep -v .gitkeep | wc -l   # expect 23 (unchanged count; victory/defeat overwritten)
du -sh public/audio/                                # expect ≤ 8.0M
```

If `du` exceeds 8.0M, halt — the bundle is over budget; lower bitrate on the largest tracks (re-run conversion with edited convert-audio.sh `MUSIC_BITRATE` or `BOSS_BITRATE`) or pick shorter alternates and re-stage.

- [ ] **Step 4: Commit the audio files**

```bash
git add public/audio/music/ public/audio/sfx/victory.mp3 public/audio/sfx/defeat.mp3
git commit -m "feat(audio): add 22 CC0 music tracks + replace victory/defeat SFX

20 map ambient/combat pairs + 2 boss themes from freesound.org (all CC0).
Replaces Kenney switch-sound placeholders for victory.mp3 / defeat.mp3.

Total public/audio/ size: <fill in from du output>.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

Replace `<fill in from du output>` with the actual size before committing.

---

## Task 8: Update ATTRIBUTIONS.md

**Files:**
- Modify: `public/audio/ATTRIBUTIONS.md`

- [ ] **Step 1: Add the Music section table**

In `public/audio/ATTRIBUTIONS.md`, replace the existing `## Music (\`public/audio/music/\`)` section (currently "**Status: not yet curated.**") with:

```markdown
## Music (`public/audio/music/`)

22 mono MP3s — 20 map tracks (96 kbps) + 2 boss themes (128 kbps).
Total size: <fill in from du -sh public/audio/music/>.

| File | Source | Source URL | Author | License |
|---|---|---|---|---|
| `map-0-ambient.mp3` | freesound.org | <url> | <handle> | CC0 |
| `map-0-combat.mp3`  | freesound.org | <url> | <handle> | CC0 |
| `map-1-ambient.mp3` | freesound.org | <url> | <handle> | CC0 |
| `map-1-combat.mp3`  | freesound.org | <url> | <handle> | CC0 |
| `map-2-ambient.mp3` | freesound.org | <url> | <handle> | CC0 |
| `map-2-combat.mp3`  | freesound.org | <url> | <handle> | CC0 |
| `map-3-ambient.mp3` | freesound.org | <url> | <handle> | CC0 |
| `map-3-combat.mp3`  | freesound.org | <url> | <handle> | CC0 |
| `map-4-ambient.mp3` | freesound.org | <url> | <handle> | CC0 |
| `map-4-combat.mp3`  | freesound.org | <url> | <handle> | CC0 |
| `map-5-ambient.mp3` | freesound.org | <url> | <handle> | CC0 |
| `map-5-combat.mp3`  | freesound.org | <url> | <handle> | CC0 |
| `map-6-ambient.mp3` | freesound.org | <url> | <handle> | CC0 |
| `map-6-combat.mp3`  | freesound.org | <url> | <handle> | CC0 |
| `map-7-ambient.mp3` | freesound.org | <url> | <handle> | CC0 |
| `map-7-combat.mp3`  | freesound.org | <url> | <handle> | CC0 |
| `map-8-ambient.mp3` | freesound.org | <url> | <handle> | CC0 |
| `map-8-combat.mp3`  | freesound.org | <url> | <handle> | CC0 |
| `map-9-ambient.mp3` | freesound.org | <url> | <handle> | CC0 |
| `map-9-combat.mp3`  | freesound.org | <url> | <handle> | CC0 |
| `boss-mid.mp3`      | freesound.org | <url> | <handle> | CC0 |
| `boss-final.mp3`    | freesound.org | <url> | <handle> | CC0 |

Pair note: each map's ambient + combat track share key and tempo for the
1.5 s cross-fade in `AudioManager.setCombatActive`.

Boss-trigger: `GameScene` plays `boss-mid` on `mapId === 4` (Asteroid Belt)
and `boss-final` on all other titan-boss maps (currently only `mapId === 9`,
Last Light).
```

Fill in `<url>`, `<handle>`, and the music total size from the candidate file and `du`.

- [ ] **Step 2: Update Victory/Defeat rows in the SFX table**

In the existing SFX table, find:

```
| `victory.mp3`               | Kenney UI Audio      | `switch38.ogg`                   | CC0 |
| `defeat.mp3`                | Kenney UI Audio      | `switch1.ogg`                    | CC0 |
```

Replace with the actual sources from the candidate file (format may differ if not Kenney; preserve the column alignment).

- [ ] **Step 3: Remove the "Known placeholders" note**

Delete the entire "**Known placeholders:**" paragraph from the SFX section (the one referencing victory/defeat being switch sounds).

- [ ] **Step 4: Update header SFX count if needed**

The current header says "23 mono MP3s at 96 kbps. Total size: 248 KB." After victory/defeat replacement, run `du -sh public/audio/sfx/` and update the size figure (count stays at 23).

- [ ] **Step 5: Commit**

```bash
git add public/audio/ATTRIBUTIONS.md
git commit -m "docs(audio): attribute 22 music tracks + replaced SFX placeholders

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Machine verification (tests, build, decode-error scan)

**Files:** none modified

- [ ] **Step 1: Run unit tests**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests green (asset changes should be no-op for the test suite — current count is ~468 passing).

If any test fails, halt and investigate. Asset additions should not affect tests.

- [ ] **Step 2: Run production build**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds, audio files copied into `dist/audio/`.

- [ ] **Step 3: Verify audio bundle size**

```bash
du -sh public/audio/
du -sh public/audio/music/
du -sh public/audio/sfx/
```

Expected: total ≤8.0M, music ≤7.5M, sfx ≤500K. If over, halt and reduce.

- [ ] **Step 4: Start dev server and scan for decode errors**

```bash
npm run dev &
DEV_PID=$!
sleep 5
```

Then open Chrome and navigate to `http://localhost:5173` (or whatever Vite reports). Open DevTools Console. Reload the page.

Expected: **zero** audio-decode errors in the console. (Pre-Phase-8b, the page showed 22 decode errors from the missing music files. After Phase 8b, that should be 0.)

If decode errors remain, list which files are erroring and check whether the file exists in `public/audio/music/` and is a valid MP3 (`ffprobe public/audio/music/<file>.mp3` should show stream info).

Then:

```bash
kill $DEV_PID
```

- [ ] **Step 5: Document verification results in the next task**

Carry forward to Task 10 a brief note: "tests: <N> passing, build: green, audio size: <X>, decode errors: 0."

---

## Task 10: USER ACTION — listening pass

**This task pauses for the user.**

- [ ] **Step 1: Print listening instructions**

Print verbatim:

```
All 24 tracks converted, attributed, and decode-clean. Time for the listening pass.

1. Run `npm run dev` (it may already be running from Task 9).
2. For each map (0-9): start a game on that map, listen to the ambient loop, send a wave to hear the cross-fade into combat, and confirm the ambient/combat pair feels coherent (key + tempo match, no jarring jump).
3. For maps 4 and 9: play to the titan-boss wave (or fast-forward) to confirm boss-mid (Map 4) and boss-final (Map 9) swap in correctly and feel climactic.
4. Trigger victory (beat a map) and defeat (lose lives on a map) to spot-check those SFX cues.
5. Reply with either:
   - "all good" → proceed to PR
   - A list of filenames that don't fit (one per line) → I'll re-curate alternates for those slots only and re-run Tasks 6-9 for the swapped subset
```

- [ ] **Step 2: Wait for user feedback**

If "all good" → proceed to Task 11.

If swap list returned → re-run Task 3/4/5 limited to the named filenames (append new rows to candidate file, mark old rows as "rejected"), then re-run Tasks 6-9 with only the swapped files in `~/Downloads/phase-8b-stage`. Iterate until "all good".

---

## Task 11: Update .claude/notes.md + remove candidate scratch file

**Files:**
- Modify: `.claude/notes.md`
- Delete: `docs/superpowers/plans/2026-05-31-phase-8b-candidates.md`

- [ ] **Step 1: Update Current Status + Backlog in notes.md**

Edit `.claude/notes.md`:

- In **Current Status**, append a sentence noting Phase 8b music portion is complete.
- In **Prioritized Backlog** item #1, rewrite to reflect what remains:

Find the line starting with `1. **Phase 8b (deferred from Phase 8):**` and replace with:

```
1. **Phase 8b — remaining SFX work (music + victory/defeat shipped 2026-05-31):** per-tower SFX for 5 tier-4 branches (currently reuse base fire sound); per-enemy-type hit sounds (currently generic + detuned)
```

- In **Completed**, prepend a line under today's date:

```
- ~~Phase 8b — music curation (22 CC0 tracks + 2 SFX replacements): 10 map ambient/combat pairs + boss-mid + boss-final, victory/defeat fanfares, ATTRIBUTIONS.md updated, 0 audio decode errors on page load (was 22)~~ (2026-05-31)
```

- [ ] **Step 2: Delete the candidate scratch file**

```bash
git rm docs/superpowers/plans/2026-05-31-phase-8b-candidates.md
```

- [ ] **Step 3: Commit**

```bash
git add .claude/notes.md
git commit -m "chore(notes): Phase 8b music shipped; SFX expansion remains on backlog

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 12: Push branch + open PR

- [ ] **Step 1: Run full lint + test suite per CLAUDE.md PR step**

```bash
npm test 2>&1 | tail -5
```

If the project has a lint command in `package.json scripts`, run it:

```bash
npm run lint 2>&1 | tail -10 || echo "no lint script — skipping per CLAUDE.md"
```

Expected: all green.

- [ ] **Step 2: Push branch**

```bash
git push -u origin feature/phase-8b-music-curation
```

- [ ] **Step 3: Open PR against feature/phase-3-tower-system**

```bash
gh pr create --base feature/phase-3-tower-system --title "feat(audio): Phase 8b — music curation + victory/defeat replacement" --body "$(cat <<'EOF'
## Summary

- Curates 22 CC0 music tracks from freesound.org: 10 map ambient/combat pairs (one per map, matched key + tempo for cross-fade) + 2 boss themes (`boss-mid` for Map 4 Asteroid Belt, `boss-final` for Map 9 Last Light).
- Replaces 2 placeholder SFX (`victory.mp3`, `defeat.mp3`) — previously Kenney UI switch sounds, now proper triumphant/somber cues.
- Eliminates the 22 audio-decode console errors that fired on every page load (from the previously empty `public/audio/music/` folder).
- No system code changes — `AudioManager`, `BootScene`, `SettingsOverlay`, and the boss-music trigger in `GameScene` are unchanged. This is asset curation only.
- Extends `scripts/convert-audio.sh` with a `BOSS_DURATION=75s` variable so boss-theme sources up to 75s convert cleanly (map music continues to trim at 60s).

## Audio bundle

Total `public/audio/`: <FILL IN from du -sh>. Music: <FILL IN>. SFX: <FILL IN>.

## Deferred (still on backlog #1)

- Per-tower tier-4 branch SFX (5 branches currently share base fire sounds)
- Per-enemy-type hit SFX (currently generic + detuned)

## Test plan

- [x] `npm test` green
- [x] `npm run build` green
- [x] `du -sh public/audio/` reports ≤ 8.0 M
- [x] Dev server load shows zero audio-decode errors in Chrome console
- [x] User listening pass: every map's ambient↔combat cross-fade is seamless; boss-mid/boss-final swap correctly on Maps 4/9; victory/defeat cues read as triumph/loss

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Replace the `<FILL IN>` placeholders with the actual sizes before running.

- [ ] **Step 4: Report PR URL to user**

Print the URL `gh pr create` returns so the user can review.

---

## Self-Review (run after writing the plan)

**Spec coverage check:**

| Spec section | Implemented by |
|---|---|
| 24 files in scope (20 maps + 2 boss + 2 SFX) | Tasks 3-5 curate, Task 7 converts, Task 8 attributes |
| Per-map vibe table | Tasks 3-4 reference vibe column directly |
| Boss triggers Map 4 → boss-mid, Map 9 → boss-final | Task 1 verifies (no code change needed) |
| Cross-fade pairs share key + tempo | Tasks 3-4 explicit pairing instruction |
| CC0-only license | Tasks 3-5 mandate WebFetch license verification + reject non-CC0 |
| convert-audio.sh boss trim 75s | Task 2 |
| ATTRIBUTIONS.md updates | Task 8 (music section + SFX row updates + placeholder removal) |
| 8 MB bundle cap | Task 7 step 3 (halt + reduce if over) |
| Zero decode errors | Task 9 step 4 |
| User listening pass | Task 10 |
| No AudioManager/BootScene/SettingsOverlay changes | Plan File Inventory + Task 1 confirms no changes |
| Branch off origin/feature/phase-3-tower-system | Done pre-plan (branch already created) |

All spec sections covered.

**Placeholder scan:** Plan contains `<url>`, `<handle>`, `<fill in>`, `<FILL IN>` markers — these are explicit "fill from real value at execution time" tokens, not vague "TODO" placeholders. Each is in a context where the value comes from a clearly-named upstream artifact (the candidate file, `du` output, etc.). Acceptable.

**Type/name consistency:** `BOSS_DURATION` (Task 2) used consistently. `~/Downloads/phase-8b-stage/` used consistently across Tasks 6-7. `boss-mid` / `boss-final` keys match spec + AudioManager + GameScene. ✅

**Ambiguity check:** Tasks 6 and 10 are explicitly user-blocking (subagent yields). Task 7 step 4 covers the over-budget remediation path. Task 10 covers the swap-and-redo loop. No ambiguity found.
