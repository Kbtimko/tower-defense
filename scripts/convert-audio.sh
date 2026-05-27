#!/usr/bin/env bash
# Batch-convert CC0 source audio (WAV / FLAC / OGG / MP3) into the project's
# expected mono MP3 format and place them in public/audio/{sfx,music}/.
#
# Usage:
#   scripts/convert-audio.sh <source-dir>
#
# The source dir should contain files named EXACTLY as the target filenames
# (e.g. tower-fire-archer.wav, map-0-ambient.flac). The script preserves the
# base name and writes <name>.mp3 to public/audio/sfx/ or public/audio/music/.
#
# SFX vs music routing: anything whose basename starts with "map-" or "boss-"
# is treated as music (longer lifespan, higher bitrate). Everything else is SFX.
#
# Requirements: ffmpeg on PATH. Install via `brew install ffmpeg` on macOS.

set -euo pipefail

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "error: ffmpeg not found on PATH. Install with: brew install ffmpeg" >&2
  exit 1
fi

if [ $# -lt 1 ]; then
  echo "usage: $0 <source-dir>" >&2
  exit 2
fi

SRC_DIR="$1"
if [ ! -d "$SRC_DIR" ]; then
  echo "error: $SRC_DIR is not a directory" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SFX_OUT="$REPO_ROOT/public/audio/sfx"
MUSIC_OUT="$REPO_ROOT/public/audio/music"
mkdir -p "$SFX_OUT" "$MUSIC_OUT"

SFX_BITRATE="96k"
MUSIC_BITRATE="96k"
BOSS_BITRATE="128k"
# Music loops trimmed to 60s to control file size; tweak per-track if needed.
MUSIC_DURATION="60"

shopt -s nullglob
converted=0
for src in "$SRC_DIR"/*.{wav,WAV,flac,FLAC,ogg,OGG,mp3,MP3,m4a,M4A}; do
  base="$(basename "$src")"
  name="${base%.*}"

  case "$name" in
    map-*)
      out="$MUSIC_OUT/$name.mp3"
      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$MUSIC_BITRATE" -t "$MUSIC_DURATION" "$out"
      ;;
    boss-*)
      out="$MUSIC_OUT/$name.mp3"
      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$BOSS_BITRATE" -t "$MUSIC_DURATION" "$out"
      ;;
    *)
      out="$SFX_OUT/$name.mp3"
      ffmpeg -y -loglevel error -i "$src" -ac 1 -b:a "$SFX_BITRATE" "$out"
      ;;
  esac

  printf '  %-30s -> %s\n' "$base" "${out#$REPO_ROOT/}"
  converted=$((converted + 1))
done
shopt -u nullglob

if [ "$converted" -eq 0 ]; then
  echo "warning: no audio source files found in $SRC_DIR" >&2
  exit 0
fi

echo
echo "converted $converted file(s)"
echo "audio size: $(du -sh "$REPO_ROOT/public/audio/" | cut -f1)"
