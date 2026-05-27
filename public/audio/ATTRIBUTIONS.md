# Audio Asset Attributions

All audio assets in `public/audio/` are licensed CC0 (public domain). Attribution
is not legally required under CC0 but is recorded here for traceability.

If you ever add a CC-BY asset, update its row's License column AND add the
required attribution text below.

## SFX (`public/audio/sfx/`)

23 mono MP3s at 96 kbps. Target size: ≤10 KB each.

| File | Suggested source | Source URL | License |
|---|---|---|---|
| `tower-fire-archer.mp3`     | Kenney Sci-Fi Sounds — laserSmall | | CC0 |
| `tower-fire-cannon.mp3`     | Kenney Impact Sounds — heavy thud | | CC0 |
| `tower-fire-mage.mp3`       | Kenney Sci-Fi — laser whoosh | | CC0 |
| `tower-fire-ice.mp3`        | Kenney Sci-Fi — laserShock or icy zap | | CC0 |
| `tower-fire-sniper.mp3`     | Kenney Sci-Fi — laser long | | CC0 |
| `tower-fire-barracks.mp3`   | Kenney Impact Sounds — light thud | | CC0 |
| `tower-place.mp3`           | Kenney UI Audio — confirmation chime | | CC0 |
| `tower-upgrade.mp3`         | Kenney UI Audio — upgrade ding | | CC0 |
| `tower-sell.mp3`            | Kenney UI Audio — coin / cancel | | CC0 |
| `enemy-hit.mp3`             | Kenney Impact Sounds — short impact | | CC0 |
| `enemy-death-small.mp3`     | Kenney Sci-Fi — explosion-small | | CC0 |
| `enemy-death-large.mp3`     | Kenney Sci-Fi — explosion-large | | CC0 |
| `hero-attack.mp3`           | Reuse `enemy-hit.mp3` or distinct melee | | CC0 |
| `hero-death.mp3`            | Reuse `enemy-death-large.mp3` or distinct | | CC0 |
| `hero-respawn.mp3`          | Kenney UI Audio — power-up / chime | | CC0 |
| `hero-overcharge.mp3`       | Kenney Sci-Fi — powerUp | | CC0 |
| `hero-airstrike.mp3`        | Kenney Sci-Fi — explosion-huge | | CC0 |
| `hero-emp.mp3`              | Kenney Sci-Fi — laserShock | | CC0 |
| `wave-start.mp3`            | Kenney UI Audio — alert | | CC0 |
| `life-lost.mp3`             | Low alarm or reuse `enemy-death-small` | | CC0 |
| `victory.mp3`               | Kenney UI Audio — jingle | | CC0 |
| `defeat.mp3`                | Kenney UI Audio — error | | CC0 |
| `ui-click.mp3`              | Kenney UI Audio — short click | | CC0 |

## Music (`public/audio/music/`)

22 mono MP3s at 96 kbps (boss themes may be up to 128 kbps). Target size: ≤200 KB
each, ≤250 KB for boss themes. Each pair (ambient/combat) for a given map should
share key + tempo so the cross-fade is seamless.

| File | Suggested source | Source URL | License |
|---|---|---|---|
| `map-0-ambient.mp3`    | freesound.org — CC0 ambient electronic loop | | CC0 |
| `map-0-combat.mp3`     | freesound.org — same key, higher energy | | CC0 |
| `map-1-ambient.mp3`    | | | CC0 |
| `map-1-combat.mp3`     | | | CC0 |
| `map-2-ambient.mp3`    | | | CC0 |
| `map-2-combat.mp3`     | | | CC0 |
| `map-3-ambient.mp3`    | | | CC0 |
| `map-3-combat.mp3`     | | | CC0 |
| `map-4-ambient.mp3`    | | | CC0 |
| `map-4-combat.mp3`     | | | CC0 |
| `map-5-ambient.mp3`    | | | CC0 |
| `map-5-combat.mp3`     | | | CC0 |
| `map-6-ambient.mp3`    | | | CC0 |
| `map-6-combat.mp3`     | | | CC0 |
| `map-7-ambient.mp3`    | | | CC0 |
| `map-7-combat.mp3`     | | | CC0 |
| `map-8-ambient.mp3`    | | | CC0 |
| `map-8-combat.mp3`     | | | CC0 |
| `map-9-ambient.mp3`    | | | CC0 |
| `map-9-combat.mp3`     | | | CC0 |
| `boss-mid.mp3`         | freesound.org — heavy CC0 electronic | | CC0 |
| `boss-final.mp3`       | freesound.org — climactic CC0 electronic | | CC0 |

## Notes for future contributors

- **License check:** every file must be CC0 / public domain. Kenney.nl is CC0
  by default; freesound.org filter to CC0 explicitly.
- **Naming:** filenames must match `SFX_KEYS` and `MUSIC_KEYS` in
  `src/systems/AudioManager.js`. The loader uses the bare key.
- **Conversion:** use `scripts/convert-audio.sh` to batch-convert from a working
  directory of `.wav` / `.flac` / `.ogg` source files.
