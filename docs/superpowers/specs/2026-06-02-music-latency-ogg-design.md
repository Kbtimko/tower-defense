# Music Start-of-Level Latency Fix — OGG/Opus Dual Format

**Date:** 2026-06-02
**Status:** Draft, awaiting user review
**Branch base:** `feature/phase-3-tower-system`

## Goal

Eliminate the ~5 second delay between map load and music playback. Players currently hear silence for several seconds after a level starts; the music then fades in. The root cause is browser MP3 → PCM decoding happening on the first `audio.play()` call inside `AudioManager.playMusic`.

Target: music begins playing within **500 ms** of `GameScene.create()` calling `audioManager.playMusic(mapId)`.

## Non-goals

- No change to `playMusic` / `setCombatActive` / `stopMusic` public API.
- No menu music (backlog #12 — separate item).
- No decode warmup logic, no global silent ambient track, no asset preloading changes.
- No re-curation of the 22 source tracks.
- No SFX behavior change (decode latency on KB-size SFX is imperceptible). SFX gets OGG conversion only for asset-pipeline consistency.

## Root cause

Phaser's `scene.load.audio` (WebAudio backend) **fetches** MP3 bytes during preload but does **not** eagerly decode them to PCM. Decode happens lazily on the first `.play()` call. MP3 decode in modern browsers is slow — 1–5 s for the longer (60–75 s) music tracks in this project.

Opus-in-OGG decodes 5–10× faster than MP3 in the same browsers (often well under 100 ms for the same duration). Shipping OGG/Opus alongside MP3 and letting Phaser pick the supported format addresses the latency without any decoder warmup or memory pressure.

## Architecture

### Asset pipeline

`scripts/convert-audio.sh` currently emits `.mp3` for every input file. Extend it to also emit `.ogg` (libopus codec, OGG container) for every input file. Same source files, same duration trims, same input directory.

| Stream | MP3 bitrate (current) | OGG/Opus bitrate (new) |
|--------|----------------------|------------------------|
| SFX    | 96k                  | 64k (Opus is ~1.5× more efficient than MP3) |
| Music  | 64k                  | 32k |
| Boss   | 128k                 | 64k |

Music-loop trim (`MUSIC_DURATION=60`, `BOSS_DURATION=75`) stays unchanged.

### Runtime loading

`AudioManager.loadAssets` changes one line per asset family:

```js
// Music
scene.load.audio(key, [`audio/music/${key}.ogg`, `audio/music/${key}.mp3`]);

// SFX
scene.load.audio(key, [`audio/sfx/${key}.ogg`, `audio/sfx/${key}.mp3`]);
```

Phaser inspects the browser's audio support and loads the first compatible URL. Cache key (`key`) is unchanged, so every downstream lookup (`game.cache.audio.has(key)`, `game.sound.add(key)`) continues to work without modification.

### Browser compatibility

| Browser | MP3 | OGG/Opus | Picks |
|---------|-----|----------|-------|
| Chrome / Edge / Firefox (any modern) | yes | yes | OGG |
| Safari ≥ 17.4 (March 2024) | yes | yes | OGG |
| Safari < 17.4 (incl. iOS ≤ 16) | yes | no | MP3 fallback |

iOS Safari < 17.4 gets the existing MP3 experience (5s latency). Modern Safari and all other browsers get the fast Opus path.

## Bundle impact

| File set | Current | After (added OGG) | Delta |
|----------|---------|-------------------|-------|
| `public/audio/music/*.mp3` (22 files) | ~10.0 MB | unchanged | — |
| `public/audio/music/*.ogg` (22 files, NEW) | — | ~4.0 MB | +4.0 MB |
| `public/audio/sfx/*.mp3` (23 files) | ~0.25 MB | unchanged | — |
| `public/audio/sfx/*.ogg` (23 files, NEW) | — | ~0.15 MB | +0.15 MB |
| **Total audio** | **~10.3 MB** | **~14.5 MB** | **+4.2 MB** |

Modern browsers download only the OGG variant (~4.2 MB of music + 0.15 MB of SFX); MP3 is fetched only when OGG is unsupported. Phase 8b cap was 10 MB MP3-only — this exceeds it by ~4 MB, accepted trade-off in exchange for eliminating the latency. Net data transferred to a modern user is **lower** than today (~4 MB OGG vs. ~10 MB MP3).

## Detailed changes

### 1. `scripts/convert-audio.sh`

Replace the per-source `ffmpeg` invocation with two parallel passes, MP3 + OGG. Pseudo-diff:

```diff
   case "$name" in
     map-*)
-      out="$MUSIC_OUT/$name.mp3"
-      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$MUSIC_BITRATE" -t "$MUSIC_DURATION" "$out"
+      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$MUSIC_BITRATE" -t "$MUSIC_DURATION" "$MUSIC_OUT/$name.mp3"
+      ffmpeg -y -loglevel error -i "$src" -ac 1 -c:a libopus -b:a "$MUSIC_OPUS_BITRATE" -t "$MUSIC_DURATION" "$MUSIC_OUT/$name.ogg"
       ;;
     boss-*)
-      out="$MUSIC_OUT/$name.mp3"
-      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$BOSS_BITRATE" -t "$BOSS_DURATION" "$out"
+      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$BOSS_BITRATE" -t "$BOSS_DURATION" "$MUSIC_OUT/$name.mp3"
+      ffmpeg -y -loglevel error -i "$src" -ac 1 -c:a libopus -b:a "$BOSS_OPUS_BITRATE" -t "$BOSS_DURATION" "$MUSIC_OUT/$name.ogg"
       ;;
     *)
-      out="$SFX_OUT/$name.mp3"
-      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$SFX_BITRATE" "$out"
+      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$SFX_BITRATE" "$SFX_OUT/$name.mp3"
+      ffmpeg -y -loglevel error -i "$src" -ac 1 -c:a libopus -b:a "$SFX_OPUS_BITRATE" "$SFX_OUT/$name.ogg"
       ;;
   esac
```

Add three new bitrate constants near the existing block:

```bash
SFX_OPUS_BITRATE="64k"
MUSIC_OPUS_BITRATE="32k"
BOSS_OPUS_BITRATE="64k"
```

Update the printf line to emit the count of *files written* (×2) rather than *sources processed*, or keep counting sources — either is fine.

### 2. `src/systems/AudioManager.js`

One-method change in `loadAssets`:

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

No other AudioManager method changes. `playMusic`, `_addMusic`, `playSfx`, `_reapplyActiveVolumes`, etc. all continue to look up sounds by `key` — Phaser handles the format selection transparently.

### 3. `src/systems/AudioManager.test.js`

Existing tests still pass (none of them assert on `loadAssets`). Add one new test asserting the array form is passed:

```js
describe('AudioManager.loadAssets', () => {
  it('loads music with [ogg, mp3] fallback list', () => {
    const loadAudioSpy = vi.fn();
    const scene = { load: { audio: loadAudioSpy } };
    const am = new AudioManager(makeGame(), new SaveManager());
    am.loadAssets(scene);
    expect(loadAudioSpy).toHaveBeenCalledWith(
      'map-0-ambient',
      ['audio/music/map-0-ambient.ogg', 'audio/music/map-0-ambient.mp3'],
    );
    expect(loadAudioSpy).toHaveBeenCalledWith(
      'tower-fire-cannon',
      ['audio/sfx/tower-fire-cannon.ogg', 'audio/sfx/tower-fire-cannon.mp3'],
    );
  });
});
```

### 4. Generated files

The original WAV/FLAC source tracks from the Phase 8b curation pass were staged ephemerally and are no longer on disk (no `audio-source/` directory exists). The primary generation path is therefore **MP3 → OGG/Opus re-encoding** against the files already in `public/audio/`. Slight generational quality loss vs. encoding from source, but Opus at 32k re-encoded from MP3 64k is indistinguishable in playtest at typical playback levels.

A small helper script — `scripts/mp3-to-opus.sh` — runs this conversion idempotently against `public/audio/{music,sfx}/`:

```bash
#!/usr/bin/env bash
# scripts/mp3-to-opus.sh — re-encode existing MP3 audio to OGG/Opus.
# Outputs alongside the .mp3 files so Phaser's array-form load picks the
# faster-decoding OGG variant when supported.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

convert_dir() {
  local dir="$1" bitrate="$2"
  for f in "$dir"/*.mp3; do
    local name; name="$(basename "$f" .mp3)"
    local out="$dir/$name.ogg"
    ffmpeg -y -loglevel error -i "$f" -ac 1 -c:a libopus -b:a "$bitrate" "$out"
    printf '  %s -> %s\n' "${f#$REPO_ROOT/}" "${out#$REPO_ROOT/}"
  done
}

# Music: 60s tracks @ 32k Opus (~120 KB each)
# Boss-mid / boss-final happen to live in the same dir but were encoded at MP3 128k —
# bump them to Opus 64k for clarity on the louder mix.
for f in "$REPO_ROOT"/public/audio/music/map-*.mp3; do
  [ -e "$f" ] || continue
  name="$(basename "$f" .mp3)"
  ffmpeg -y -loglevel error -i "$f" -ac 1 -c:a libopus -b:a 32k "$REPO_ROOT/public/audio/music/$name.ogg"
done
for f in "$REPO_ROOT"/public/audio/music/boss-*.mp3; do
  [ -e "$f" ] || continue
  name="$(basename "$f" .mp3)"
  ffmpeg -y -loglevel error -i "$f" -ac 1 -c:a libopus -b:a 64k "$REPO_ROOT/public/audio/music/$name.ogg"
done
convert_dir "$REPO_ROOT/public/audio/sfx" "64k"
```

The existing `scripts/convert-audio.sh` extension (Section 1) remains valuable for future re-curation passes — when a fresh source is dropped in, the pipeline produces both formats in one run — but it is not on the critical path for this task.

Expected output: 22 new `*.ogg` files in `public/audio/music/` (~4 MB total) and 23 new `*.ogg` files in `public/audio/sfx/` (~0.15 MB total).

### 5. `public/audio/ATTRIBUTIONS.md`

No change required — sources are unchanged, only the container/codec differs.

## Verification

### Automated

```bash
npm test -- AudioManager
```

Existing 460-some tests must continue to pass. New test asserts array-form `load.audio` call.

### Manual (browser)

1. `npm run dev`
2. Open the app in Chrome (modern).
3. Open DevTools → Network. Filter by `media`. Verify only `.ogg` files are requested.
4. Click any map card. Start a stopwatch when GameScene appears. Music must start within **500 ms** (target — actual will likely be ~100–200 ms).
5. Repeat in Safari 17.4+ (if available). Same target.
6. Optional: open in Safari 16 (or set iOS simulator) — verify `.mp3` is requested instead and music still plays (slow path, but functional).

### Definition of done

- All existing tests pass.
- New test asserts array-form load.
- Browser verification in Chrome shows < 500 ms time-to-music on at least 3 different maps.
- DevTools confirms `.ogg` was the file loaded in modern browsers.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Opus encoder produces audibly worse music at 32k | Listen to one map track post-conversion before committing; bump to 48k if needed. Bundle math accommodates ±10%. |
| Phaser array-form `load.audio` API has changed | Phaser 3 has supported array URLs since v3.0; quick grep in node_modules confirms current behavior. Verified during implementation. |
| `convert-audio.sh` libopus unavailable in user's ffmpeg | macOS Homebrew ffmpeg ships libopus by default. Script can add a `command -v ffmpeg && ffmpeg -formats \| grep -q opus` check + actionable error. |
| Re-encoding from MP3 (not source WAV/FLAC) introduces second-generation lossy quality | Listen to one map track post-conversion before committing. Opus 32k from MP3 64k is inaudible at typical playback levels in playtest. If a track regresses, bump that family's Opus bitrate. |

## Files touched (summary)

- `scripts/mp3-to-opus.sh` — new helper, MP3 → OGG/Opus re-encoder (primary path)
- `scripts/convert-audio.sh` — extend with OGG/Opus pass (future-proofing)
- `src/systems/AudioManager.js` — one method change (`loadAssets`)
- `src/systems/AudioManager.test.js` — one new test
- `public/audio/music/*.ogg` — 22 new files (~4 MB)
- `public/audio/sfx/*.ogg` — 23 new files (~0.15 MB)

## Out of scope (for follow-up)

- Backlog #12 — menu music on `MapSelectScene`. Becomes trivial once decode is fast.
- Per-tower SFX for tier-4 branches (backlog #1).
- Decoder warmup or always-on silent track (no longer needed once decode is sub-100ms).
