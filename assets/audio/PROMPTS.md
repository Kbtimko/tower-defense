# Phase 8b Remaining SFX — Curation Checklist

Deferred audio assets for backlog #1. The code derives these keys today and falls
back to the base sound until each file exists AND its key is registered in
`SFX_KEYS` (`src/systems/AudioManager.js`). See
`src/systems/sfxKeys.js` for the derivation.

## How to add a sound

1. Source a CC0 clip (Kenney CC0 packs: https://kenney.nl/assets — see
   `public/audio/ATTRIBUTIONS.md` for the packs already used).
2. Convert/normalize via `scripts/convert-audio.sh` to `public/audio/sfx/<key>.mp3`.
3. Add `<key>` to the `SFX_KEYS` array in `src/systems/AudioManager.js`.
4. Add a credit line to `public/audio/ATTRIBUTIONS.md`.

No call-site changes are needed — the helpers pick the key up automatically.

## Tower fire — 10 files (per Tier-4 branch)

| Key | Tower branch | Character to convey |
|-----|--------------|---------------------|
| `tower-fire-archer-A.mp3`  | Volley       | rapid multi-arrow flurry |
| `tower-fire-archer-B.mp3`  | Marksman     | single heavy long-range thwip |
| `tower-fire-mage-A.mp3`    | Archmage     | crackling chain-lightning zap |
| `tower-fire-mage-B.mp3`    | Frost Mage   | icy AoE frost burst |
| `tower-fire-cannon-A.mp3`  | Artillery    | deep boom, shell-splitting |
| `tower-fire-cannon-B.mp3`  | Rapid Cannon | fast light cannon pops |
| `tower-fire-ice-A.mp3`     | Permafrost   | sustained freezing hiss |
| `tower-fire-ice-B.mp3`     | Shatter      | sharp ice-crack snap |
| `tower-fire-sniper-A.mp3`  | Assassin     | suppressed precision shot |
| `tower-fire-sniper-B.mp3`  | Rapid Fire   | fast repeated rifle cracks |

## Enemy hit — 6 files (per enemy type)

| Key | Enemy | Character to convey |
|-----|-------|---------------------|
| `enemy-hit-drone.mp3`    | drone    | light metallic ping |
| `enemy-hit-skitter.mp3`  | skitter  | small chitinous crunch |
| `enemy-hit-brute.mp3`    | brute    | heavy fleshy thud |
| `enemy-hit-colossus.mp3` | colossus | massive armored clang |
| `enemy-hit-phantom.mp3`  | phantom  | ethereal warped impact |
| `enemy-hit-titan.mp3`    | titan    | deep resonant boss hit |
