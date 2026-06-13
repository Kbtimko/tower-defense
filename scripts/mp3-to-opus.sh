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

if ! ffmpeg -hide_banner -encoders 2>&1 | grep -qE "^ A[^ ]+ +libopus "; then
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
