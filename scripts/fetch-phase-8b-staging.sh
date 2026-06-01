#!/usr/bin/env bash
# Phase 8b — automated staging downloader.
# Scrapes freesound HQ preview MP3s (CC0, no auth) + opengameart direct WAV,
# saves each to ~/Downloads/phase-8b-stage/<target>.<ext>. convert-audio.sh
# re-encodes to 96k mono regardless, so the 320k stereo preview is fine.
#
# Usage: scripts/fetch-phase-8b-staging.sh
#
# Idempotent: skips files that already exist with size >0.

set -uo pipefail

STAGE_DIR="${HOME}/Downloads/phase-8b-stage"
mkdir -p "$STAGE_DIR"

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

# Format: <target-basename>|<source-page-url>|<kind>
# kind: "freesound" → scrape HQ preview MP3
#       "ogadirect"  → direct WAV from opengameart page
ENTRIES=(
  "map-0-ambient|https://freesound.org/people/DylanTheFish/sounds/442181/|freesound"
  "map-0-combat|https://freesound.org/people/Seth_Makes_Sounds/sounds/713035/|freesound"
  "map-1-ambient|https://freesound.org/people/deadrobotmusic/sounds/808032/|freesound"
  "map-1-combat|https://freesound.org/people/deadrobotmusic/sounds/664150/|freesound"
  "map-2-ambient|https://freesound.org/people/szegvari/sounds/574537/|freesound"
  "map-2-combat|https://freesound.org/people/DaveN/sounds/269399/|freesound"
  "map-3-ambient|https://freesound.org/people/Sonicfreak/sounds/174450/|freesound"
  "map-3-combat|https://freesound.org/people/Magmi.Soundtracks/sounds/476556/|freesound"
  "map-4-ambient|https://freesound.org/people/pryanic/sounds/777335/|freesound"
  "map-4-combat|https://freesound.org/people/burning-mir/sounds/155139/|freesound"
  "map-5-ambient|https://freesound.org/people/LookIMadeAThing/sounds/534018/|freesound"
  "map-5-combat|https://freesound.org/people/Seth_Makes_Sounds/sounds/702337/|freesound"
  "map-6-ambient|https://freesound.org/people/Zeraora/sounds/726006/|freesound"
  "map-6-combat|https://freesound.org/people/awrmacd/sounds/387223/|freesound"
  "map-7-ambient|https://freesound.org/people/MarkAllentheProducer/sounds/758233/|freesound"
  "map-7-combat|https://freesound.org/people/Vospi/sounds/368146/|freesound"
  "map-8-ambient|https://freesound.org/people/+frame+/sounds/837364/|freesound"
  "map-8-combat|https://freesound.org/people/furbyguy/sounds/331869/|freesound"
  "map-9-ambient|https://freesound.org/people/Aemyn/sounds/609250/|freesound"
  "map-9-combat|https://freesound.org/people/Seth_Makes_Sounds/sounds/685334/|freesound"
  "boss-mid|https://freesound.org/people/Seth_Makes_Sounds/sounds/683457/|freesound"
  "boss-final|https://opengameart.org/content/determined-pursuit-epic-orchestra-loop|ogadirect"
  "victory|https://freesound.org/people/el_boss/sounds/677858/|freesound"
  "defeat|https://freesound.org/people/Wagna/sounds/242208/|freesound"
)

ok=0
skipped=0
failed=0
failed_list=()

for entry in "${ENTRIES[@]}"; do
  IFS='|' read -r target page_url kind <<< "$entry"

  case "$kind" in
    freesound) ext="mp3" ;;
    ogadirect) ext="wav" ;;
    *)         ext="bin" ;;
  esac

  out="$STAGE_DIR/${target}.${ext}"

  if [ -s "$out" ]; then
    printf '  [skip] %s already present (%s)\n' "$target" "$(du -h "$out" | cut -f1)"
    skipped=$((skipped + 1))
    continue
  fi

  case "$kind" in
    freesound)
      asset_url=$(curl -sL -A "$UA" "$page_url" | grep -oE 'https://cdn\.freesound\.org/previews/[0-9]+/[0-9]+_[0-9]+-hq\.mp3' | head -1)
      ;;
    ogadirect)
      asset_url=$(curl -sL -A "$UA" "$page_url" | grep -oE 'https://opengameart\.org/sites/default/files/[^"]+\.(wav|mp3|ogg|flac)' | grep -v audio_preview | head -1)
      ;;
  esac

  if [ -z "$asset_url" ]; then
    printf '  [FAIL] %s — could not resolve asset URL from %s\n' "$target" "$page_url"
    failed=$((failed + 1))
    failed_list+=("$target")
    continue
  fi

  if curl -sL -A "$UA" -f -o "$out" "$asset_url"; then
    printf '  [ok]   %-20s <- %s\n' "$target" "$asset_url"
    ok=$((ok + 1))
  else
    printf '  [FAIL] %s — download error from %s\n' "$target" "$asset_url"
    rm -f "$out"
    failed=$((failed + 1))
    failed_list+=("$target")
  fi
done

echo
printf 'summary: ok=%d, skipped=%d, failed=%d\n' "$ok" "$skipped" "$failed"
echo "stage dir: $STAGE_DIR"
echo "size: $(du -sh "$STAGE_DIR" 2>/dev/null | cut -f1)"

if [ "$failed" -gt 0 ]; then
  echo
  echo "failed targets:"
  for f in "${failed_list[@]}"; do
    echo "  - $f"
  done
  exit 1
fi
