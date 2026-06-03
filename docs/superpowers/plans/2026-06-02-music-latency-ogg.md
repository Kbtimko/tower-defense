# Music Latency OGG/Opus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the ~5 second music start-of-level latency by shipping OGG/Opus alongside MP3 fallback. Phaser auto-picks the fastest supported format.

**Architecture:** Single behavior-preserving change to `AudioManager.loadAssets` (string URL → `[ogg, mp3]` array). One new helper script re-encodes existing MP3 audio to OGG/Opus. Existing `convert-audio.sh` is extended for future re-curation runs but is not on the critical path.

**Tech Stack:** Phaser 3.90 (WebAudio backend), Vitest for unit tests, ffmpeg + libopus for transcoding (macOS Homebrew).

**Spec:** [docs/superpowers/specs/2026-06-02-music-latency-ogg-design.md](../specs/2026-06-02-music-latency-ogg-design.md)

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/systems/AudioManager.js` | Modify | One method change in `loadAssets` — array-form URL list |
| `src/systems/AudioManager.test.js` | Modify | One new test asserting array-form load |
| `scripts/mp3-to-opus.sh` | Create | Re-encode existing `public/audio/{music,sfx}/*.mp3` to `*.ogg` |
| `scripts/convert-audio.sh` | Modify | Emit `.ogg` alongside `.mp3` in source-curation pipeline (future-proofing) |
| `public/audio/music/*.ogg` | Generate | 22 new files, ~4 MB total |
| `public/audio/sfx/*.ogg` | Generate | 23 new files, ~0.15 MB total |

---

## Task 1: Add failing test for array-form `loadAssets`

**Files:**
- Modify: `src/systems/AudioManager.test.js`

Existing test file structure (lines 5–10) defines `makeGame()` returning a stub `sound` and `registry`. Task 1 adds a new `describe` block at the bottom of the file. No production code changes yet.

- [ ] **Step 1: Open `src/systems/AudioManager.test.js` and append a new describe block at the bottom of the file**

Add this block AFTER the existing final `describe(...)` closing brace, before EOF. Imports (`describe`, `it`, `expect`, `vi`) and helpers (`makeGame`, `SaveManager`, `AudioManager`) are already imported at the top of the file — do not re-import.

```js
describe('AudioManager.loadAssets', () => {
  it('loads music keys as [ogg, mp3] fallback list', () => {
    const loadAudioSpy = vi.fn();
    const scene = { load: { audio: loadAudioSpy } };
    const am = new AudioManager(makeGame(), new SaveManager());
    am.loadAssets(scene);
    expect(loadAudioSpy).toHaveBeenCalledWith(
      'map-0-ambient',
      ['audio/music/map-0-ambient.ogg', 'audio/music/map-0-ambient.mp3'],
    );
    expect(loadAudioSpy).toHaveBeenCalledWith(
      'boss-final',
      ['audio/music/boss-final.ogg', 'audio/music/boss-final.mp3'],
    );
  });

  it('loads sfx keys as [ogg, mp3] fallback list', () => {
    const loadAudioSpy = vi.fn();
    const scene = { load: { audio: loadAudioSpy } };
    const am = new AudioManager(makeGame(), new SaveManager());
    am.loadAssets(scene);
    expect(loadAudioSpy).toHaveBeenCalledWith(
      'tower-fire-cannon',
      ['audio/sfx/tower-fire-cannon.ogg', 'audio/sfx/tower-fire-cannon.mp3'],
    );
    expect(loadAudioSpy).toHaveBeenCalledWith(
      'ui-click',
      ['audio/sfx/ui-click.ogg', 'audio/sfx/ui-click.mp3'],
    );
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run src/systems/AudioManager.test.js -t "AudioManager.loadAssets"`

Expected: 2 failing tests. The error will look like:

```
AssertionError: expected "spy" to be called with arguments: [ 'map-0-ambient', [Array(2)] ]
Received: [ 'map-0-ambient', 'audio/music/map-0-ambient.mp3' ]
```

This confirms the current implementation passes a string, not an array. Do NOT proceed if tests pass — that would mean the production code was already changed.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/systems/AudioManager.test.js
git commit -m "test(audio): add failing tests for [ogg, mp3] loadAssets format"
```

---

## Task 2: Update `AudioManager.loadAssets` to pass array form

**Files:**
- Modify: `src/systems/AudioManager.js:61-68`

The current `loadAssets` method (lines 61–68 of `src/systems/AudioManager.js`):

```js
loadAssets(scene) {
  for (const key of SFX_KEYS) {
    scene.load.audio(key, `audio/sfx/${key}.mp3`);
  }
  for (const key of MUSIC_KEYS) {
    scene.load.audio(key, `audio/music/${key}.mp3`);
  }
}
```

- [ ] **Step 1: Replace the method body with the array form**

Use Edit to change the method to:

```js
loadAssets(scene) {
  for (const key of SFX_KEYS) {
    scene.load.audio(key, [`audio/sfx/${key}.ogg`, `audio/sfx/${key}.mp3`]);
  }
  for (const key of MUSIC_KEYS) {
    scene.load.audio(key, [`audio/music/${key}.ogg`, `audio/music/${key}.mp3`]);
  }
}
```

Phaser 3 accepts an array URL list to `scene.load.audio` — it inspects browser codec support and fetches the first compatible entry. This is documented Phaser 3 behavior; no other code path needs to know which format won.

- [ ] **Step 2: Run the new tests to verify they pass**

Run: `npx vitest run src/systems/AudioManager.test.js -t "AudioManager.loadAssets"`

Expected: 2 passing tests.

- [ ] **Step 3: Run the full AudioManager test file to verify no regressions**

Run: `npx vitest run src/systems/AudioManager.test.js`

Expected: ALL tests pass (the existing volume/SFX/music tests should be unaffected — none of them assert on `loadAssets`).

- [ ] **Step 4: Run the full suite to verify no other tests regressed**

Run: `npm test -- --run`

Expected: full suite green (currently 468 tests, will now be 470 with the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/systems/AudioManager.js
git commit -m "feat(audio): load music/sfx with [ogg, mp3] fallback list

Phaser auto-selects the fastest browser-supported format.
Opus/OGG decode is 5-10x faster than MP3, fixing the ~5s
music start-of-level latency on modern browsers. iOS Safari
<17.4 keeps the existing MP3 path.

Refs backlog #11."
```

---

## Task 3: Create `scripts/mp3-to-opus.sh` helper

**Files:**
- Create: `scripts/mp3-to-opus.sh`

This script is the primary path for generating the `.ogg` files. It walks `public/audio/{music,sfx}/` and emits a `.ogg` for each `.mp3`, routing by filename prefix to choose the correct Opus bitrate.

- [ ] **Step 1: Verify ffmpeg has libopus available**

Run: `ffmpeg -encoders 2>&1 | grep libopus`

Expected: a line like `A....D libopus              libopus Opus`. If empty, install with `brew install ffmpeg` (macOS) or `apt install ffmpeg` (Linux). Do NOT proceed without libopus — the script will fail otherwise.

- [ ] **Step 2: Write the helper script**

Create file `scripts/mp3-to-opus.sh` with this exact content:

```bash
#!/usr/bin/env bash
# scripts/mp3-to-opus.sh — re-encode existing MP3 audio to OGG/Opus.
#
# Reads public/audio/{music,sfx}/*.mp3 and emits a matching .ogg next to
# each input. Bitrate is chosen by filename prefix:
#   - boss-*  -> Opus 64k (louder mix, longer trim)
#   - map-*   -> Opus 32k (per-map ambient/combat loops)
#   - sfx/*   -> Opus 64k (short, plays often)
#
# Phaser's AudioManager loads music/sfx with [ogg, mp3] arrays — modern
# browsers fetch the smaller, faster-decoding .ogg variant.
#
# Usage: scripts/mp3-to-opus.sh
# Requires: ffmpeg with libopus encoder (brew install ffmpeg).

set -euo pipefail

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "error: ffmpeg not found on PATH. Install with: brew install ffmpeg" >&2
  exit 1
fi

if ! ffmpeg -hide_banner -encoders 2>&1 | grep -q "^.....D libopus"; then
  echo "error: ffmpeg lacks libopus encoder. Reinstall with: brew reinstall ffmpeg" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MUSIC_DIR="$REPO_ROOT/public/audio/music"
SFX_DIR="$REPO_ROOT/public/audio/sfx"

encode_one() {
  local src="$1" bitrate="$2"
  local name out
  name="$(basename "$src" .mp3)"
  out="$(dirname "$src")/$name.ogg"
  ffmpeg -y -loglevel error -i "$src" -ac 1 -c:a libopus -b:a "$bitrate" "$out"
  printf '  %s -> %s\n' "${src#$REPO_ROOT/}" "${out#$REPO_ROOT/}"
}

count=0

shopt -s nullglob
for src in "$MUSIC_DIR"/boss-*.mp3; do
  encode_one "$src" "64k"
  count=$((count + 1))
done
for src in "$MUSIC_DIR"/map-*.mp3; do
  encode_one "$src" "32k"
  count=$((count + 1))
done
for src in "$SFX_DIR"/*.mp3; do
  encode_one "$src" "64k"
  count=$((count + 1))
done
shopt -u nullglob

echo
echo "encoded $count file(s) to OGG/Opus"
```

- [ ] **Step 3: Make the script executable**

Run: `chmod +x scripts/mp3-to-opus.sh`

- [ ] **Step 4: Verify the script runs cleanly on a dry inventory check (no execution yet)**

Run: `bash -n scripts/mp3-to-opus.sh && echo "syntax ok"`

Expected: `syntax ok`

- [ ] **Step 5: Commit the script**

```bash
git add scripts/mp3-to-opus.sh
git commit -m "build(audio): add mp3-to-opus.sh helper

Re-encodes existing public/audio/{music,sfx}/*.mp3 to matching
.ogg files using Opus codec. Bitrate routing by filename prefix
(boss-/map-/sfx). Idempotent — safe to re-run."
```

---

## Task 4: Generate `.ogg` files and commit them

**Files:**
- Generate: `public/audio/music/*.ogg` (22 files)
- Generate: `public/audio/sfx/*.ogg` (23 files)

- [ ] **Step 1: Take a baseline of the audio bundle size**

Run: `du -sh public/audio/music public/audio/sfx`

Record the output. Expected baseline: `~10M public/audio/music` and `~256K public/audio/sfx` (or thereabouts). This anchors the bundle-size check in Step 4.

- [ ] **Step 2: Run the helper**

Run: `./scripts/mp3-to-opus.sh`

Expected output: 45 `mp3 -> ogg` lines (22 music + 23 sfx) followed by `encoded 45 file(s) to OGG/Opus`. Each ffmpeg invocation takes 1–3 seconds; whole run ~1–2 min.

- [ ] **Step 3: Verify the files exist and counts match**

Run: `ls public/audio/music/*.ogg | wc -l && ls public/audio/sfx/*.ogg | wc -l`

Expected: `22` and `23` (one per source MP3).

- [ ] **Step 4: Verify bundle size is in spec range**

Run: `du -sh public/audio/music public/audio/sfx`

Expected: music dir grew by ~4 MB (now ~14 MB total), sfx dir grew by ~150 KB. If music dir grew by more than 6 MB, something went wrong with bitrate — investigate before committing.

- [ ] **Step 5: Spot-check one OGG file plays correctly**

Run: `ffprobe -hide_banner public/audio/music/map-0-ambient.ogg 2>&1 | grep -E "(Audio|Duration)"`

Expected output should contain:
- `Duration: 00:01:00.xx` (or close — depends on source trim)
- `Audio: opus, 48000 Hz, mono` (or `stereo` if source was stereo)

If `Audio:` shows anything other than `opus`, the encoder substituted a fallback codec — abort and re-check Step 1 of Task 3.

- [ ] **Step 6: Commit the generated files**

```bash
git add public/audio/music/*.ogg public/audio/sfx/*.ogg
git commit -m "feat(audio): add OGG/Opus variants of all music + sfx (~4.2 MB)

Generated via scripts/mp3-to-opus.sh from existing MP3 source files.
Music tracks: 32k Opus (~4 MB total). Boss themes: 64k Opus.
SFX: 64k Opus (~150 KB total). Phaser loads ogg + mp3 array and
picks the supported format per browser."
```

---

## Task 5: Extend `scripts/convert-audio.sh` with OGG/Opus pass (future-proofing)

**Files:**
- Modify: `scripts/convert-audio.sh`

This task extends the source-curation pipeline so the next time a fresh WAV/FLAC source set lands, both `.mp3` and `.ogg` are produced in one pass. Not on the critical path for the latency fix — `Task 4` already shipped the .ogg files — but matches the spec's "primary path AND future-proofing" structure.

- [ ] **Step 1: Read the current script to anchor line context**

Run: `cat scripts/convert-audio.sh`

Note the existing bitrate constants block (currently `SFX_BITRATE`, `MUSIC_BITRATE`, `BOSS_BITRATE`, `MUSIC_DURATION`, `BOSS_DURATION`).

- [ ] **Step 2: Add Opus bitrate constants**

Use Edit to add three new constants directly AFTER the existing `BOSS_DURATION="75"` line:

OLD:
```bash
BOSS_DURATION="75"
```

NEW:
```bash
BOSS_DURATION="75"

# Opus/OGG variants — emitted alongside MP3. Modern browsers fetch
# these (faster decode); MP3 stays as Safari <17.4 fallback.
SFX_OPUS_BITRATE="64k"
MUSIC_OPUS_BITRATE="32k"
BOSS_OPUS_BITRATE="64k"
```

- [ ] **Step 3: Add a second ffmpeg invocation in each case branch**

The existing `case "$name" in` block has three branches (`map-*`, `boss-*`, default). For each branch, add a second `ffmpeg` line emitting `.ogg` immediately AFTER the existing MP3 line. Use Edit one branch at a time.

For the `map-*` branch:

OLD:
```bash
    map-*)
      out="$MUSIC_OUT/$name.mp3"
      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$MUSIC_BITRATE" -t "$MUSIC_DURATION" "$out"
      ;;
```

NEW:
```bash
    map-*)
      out="$MUSIC_OUT/$name.mp3"
      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$MUSIC_BITRATE" -t "$MUSIC_DURATION" "$out"
      ffmpeg -y -loglevel error -i "$src" -ac 1 -c:a libopus -b:a "$MUSIC_OPUS_BITRATE" -t "$MUSIC_DURATION" "$MUSIC_OUT/$name.ogg"
      ;;
```

For the `boss-*` branch:

OLD:
```bash
    boss-*)
      out="$MUSIC_OUT/$name.mp3"
      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$BOSS_BITRATE" -t "$BOSS_DURATION" "$out"
      ;;
```

NEW:
```bash
    boss-*)
      out="$MUSIC_OUT/$name.mp3"
      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$BOSS_BITRATE" -t "$BOSS_DURATION" "$out"
      ffmpeg -y -loglevel error -i "$src" -ac 1 -c:a libopus -b:a "$BOSS_OPUS_BITRATE" -t "$BOSS_DURATION" "$MUSIC_OUT/$name.ogg"
      ;;
```

For the default (SFX) branch:

OLD:
```bash
    *)
      out="$SFX_OUT/$name.mp3"
      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$SFX_BITRATE" "$out"
      ;;
```

NEW:
```bash
    *)
      out="$SFX_OUT/$name.mp3"
      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$SFX_BITRATE" "$out"
      ffmpeg -y -loglevel error -i "$src" -ac 1 -c:a libopus -b:a "$SFX_OPUS_BITRATE" "$SFX_OUT/$name.ogg"
      ;;
```

- [ ] **Step 4: Verify the script still parses**

Run: `bash -n scripts/convert-audio.sh && echo "syntax ok"`

Expected: `syntax ok`

- [ ] **Step 5: Commit**

```bash
git add scripts/convert-audio.sh
git commit -m "build(audio): emit OGG/Opus alongside MP3 in convert pipeline

Future re-curation runs now produce both formats in one ffmpeg pass.
Matches the OGG file set already shipped via scripts/mp3-to-opus.sh."
```

---

## Task 6: Browser verification

**Files:** none (manual verification + final summary commit if needed)

This task confirms the end-user experience matches the spec target (< 500 ms time-to-music in modern browsers).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

Expected: Vite starts, prints a `Local:` URL (typically `http://localhost:5173/`).

- [ ] **Step 2: Open the app in Chrome with DevTools**

In Chrome (modern — version ≥ 80), navigate to the URL from Step 1. Open DevTools → Network tab. Filter to `media` (the filter chip row above the list).

- [ ] **Step 3: Verify OGG files are requested, not MP3**

Click anywhere in the boot/menu flow to trigger preload (or refresh the page with DevTools open). In the Network panel, you should see audio requests with `.ogg` extensions (NOT `.mp3`). If you see `.mp3` requests for music keys in a modern Chrome, the array-form load isn't working — debug before continuing.

- [ ] **Step 4: Time-to-music measurement**

Pick any map card on MapSelectScene. Start a stopwatch (or watch DevTools' Performance recording) at the moment GameScene starts rendering (the bottom HUD appears). Music should begin within 500 ms.

If the latency is still > 1 s in Chrome, the OGG decode isn't kicking in. Possible causes:
- `.ogg` files weren't generated (re-run Task 4)
- Phaser failed to parse the array form (check console for warnings)
- Wrong codec inside the OGG container (re-run Task 4 Step 5 ffprobe check)

- [ ] **Step 5: Repeat on a second map**

Return to MapSelect (in-level Exit button), pick a different map. Confirm sub-500 ms music start again. This rules out any first-load caching artifact.

- [ ] **Step 6: Update the backlog**

Edit `.claude/notes.md`. Remove backlog item #11 ("Remove music start-of-level latency"). Move it to the Completed section with today's date:

```
- ~~Music start-of-level latency fix: OGG/Opus dual-format load, <500ms time-to-music in modern browsers~~ (2026-06-02)
```

Backlog items #12 (menu music) and #5 / #6 / etc. renumber accordingly — or just leave the numbers as-is if cleanup is happening per-item.

- [ ] **Step 7: Commit the notes update**

```bash
git add .claude/notes.md
git commit -m "chore(notes): backlog #11 music latency shipped"
```

---

## Self-review notes

- **Spec coverage:** Tasks 1–2 cover the AudioManager change. Tasks 3–4 cover the generated OGG files. Task 5 covers the script extension. Task 6 covers the browser verification. ATTRIBUTIONS.md is explicitly "no change required" in the spec. All sections accounted for.
- **Type/signature consistency:** `loadAssets` signature unchanged. `scene.load.audio(key, urls)` accepts string OR string[] in Phaser 3 — both call sites in Task 2 use the array form consistently.
- **Bitrate consistency:** Music = 32k Opus, Boss = 64k Opus, SFX = 64k Opus appears identically in Tasks 3, 4, 5.
- **No placeholders:** Every step has either a full code block, an exact command, or a specific edit instruction with OLD/NEW pairs.
- **Idempotency:** `mp3-to-opus.sh` uses `ffmpeg -y` (overwrite); safe to re-run if interrupted. Task 4 Step 2 can be repeated.
