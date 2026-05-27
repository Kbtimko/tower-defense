# Audio Asset Attributions

All audio assets in `public/audio/` are licensed CC0 (public domain). Attribution
is not legally required under CC0 but is recorded here for traceability.

If you ever add a CC-BY asset, update its row's License column AND add the
required attribution text below.

## SFX (`public/audio/sfx/`)

23 mono MP3s at 96 kbps. Total size: 248 KB.

| File | Source pack | Source filename | License |
|---|---|---|---|
| `tower-fire-archer.mp3`     | Kenney Sci-Fi Sounds | `laserSmall_000.ogg`             | CC0 |
| `tower-fire-cannon.mp3`     | Kenney Sci-Fi Sounds | `impactMetal_002.ogg`            | CC0 |
| `tower-fire-mage.mp3`       | Kenney Sci-Fi Sounds | `laserRetro_002.ogg`             | CC0 |
| `tower-fire-ice.mp3`        | Kenney Sci-Fi Sounds | `forceField_000.ogg`             | CC0 |
| `tower-fire-sniper.mp3`     | Kenney Sci-Fi Sounds | `laserLarge_000.ogg`             | CC0 |
| `tower-fire-barracks.mp3`   | Kenney Sci-Fi Sounds | `impactMetal_004.ogg`            | CC0 |
| `tower-place.mp3`           | Kenney UI Audio      | `mouseclick1.ogg`                | CC0 |
| `tower-upgrade.mp3`         | Kenney UI Audio      | `switch33.ogg`                   | CC0 |
| `tower-sell.mp3`            | Kenney UI Audio      | `mouserelease1.ogg`              | CC0 |
| `enemy-hit.mp3`             | Kenney Sci-Fi Sounds | `impactMetal_001.ogg`            | CC0 |
| `enemy-death-small.mp3`     | Kenney Sci-Fi Sounds | `explosionCrunch_000.ogg`        | CC0 |
| `enemy-death-large.mp3`     | Kenney Sci-Fi Sounds | `explosionCrunch_004.ogg`        | CC0 |
| `hero-attack.mp3`           | Kenney Sci-Fi Sounds | `impactMetal_003.ogg`            | CC0 |
| `hero-death.mp3`            | Kenney Sci-Fi Sounds | `lowFrequency_explosion_000.ogg` | CC0 |
| `hero-respawn.mp3`          | Kenney Sci-Fi Sounds | `forceField_002.ogg`             | CC0 |
| `hero-overcharge.mp3`       | Kenney Sci-Fi Sounds | `forceField_004.ogg`             | CC0 |
| `hero-airstrike.mp3`        | Kenney Sci-Fi Sounds | `lowFrequency_explosion_001.ogg` | CC0 |
| `hero-emp.mp3`              | Kenney Sci-Fi Sounds | `laserRetro_004.ogg`             | CC0 |
| `wave-start.mp3`            | Kenney UI Audio      | `switch20.ogg`                   | CC0 |
| `life-lost.mp3`             | Kenney Sci-Fi Sounds | `explosionCrunch_003.ogg`        | CC0 |
| `victory.mp3`               | Kenney UI Audio      | `switch38.ogg`                   | CC0 |
| `defeat.mp3`                | Kenney UI Audio      | `switch1.ogg`                    | CC0 |
| `ui-click.mp3`              | Kenney UI Audio      | `click3.ogg`                     | CC0 |

**Source URLs:**
- Kenney Sci-Fi Sounds: https://kenney.nl/assets/sci-fi-sounds
- Kenney UI Audio:     https://kenney.nl/assets/ui-audio

**Known placeholders:** `victory.mp3` and `defeat.mp3` are short UI switch sounds —
neither pack ships a true fanfare/error tone. Replace with dedicated CC0 jingles
when curated.

## Music (`public/audio/music/`)

**Status: not yet curated.** 22 mono MP3s expected (10 maps × 2 + 2 boss themes).
Each ambient/combat pair within a map should share key and tempo so the in-game
cross-fade is seamless. Target ≤200 KB each (≤250 KB for boss themes), total
audio budget ≤5 MB.

Suggested source: freesound.org filtered to License = CC0. Filename schema must
match `MUSIC_KEYS` in `src/systems/AudioManager.js`:

```
map-0-ambient.mp3   map-0-combat.mp3
map-1-ambient.mp3   map-1-combat.mp3
... (through map-9)
boss-mid.mp3
boss-final.mp3
```

## Notes for future contributors

- **License check:** every file must be CC0 / public domain. Kenney.nl is CC0
  by default; freesound.org filter to CC0 explicitly.
- **Naming:** filenames must match `SFX_KEYS` and `MUSIC_KEYS` in
  `src/systems/AudioManager.js`. The loader uses the bare key.
- **Conversion:** use `scripts/convert-audio.sh` to batch-convert from a working
  directory of `.wav` / `.flac` / `.ogg` source files. The script auto-routes
  `map-*` and `boss-*` to `public/audio/music/` and everything else to
  `public/audio/sfx/`.
