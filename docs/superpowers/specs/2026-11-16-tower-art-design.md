# Roadmap 4.2 — Towers: new bases + tier-4 branch art

## Why
The tower art predates the art bible (G1, approved 2026-10-21): the archer is dark and low-contrast, ice is too bright, the cannon is washed out, and archer/cannon carry the old tan/grey identity instead of the amber/ember accents. Tier 4 has two branches per tower with different mechanics but the same art; only code marks (scale, core, embers, ring, A/B badge from #49) tell them apart. Pipeline v2 (4.0, #70) exists to make exactly this batch.

## Goal
Every tower has a base look in the art-bible style and its own generated look at T2, T3, 4A and 4B. Each tier reads as clearly more powerful than the tier below it, and 4A/4B say what the branch does. The user chooses every image on the review page.

## Non-goals
- No 2× re-bake (roadmap 4.1), no enemy/hero/soldier art (4.3/4.5).
- No change to the #49 code marks; they keep drawing over real art.

## Anti-goals
- A branch look that does not read as the same emplacement as its base.
- A tier that does not read as stronger than the tier below it.
- A tier look whose base grows past the 36px tower footprint (pads would collide).
- Ice/frost art that reads as the slow-status cyan `#7fe9ff`.
- Lettering, baked shadows, or more than one subject in a pick.

## Decisions (user)
- **Approach A:** regenerate all 6 bases first, then derive 4A/4B from the new bases. Two review sessions.
- **Branch looks:** the table below, accepted as proposed ("continue").
- **Amendment (user, during Stage 1):** "For tiers 2-4 on the towers, make sure there's a clear distinction for each level, that each upgrade has more power than the level below." Chosen: T2 and T3 get their own generated art (this reverses the earlier C1 non-goal); the #49 code marks still draw on top. The one stat exception (Frost Mage 4B single-target DPS 36 < T3 48) is fixed in a separate balance PR, not here.

| Tower | 4A | 4B |
|---|---|---|
| Archer (amber) | Volley: two stacked bow arms on one mount, two bolts loaded | Marksman: one long-limbed bow on a long rail with a scope lens, taller and slimmer |
| Mage (violet) | Archmage: orb arcing lightning to three floating conductor prongs | Frost Mage: orb in a sheath of pale lilac-white ice shards (not the slow cyan) |
| Cannon (ember) | Artillery: tall, steeply angled wide-bore mortar with a rack of three shells | Rapid Cannon: rotary triple-barrel autocannon with an ammo belt |
| Ice (cyan) | Permafrost: massive emitter crown on thick frozen pillars, heavy frost mantle | Shatter: jagged faceted crystal lance with fracture lines |
| Sniper (red) | Assassin: sleek dark rail, long suppressor, red lens | Rapid Fire: shorter twin rails, drum magazine, heat vents |
| Barracks (gold) | Vanguard: fortified bunker behind a heavy shield wall, gold banner | Rapid Response: bunker with launch-bay doors open and a signal beacon |

## Approaches considered
- **A (chosen):** all bases, then branches from them — one consistent style, fixes the art-bible tone failures; costs two review rounds and footprint re-checks.
- B: keep bases, generate 12 branches only — one round, but new-style branches on old-style bases and the tone failures stay.
- C: regenerate the 3 flagged bases + all branches — mixed style across towers.

## Design
### 1. Style anchor (G1 carry-over)
Replace the "Shared style anchor" in `public/assets/sprites/PROMPTS.md` with the art bible §7 text verbatim:

```
high-angle top-down game sprite of {subject}, sci-fi tower defense, painterly
vector shading, bold readable silhouette, lit from the upper left with a rim
light, single subject centered, plain flat mid-grey background, no ground
shadow, no outline, no text, no lettering
```

`buildPrompt(style, subject)` substitutes `{subject}` when the anchor contains it, and keeps today's `style. subject` join when it does not (overworld/portrait anchors have no slot). The PROMPTS.md header's SDXL settings become the FLUX ones (1024², 4 steps, CFG 0, Euler a) with a note that the negative block is inert under FLUX. The anchor applies to every sprite category; enemies/heroes are not regenerated here.

### 2. Tower prompts
Base subjects are noun phrases (they slot into "game sprite of …"). Hull is cool steel + teal for every tower; identity is the accent (art bible §2). The bullet labels change to the accent hex.

- **archer** `#ffb000` amber: `an automated crossbow ballista turret on a compact round base, tall upright swivel mount, cool steel and teal armor plates, glowing amber accent lights along the bow arms, taut bowstring`
- **mage** `#dd00ff` violet: `an arcane energy spire turret on a compact round base, floating violet crystal orb above steel prongs, glowing violet runic rings, cool steel and teal hull`
- **cannon** `#ff7a2f` ember: `a heavy artillery cannon turret on a compact round base, stubby thick barrel with a glowing ember-orange muzzle and vents, riveted cool steel and teal armor plating, recoil mount`
- **ice** `#00eeff` cyan: `a cryo frost turret on a compact round base, glowing cyan ice-crystal emitter, frosted condenser coils, dark cool steel and teal hull`
- **sniper** `#ff3355` red: `a long-barreled railgun sniper turret on a compact round base, slim rail with a glowing red targeting lens, cool steel and teal hull, sleek precise build`
- **barracks** `#ffd34d` gold: `a small reinforced military bunker on a round base, cool steel and teal walls, a gold rally flag on top, sandbag perimeter, deployment doorway, blank unmarked walls, no signage`

Branch subjects (replace the first-draft `archer.t4a`):

- **archer.t4a**: `an automated twin crossbow ballista turret on a compact round base, two stacked bow arms on one swivel mount with two bolts loaded, cool steel and teal armor plates, glowing amber accent lights`
- **archer.t4b**: `an automated long-range crossbow turret on a compact round base, one long-limbed bow on an extended rail with a scope lens, tall and slim, cool steel and teal armor, glowing amber accent lights`
- **mage.t4a**: `an arcane energy spire turret on a compact round base, crackling violet orb arcing lightning to three floating conductor prongs, cool steel and teal hull`
- **mage.t4b**: `an arcane frost spire turret on a compact round base, violet orb sheathed in pale lilac-white ice shards, frosted steel prongs, cool steel and teal hull`
- **cannon.t4a**: `a heavy mortar artillery turret on a compact round base, tall steeply angled wide-bore barrel, a rack of three shells beside it, glowing ember-orange vents, riveted cool steel and teal plating`
- **cannon.t4b**: `a rotary autocannon turret on a compact round base, a rotating cluster of three barrels fed by an ammo belt, glowing ember-orange muzzles, riveted cool steel and teal plating`
- **ice.t4a**: `a massive cryo turret on a compact round base, a large glowing cyan emitter crown on thick frozen crystal pillars, a heavy frost mantle over a dark cool steel and teal hull`
- **ice.t4b**: `a cryo lance turret on a compact round base, a jagged faceted glowing cyan crystal lance with fracture lines and sharp shards, dark cool steel and teal hull`
- **sniper.t4a**: `a stealth railgun sniper turret on a compact round base, a sleek dark rail with a long suppressor and a glowing red lens, cool steel and teal hull`
- **sniper.t4b**: `a rapid-fire railgun turret on a compact round base, shorter twin rails with a drum magazine and glowing red heat vents, cool steel and teal hull`
- **barracks.t4a**: `a fortified military bunker on a round base behind a heavy steel shield wall, a gold banner on top, cool steel and teal walls, blank unmarked walls, no signage`
- **barracks.t4b**: `a military bunker on a round base with its launch-bay doors open and a glowing gold signal beacon on top, cool steel and teal walls, blank unmarked walls, no signage`

#### 2b. Tier ladder (amendment)
Escalation comes from weapon size, armor, glow and a power core, never from a wider base: every tier subject keeps "compact round base" (barracks: "round base"). T4 subjects carry T3's heavier build plus the branch feature, so 4A/4B read above T3. These replace the 4A/4B subjects above.

- **archer.t2**: `an automated crossbow ballista turret on a compact round base, a reinforced swivel mount with extra armor plates, a larger bow with metal-capped limbs, cool steel and teal armor plates, two rows of glowing amber accent lights`
- **archer.t3**: `a heavy automated crossbow ballista turret on a compact round base, a thick armored swivel mount, a large heavy bow with a glowing amber power core at its center, cool steel and teal armor plates, bright glowing amber accent lights along the bow arms`
- **archer.t4a**: `a heavy automated twin crossbow ballista turret on a compact round base, two stacked bow arms on one thick armored swivel mount with two bolts loaded, a glowing amber power core, cool steel and teal armor plates, bright glowing amber accent lights`
- **archer.t4b**: `a heavy automated long-range crossbow turret on a compact round base, one long-limbed bow on an extended rail with a scope lens, tall and slim, a glowing amber power core, cool steel and teal armor, bright glowing amber accent lights`
- **mage.t2**: `an arcane energy spire turret on a compact round base, a larger floating violet crystal orb above reinforced steel prongs, two glowing violet runic rings, extra armor plates on a cool steel and teal hull`
- **mage.t3**: `a heavy arcane energy spire turret on a compact round base, a large blazing violet crystal orb above tall armored steel prongs, three glowing violet runic rings orbiting the orb, thick cool steel and teal hull`
- **mage.t4a**: `a heavy arcane energy spire turret on a compact round base, a large crackling violet orb arcing lightning to three floating conductor prongs, glowing violet runic rings, thick cool steel and teal hull`
- **mage.t4b**: `a heavy arcane frost spire turret on a compact round base, a large violet orb sheathed in pale lilac-white ice shards, frosted armored steel prongs, glowing violet runic rings, thick cool steel and teal hull`
- **cannon.t2**: `a heavy artillery cannon turret on a compact round base, a longer reinforced barrel with a glowing ember-orange muzzle and twin vents, extra riveted cool steel and teal armor plating, recoil mount`
- **cannon.t3**: `a heavy siege cannon turret on a compact round base, a thick long barrel with a reinforced muzzle brake glowing ember-orange, glowing ember-orange heat vents along an armored housing, heavy riveted cool steel and teal plating`
- **cannon.t4a**: `a heavy mortar artillery turret on a compact round base, a tall steeply angled wide-bore barrel, a rack of three shells beside it, glowing ember-orange heat vents, heavy riveted cool steel and teal plating`
- **cannon.t4b**: `a heavy rotary autocannon turret on a compact round base, a rotating cluster of three barrels fed by an ammo belt, glowing ember-orange muzzles and heat vents, heavy riveted cool steel and teal plating`
- **ice.t2**: `a cryo frost turret on a compact round base, a larger glowing cyan ice-crystal emitter ringed with smaller crystal spikes, frosted condenser coils, extra armor plates on a dark cool steel and teal hull`
- **ice.t3**: `a heavy cryo frost turret on a compact round base, a large cluster of glowing cyan ice crystals on an armored emitter, thick frosted condenser coils, frost-rimed armor on a dark cool steel and teal hull`
- **ice.t4a**: `a massive cryo turret on a compact round base, a large glowing cyan emitter crown on thick frozen crystal pillars, a heavy frost mantle over a dark cool steel and teal hull`
- **ice.t4b**: `a heavy cryo lance turret on a compact round base, a jagged faceted glowing cyan crystal lance with fracture lines and sharp shards, frost-rimed armor on a dark cool steel and teal hull`
- **sniper.t2**: `a long-barreled railgun sniper turret on a compact round base, a longer slim rail with a glowing red targeting lens and a stabilizer fin, extra armor plates, cool steel and teal hull`
- **sniper.t3**: `a heavy railgun sniper turret on a compact round base, a long twin-coil rail with glowing red charge coils and a large glowing red targeting lens, an armored mount, cool steel and teal hull`
- **sniper.t4a**: `a heavy stealth railgun sniper turret on a compact round base, a sleek dark rail with a long suppressor and a glowing red lens, an armored mount, cool steel and teal hull`
- **sniper.t4b**: `a heavy rapid-fire railgun turret on a compact round base, shorter twin rails with a drum magazine and glowing red heat vents, an armored mount, cool steel and teal hull`
- **barracks.t2**: `a reinforced military bunker on a round base, cool steel and teal walls with extra armor plating, a gold rally flag on top, a double row of sandbags, deployment doorway, blank unmarked walls, no signage`
- **barracks.t3**: `a fortified military command bunker on a round base, thick armored cool steel and teal walls, a tall gold banner and a small gold-lit watchtower on top, sandbag perimeter, reinforced deployment gate, blank unmarked walls, no signage`
- **barracks.t4a**: `a fortified military bunker on a round base behind a heavy steel shield wall, a tall gold banner on top, thick armored cool steel and teal walls, blank unmarked walls, no signage`
- **barracks.t4b**: `a fortified military bunker on a round base with its launch-bay doors open and a glowing gold signal beacon on top, thick armored cool steel and teal walls, blank unmarked walls, no signage`

### 3. Jobs
- `scripts/art/jobs/towers-base.json`: batch `towers-base`, 8 candidates, the 6 base towers (txt2img, default seed).
- `scripts/art/jobs/towers-tiers.json` (replaces `towers-branches.json`): batch `towers-tiers`, 6 candidates, 24 variants (t2, t3, t4a, t4b per tower), all `"init": "base"`; strength rises with the tier so higher tiers move further from the base: t2 `0.85`, t3 `0.88`, t4a/t4b `0.92`.
  Builder's call (2026-11-17): the first run at t2 `0.6` / t3 `0.7` / t4 `0.75` gave 144 candidates that all read as the base. A probe on archer.t4a and mage.t4a (seeds 88001-88002) showed `0.85` adds parts, `0.92` changes the silhouette while keeping the tower's identity, and `1.0` loses the identity and outgrows the footprint.
- Builder's call: init from the base, not chained (t3 from t2, ...). The pipeline only inits from the base, and chaining would mean three generate/review rounds; one round also lets the user compare a tower's whole ladder side by side.

### 4. Stages (LOCAL, Chrome closed, Draw Things HTTP 7860)
1. Generate `towers-base` (48 images, ~1.6 h) → review on dark + light → user picks → `art:apply`. If `tierLookPadFit` fails on a new footprint: re-check overlaps live (map 5 and map 9 tight pairs), then update the pinned set deliberately, then re-apply.
2. Generate `towers-tiers` (144 images, ~5.4 h) from the applied bases → review → picks → `art:apply`. Each variant's scale is re-tuned to hold the 36px footprint, as the bases were.
3. Verify in the production build at every tier (T1–T3 base + marks, 4A and 4B per tower), on a dark map (9) and a bright map (5), and the matrix/capture tier-looks run.

A tier whose candidates all read as the tier below → reroll that asset at strength +0.1 (builder's call, no user round-trip).

## Left to the builder
- Exact strength per reroll; whether to reroll a whole batch or single assets.
- Footprint-test updates, done deliberately and noted in the PR.
- Updating art-bible §7 to say the anchor was adopted in 4.2.
