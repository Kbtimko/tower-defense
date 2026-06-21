# Story Portrait Assets (Phase 2)

The campaign story dialog (`src/ui/StoryDialogOverlay.js`) renders a speaker portrait
per panel. Until these PNGs exist, `src/systems/portraitFallback.js` draws a colored
block with the speaker's initial. To enable real art with **zero code change**:

1. Generate the three 256×256 PNGs below and save them to `public/assets/portraits/`.
2. In `src/systems/portraitFallback.js`, add their keys to `REGISTERED_PORTRAITS`:
   `new Set(['portrait-command', 'portrait-rael', 'portrait-vorn'])`.
   (Or, preferred: have BootScene load them and populate the set at runtime.)

| Key | Speaker | Prompt |
|-----|---------|--------|
| `portrait-command` | Sol Command | Stern human military officer bust, dark blue Sol Vanguard uniform, command-deck lighting, sci-fi, semi-realistic painterly style, neutral background. |
| `portrait-rael` | Commander Rael | Battle-worn field commander bust, gold-accented Vanguard armor, scarred but resolute, warm key light, semi-realistic painterly style, neutral background. |
| `portrait-vorn` | The Vorn (hive-mind) | Alien hive-mind visage, chitinous violet carapace, many faint glowing eyes, unsettling, cold purple light, semi-realistic painterly style, dark background. |

Colors used by the fallback (keep art tonally consistent): command `#4aa3ff`, rael `#ffd24a`, vorn `#9b4dff`.
