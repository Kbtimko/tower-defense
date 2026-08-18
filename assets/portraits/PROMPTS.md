# Story Portrait Assets (Phase 2) — FLUX.1 [schnell]

The campaign story dialog (`src/ui/StoryDialogOverlay.js`) renders a speaker
portrait per panel. Until these PNGs exist, `src/systems/portraitFallback.js`
draws a colored block with the speaker's initial. To enable real art with **zero
code change**:

1. Generate the three 256×256 PNGs below and save them to `public/assets/portraits/`
   (the overlay loads them from the site-root path `/assets/portraits/<key>.png`).
2. In `src/systems/portraitFallback.js`, add their keys to `REGISTERED_PORTRAITS`:
   `new Set(['portrait-command', 'portrait-rael', 'portrait-vorn'])`.
   (Or, preferred: have BootScene load them and populate the set at runtime.)

> **Model:** **FLUX.1 [schnell]** (Apache-2.0 — commercial-OK), run locally via
> **Draw Things** on Apple Silicon. Portraits are single static images where
> FLUX's prompt-following and face quality shine, with no animation-consistency
> problem to solve. FLUX prefers **natural-language prose**. Generate at
> **1024×1024 portrait crop**, **4 steps**, **CFG 0**; downscale to 256.

## Cohesion (3 speakers, one cabinet of characters)

Open every prompt with the **same style sentence** and reuse one **seed** so the
three portraits read as one set:

> *"A semi-realistic painterly character portrait, head-and-shoulders bust facing
> the viewer, cohesive 'Last Light' sci-fi tower-defense art style, cinematic key
> lighting, clean simple background, square framing, no text, no watermark."*

Then append the per-speaker subject. Keep each tonally consistent with the
fallback color the engine already uses for that speaker, so a missing-art swap is
seamless.

## Per-speaker prompts

| Key | Speaker | Subject (append to the style sentence) | Tonal anchor |
|-----|---------|----------------------------------------|--------------|
| `portrait-command` | **Sol Command** | a stern senior human military officer, dark-blue Sol Vanguard dress uniform with rank insignia, cool command-deck lighting, composed and authoritative, calm blue backdrop. | `#4aa3ff` cool blue |
| `portrait-rael` | **Commander Rael** | a battle-worn human field commander, gold-accented navy Vanguard combat armor, a scar across the brow, resolute determined expression, warm heroic key light, amber-gold backdrop. | `#ffd24a` warm gold |
| `portrait-vorn` | **The Vorn** (hive-mind) | an alien hive-mind visage, chitinous violet carapace and segmented plating, a cluster of many faint glowing eyes, cold and unsettling, low purple underlighting, dark backdrop. | `#9b4dff` cold violet |

> Note: in-game enemy units are the "Veth"; the antagonist speaker here is "The
> Vorn" hive-mind. Keep the violet chitin language shared between this portrait
> and the enemy sprites (`assets/sprites/PROMPTS.md`) so the faction reads as one.
