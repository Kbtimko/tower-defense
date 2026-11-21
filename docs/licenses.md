# Licence ledger

Where every shipped third-party or generated asset in "Last Light" came from and what it
allows. **This is a record of facts and sources, not legal advice.** Last verified
2026-11-21. Guarded by `src/assets/licenseLedger.test.js`, which fails when a runtime
dependency, a folder under `public/` or `public/assets/`, or an audio file is missing from
this ledger or from `public/audio/ATTRIBUTIONS.md`.

## Summary

| Component | Used for | Ships in build? | Licence | Obligations | Source |
|---|---|---|---|---|---|
| `phaser` 3.90.0 | Game engine (bundled JS) | Yes | MIT | Keep the copyright and licence notice with copies | [phaserjs/phaser](https://github.com/phaserjs/phaser) |
| `@fontsource/orbitron` 5.3.0 | Display font files (Orbitron, Matt McInerney) | Yes | OFL-1.1 | Ship the OFL text and copyright; no selling the font alone | [Orbitron](https://fonts.google.com/specimen/Orbitron), [OFL](https://openfontlicense.org) |
| `@fontsource/rajdhani` 5.3.0 | Body font files (Rajdhani, Indian Type Foundry) | Yes | OFL-1.1 | As above | [Rajdhani](https://fonts.google.com/specimen/Rajdhani), [OFL](https://openfontlicense.org) |
| FLUX.1 [schnell] via Draw Things (`flux_1_schnell_q8p.ckpt`) | Sprites, portraits, overworld nodes in `public/assets/sprites`, `public/assets/portraits`, `public/assets/overworld` | Output only | Apache-2.0 (model) | Output is ours; see caveats below | [FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) |
| rembg 2.0.61 with `isnet-general-use` | Background removal for sprite cutouts | No (build time) | MIT (rembg); Apache-2.0 (IS-Net/DIS code and weights) | None for output | [rembg](https://github.com/danielgatis/rembg), [DIS](https://github.com/xuebinqin/DIS) |
| ChatGPT Plus (DALL-E 3) | Map backgrounds in `public/assets/backgrounds` | Output only (WebP) | OpenAI terms: user owns output to the extent permitted by law | Re-check terms at release | [OpenAI terms](https://openai.com/policies/terms-of-use/) |
| Kenney packs, freesound.org | SFX and music in `public/audio` | Yes | CC0 | None; recorded for traceability | [Kenney](https://kenney.nl), [freesound.org](https://freesound.org), `public/audio/ATTRIBUTIONS.md` |
| Project-made | `public/particles/spark.png`, code-drawn roads, FX textures, vignette, world-map backdrop | Yes | Ours | None | n/a |

## Code

Runtime dependencies are the keys of `dependencies` in `package.json`. Only these are
bundled into the build; dev dependencies (Vite, Vitest, jsdom, Playwright, sharp, ...) do
not ship.

- `phaser` 3.90.0, MIT. Source: https://github.com/phaserjs/phaser

## Fonts

- `@fontsource/orbitron` 5.3.0, OFL-1.1. Orbitron by Matt McInerney.
  Source: https://fonts.google.com/specimen/Orbitron
- `@fontsource/rajdhani` 5.3.0, OFL-1.1. Rajdhani by Indian Type Foundry.
  Source: https://fonts.google.com/specimen/Rajdhani
- Licence text: https://openfontlicense.org

## AI-generated art

### Sprites, portraits and overworld nodes (FLUX.1 [schnell])

Generated locally with Draw Things. Its `/sdapi/v1/options` reported
`model: flux_1_schnell_q8p.ckpt`, with no LoRAs, no refiner and no upscaler. That file is
Draw Things' 8-bit conversion of black-forest-labs FLUX.1 [schnell]. The Hugging Face model
card lists licence apache-2.0 (as does its autoencoder); the repository is gated, so you
accept its conditions to download. Source:
https://huggingface.co/black-forest-labs/FLUX.1-schnell

The Draw Things Models folder also holds the supporting files used with it:

- `flux_1_vae_f16.ckpt`: the FLUX autoencoder (Apache-2.0 on the FLUX.1 [schnell] card).
- `t5_xxl_encoder_q6p.ckpt`: a T5-XXL text encoder, from the T5 line of models,
  https://github.com/google-research/text-to-text-transfer-transformer
- `clip_vit_l14_f16.ckpt`: a CLIP ViT-L/14 text encoder, https://github.com/openai/CLIP

These two encoders are Draw Things' conversions; this ledger has not verified the licence
of those exact converted files, only the upstream projects they derive from. Check before
a commercial release (see checklist).

Sprites ship in two sets, 1x and `@2x` (roadmap 4.1b), both derived from the same FLUX
references. Prompts are in each folder's `PROMPTS.md`.

### Cutouts (rembg, IS-Net)

Cutouts use rembg 2.0.61 (MIT, https://github.com/danielgatis/rembg) with the
`isnet-general-use` model (IS-Net / DIS by Xuebin Qin et al., code and weights Apache-2.0,
https://github.com/xuebinqin/DIS). Run at build time only, by
`scripts/build-sprite-sheets.py`. Neither tool ships.

### Map backgrounds (DALL-E 3 via ChatGPT Plus)

The backgrounds were made with ChatGPT Plus (DALL-E 3), per commit `a5ad396`. The
2026-06-06 spec planned Midjourney; it was not used, and nothing here comes from it. They
ship as WebP variants in `public/assets/backgrounds`, converted from the PNG sources in
`assets-src/backgrounds`.

OpenAI's terms state that "to the extent permitted by applicable law, you retain your
rights in Input and own the Output". The EU and UK versions say OpenAI "assigns to you all
its right, title, and interest, if any, in Output". Note the "if any" caveat, and that
Output may not be unique to us. Source: https://openai.com/policies/terms-of-use/

## Audio

Every file under `public/audio/sfx` and `public/audio/music` has a row in
`public/audio/ATTRIBUTIONS.md`, all CC0 (Kenney packs, https://kenney.nl, and
https://freesound.org uploads). `public/assets/audio` holds only `PROMPTS.md`: audio that is
deferred and not yet shipped.

## Project-made assets

`public/particles/spark.png` (72 bytes) is made in-project. Roads, FX textures, the
vignette and the world-map backdrop (`BACKDROP_ART = null`) are drawn in code. Nothing
third-party.

## Shipped folders

Every folder served from `public/`:

- `public/assets`, holding the subfolders below
- `public/assets/audio`: `PROMPTS.md` only (deferred audio)
- `public/assets/backgrounds`: DALL-E 3 map backgrounds
- `public/assets/overworld`: FLUX.1 [schnell] overworld nodes
- `public/assets/portraits`: FLUX.1 [schnell] portraits
- `public/assets/sprites`: FLUX.1 [schnell] sprites, cut out with rembg
- `public/audio`: CC0 SFX and music, see `public/audio/ATTRIBUTIONS.md`
- `public/particles`: project-made

## Build and dev tools (not shipped)

rembg, IS-Net, Draw Things, Vite, Vitest, jsdom, Playwright and sharp are used to build or
test the game and are not part of the shipped bundle.

## Before a commercial release

- [ ] Ship third-party notices in the build, including the MIT text (Phaser) and the OFL
      text with copyright lines (both fonts). Today the build ships the font files and
      Phaser's code without their licence texts; both licences require the notice to
      travel with copies.
- [ ] Take legal advice on copyright in AI-generated art; ownership of output may be
      limited or non-exclusive depending on jurisdiction.
- [ ] Re-check the OpenAI terms and the FLUX.1 [schnell] licence at release time, and
      confirm the licence of the converted T5 and CLIP files Draw Things serves.
- [ ] Keep `public/audio/ATTRIBUTIONS.md` current; any CC-BY addition needs attribution
      text there.
