# Overworld Node Art — Generation Prompts (FLUX.1 [schnell])

Each level shows an iconic node image on the MapSelect overworld. Generate one
square (1:1) image per level and save it with the exact filename below into this
folder (`assets/overworld/`). Until a file exists the overworld renders a
numbered-circle fallback, so these can be dropped in any time.

> **Model:** **FLUX.1 [schnell]** (Apache-2.0 — commercial-OK), run locally via
> **Draw Things** on Apple Silicon. These are single static images, so FLUX's
> prompt-following beats SDXL here and there's no animation-consistency problem.
> FLUX prefers **natural-language prose** (not the comma-tag style we use for the
> SDXL sprites). Generate at **1024×1024**, **4 steps** (schnell is distilled),
> **CFG 0** (guidance baked in); downscale to 512.

## Cohesion is everything (10 nodes must look like one set)

Open every prompt with the **same style sentence** so the whole map graph reads
as a single illustrated campaign trail:

> *"A painted sci-fi campaign-map icon, centered single subject on a dark deep-
> space background, cohesive 'Last Light' tower-defense art style, semi-realistic
> painterly rendering, dramatic rim lighting, readable at small size, square
> composition, no text, no UI."*

Then append the per-node subject below. Lock one **seed** and reuse it across all
ten so palette and lighting stay consistent. The nodes run a journey arc — Earth
forward base → moon → deep space → enemy homeworld → final stand — so the palette
should warm/darken from cool blue-greens toward ominous reds as the numbers climb.

## Per-node subjects (filename → subject)

- `overworld_0_outpost_sigma.png` — *Outpost Sigma:* a small fortified ground
  outpost with defensive walls and a comms tower, on a green-grey planet surface;
  humanity's last forward base, hopeful blue-white lighting.
- `overworld_1_lunar_gate.png` — *Lunar Gate:* a moon base with a glowing
  transit ring-gate, on a grey cratered lunar surface, cold blue light, Earth
  small in the black sky.
- `overworld_2_the_crater.png` — *The Crater:* a massive impact crater scarring a
  barren grey-brown world, faint debris, neutral daylight, sense of aftermath.
- `overworld_3_orbital_station.png` — *Orbital Station:* a blue-lit orbital ring
  station with docking spokes, hanging in starfield space, clean cyan glow.
- `overworld_4_asteroid_belt.png` — *Asteroid Belt:* a cluster of drifting
  rocky asteroids backlit by amber dust and a distant sun, warm ochre tones.
- `overworld_5_titans_reach.png` — *Titan's Reach:* a colossal rocky spire /
  alien megastructure stabbing up into space — the campaign turning point — tense
  amber-to-violet light, monumental scale.
- `overworld_6_deep_space_corridor.png` — *Deep Space Corridor:* a narrow
  star-lane threading between two dark nebula walls, faint guide-lights receding
  into distance, deep indigo.
- `overworld_7_the_void_frontier.png` — *The Void Frontier:* an ominous deep-
  purple void with sparse cold stars and a faint unseen threat, isolating and
  quiet, violet darkness.
- `overworld_8_enemy_homeworld.png` — *Enemy Homeworld:* a hostile alien
  homeworld, glowing red-violet chitinous surface and hive spires, menacing
  crimson atmosphere — the Veth hive seat.
- `overworld_9_last_light.png` — *Last Light:* the final battleground beneath a
  dying red star, a lone bastion silhouetted against a swollen crimson sun,
  dramatic do-or-die mood, the campaign's emotional peak.
