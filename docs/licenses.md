# Licence ledger

Where every shipped third-party or generated asset in "Last Light" came from and what it
allows. **This is a record of facts and sources, not legal advice.** Last verified
2026-11-23. Guarded by `src/assets/licenseLedger.test.js`, which fails when a direct or
transitive npm runtime dependency, a folder under `public/` or `public/assets/`, or an audio
file is missing from this ledger or from `public/audio/ATTRIBUTIONS.md`. It does not catch
vendored code (such as Earcut, Matter.js and Simplify.js inside Phaser) or code Vite injects;
those are listed by hand below. Every build ships a generated `THIRD_PARTY_NOTICES.txt` with the licence texts,
produced by `scripts/vitePluginNotices.mjs` from the bundle; Earcut, Matter.js, Simplify.js
and the Vite polyfill come from `src/data/vendoredNotices.js`. `npm run package:itch` refuses a build without it.

## Summary

| Component | Used for | Ships in build? | Licence | Obligations | Source |
|---|---|---|---|---|---|
| `phaser` 3.90.0 | Game engine (bundled JS) | Yes | MIT | Keep the copyright and licence notice with copies | [phaserjs/phaser](https://github.com/phaserjs/phaser) |
| `eventemitter3` 5.0.4 | Event emitter, Phaser's npm dependency (bundled) | Yes | MIT | Keep the notice with copies | [eventemitter3](https://github.com/primus/eventemitter3) |
| Earcut 2.2.4 (vendored in Phaser) | Polygon triangulation inside `phaser.esm.js` | Yes | ISC, (c) 2016 Mapbox | Keep the notice with copies | [mapbox/earcut](https://github.com/mapbox/earcut) |
| Matter.js 0.20.0 (vendored in Phaser) | Physics engine inside `phaser.esm.js` (the game does not use Matter physics, but the code ships) | Yes | MIT, (c) Liam Brummitt and contributors | Keep the notice with copies | [liabru/matter-js](https://github.com/liabru/matter-js) |
| Simplify.js (vendored in Phaser) | Polygon simplification (`Phaser.Geom.Polygon.Simplify`) inside `phaser.esm.js` | Yes | BSD-2-Clause, (c) 2017 Vladimir Agafonkin | Reproduce the copyright, conditions and disclaimer with binary copies | [mourner/simplify-js](https://github.com/mourner/simplify-js) |
| `rvfc-polyfill` (vendored in Phaser) | `requestVideoFrameCallback` shim in `phaser.esm.js` (the game does not use Phaser video) | No (stripped at build) | GPL-3.0 upstream (Phaser relabels it MIT) | **Resolved: stripped from our build** by the `strip-gpl-polyfill` Vite plugin; not shipped, so no notice. See "Before a commercial release" | [ThaUnknown/rvfc-polyfill](https://github.com/ThaUnknown/rvfc-polyfill) |
| Vite modulepreload polyfill | Injected into the built JS by Vite | Yes | MIT | Keep the notice with copies | [vitejs/vite](https://github.com/vitejs/vite) |
| `@fontsource/orbitron` 5.3.0 | Display font files (Orbitron, Matt McInerney) | Yes | OFL-1.1 | Ship the OFL text and copyright; no selling the font alone | [Orbitron](https://fonts.google.com/specimen/Orbitron), [OFL](https://openfontlicense.org) |
| `@fontsource/rajdhani` 5.3.0 | Body font files (Rajdhani, Indian Type Foundry) | Yes | OFL-1.1 | As above | [Rajdhani](https://fonts.google.com/specimen/Rajdhani), [OFL](https://openfontlicense.org) |
| FLUX.1 [schnell] via Draw Things (`flux_1_schnell_q8p.ckpt`) | Sprites, portraits, overworld nodes in `public/assets/sprites`, `public/assets/portraits`, `public/assets/overworld` | Output only | Apache-2.0 (model) | No licence restriction on output; copyright in AI output is uncertain (see checklist) | [FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) |
| rembg 2.0.61 with `isnet-general-use` | Background removal for sprite cutouts | No (build time) | MIT (rembg); IS-Net/DIS repository licence Apache-2.0 | None for output | [rembg](https://github.com/danielgatis/rembg), [DIS](https://github.com/xuebinqin/DIS) |
| ChatGPT Plus image generation (recorded as DALL-E 3 in commit a5ad396) | Map backgrounds in `public/assets/backgrounds` | Output only (WebP) | OpenAI terms: user owns the Output | Re-check terms at release | [OpenAI terms](https://openai.com/policies/terms-of-use/) |
| Kenney packs, freesound.org, opengameart.org | SFX and music in `public/audio` | Yes | CC0 | None; recorded for traceability | [Kenney](https://kenney.nl), [freesound.org](https://freesound.org), [opengameart.org](https://opengameart.org), `public/audio/ATTRIBUTIONS.md` |
| Project-made | `public/particles/spark.png`, code-drawn roads, FX textures, vignette, world-map backdrop | Yes | Ours | None | n/a |

## Code

Runtime dependencies are the keys of `dependencies` in `package.json`. Only these are
bundled into the build; dev dependencies (Vite, Vitest, jsdom, Playwright, sharp, ...) do
not ship.

- `phaser` 3.90.0, MIT. Source: https://github.com/phaserjs/phaser
- `eventemitter3` 5.0.4, MIT: Phaser's npm dependency, bundled.
  Source: https://github.com/primus/eventemitter3
- Earcut 2.2.4, ISC, (c) 2016 Mapbox: vendored inside Phaser (`phaser.esm.js`), so it is
  not an npm dependency of this project. Source: https://github.com/mapbox/earcut
- Matter.js 0.20.0, MIT, (c) Liam Brummitt and contributors: vendored inside Phaser
  (`phaser.esm.js`, source `src/physics/matter-js`). Source: https://github.com/liabru/matter-js
- Simplify.js, BSD-2-Clause, (c) 2017 Vladimir Agafonkin: vendored inside Phaser
  (`src/geom/polygon/Simplify.js`). The source names no version. Source:
  https://github.com/mourner/simplify-js
- Vite injects its MIT-licensed modulepreload polyfill into the built JS.
  Source: https://github.com/vitejs/vite

Their licence texts ship in each build's `THIRD_PARTY_NOTICES.txt`. The plugin lists every
package in the bundle, adds their `dependencies` transitively (`eventemitter3`: Phaser's
ES build inlines it, so it never appears as a module), and appends Earcut, Matter.js, Simplify.js and the Vite polyfill from
`src/data/vendoredNotices.js`.

### Other code Phaser adapts (recorded, not reproduced)

Phaser 3.90.0's source credits these snippets. Each is licensed as stated below, taken from
the Phaser file header and the upstream npm metadata (`npm view <pkg> license`, checked
2026-11-23). No `THIRD_PARTY_NOTICES.txt` entry exists for them: the texts and copyright
lines are not in the Phaser source, so there is nothing to copy verbatim.

- rbush, MIT, Vladimir Agafonkin: forked in `src/structs/RTree.js`.
- stable 0.1.8, MIT, Angry Bytes (and contributors): `src/utils/array/StableSort.js`.
- base64-arraybuffer, MIT, Niklas von Hertzen: `src/utils/base64/*`.
- gl-matrix, MIT, toji: "Adapted from" in `src/math/Vector2.js`, `Vector3.js`, `Vector4.js`,
  `Matrix3.js`, `Matrix4.js` and `Quaternion.js`.
- line-circle-collision, MIT, Matt DesLauriers: `src/geom/intersects/LineToCircle.js`.
- javascript-algorithms snippet, MIT, Minko Gechev; and an SVG-path snippet credited to Gavin
  Kistner: inside the Matter.js sources.
- QuickSelect, based on code by Vladimir Agafonkin (`src/utils/array/QuickSelect.js`), and
  small snippets "based on code by" Mike Reinstein, Michael Jackson, Jonas Raoni Soares Silva
  and tylerjpeterson, with no licence named in the Phaser source.
- **klasse, BSD-2-Clause, Matt DesLauriers:** "Taken from klasse" in `src/utils/Class.js`.
  Resolved: it has a `VENDORED_NOTICES` entry (1.0.9). Sourcing: the upstream repository
  (github.com/mattdesl/klasse) states only "BSD-2-Clause" in its README and has no LICENSE
  file, and Phaser's source and the npm package carry no licence text. The copyright holder
  comes from the npm `package.json` author field; the text is the standard BSD-2-Clause
  with the line "Copyright (c) Matt DesLauriers".

## Fonts

- `@fontsource/orbitron` 5.3.0, OFL-1.1. Orbitron by Matt McInerney; "Copyright 2018 The
  Orbitron Project Authors".
  Source: https://fonts.google.com/specimen/Orbitron
- `@fontsource/rajdhani` 5.3.0, OFL-1.1. Rajdhani by Indian Type Foundry; "Copyright (c)
  2014 Indian Type Foundry".
  Source: https://fonts.google.com/specimen/Rajdhani
- Licence text: https://openfontlicense.org. The exact copyright lines are in
  `node_modules/@fontsource/*/LICENSE`; the generated `THIRD_PARTY_NOTICES.txt` includes
  each font's full OFL text and copyright line.

## AI-generated art

### Sprites, portraits and overworld nodes (FLUX.1 [schnell])

Generated locally with Draw Things. Its `/sdapi/v1/options` reported
`model: flux_1_schnell_q8p.ckpt`, with no LoRAs, no refiner and no upscaler. That file is
Draw Things' 8-bit conversion of black-forest-labs FLUX.1 [schnell]. The Hugging Face model
card lists licence apache-2.0, and the model page asks you to accept its conditions before
downloading. Source: https://huggingface.co/black-forest-labs/FLUX.1-schnell

The Draw Things Models folder also holds the supporting files used with it:

- `flux_1_vae_f16.ckpt`: the FLUX autoencoder, Apache-2.0. Source:
  https://github.com/black-forest-labs/flux
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
`isnet-general-use` model (IS-Net / DIS by Xuebin Qin et al., repository licence Apache-2.0,
https://github.com/xuebinqin/DIS; rembg downloads its own ONNX conversion of the weights). Run at build time only, by
`scripts/build-sprite-sheets.py`. Neither tool ships.

### Map backgrounds (ChatGPT Plus)

The backgrounds were made with ChatGPT Plus image generation (recorded as DALL-E 3 in
commit `a5ad396`). The
2026-06-06 spec planned Midjourney; it was not used, and nothing here comes from it. They
ship as WebP variants in `public/assets/backgrounds`, converted from the PNG sources in
`assets-src/backgrounds`.

OpenAI's terms say the user owns the Output, and that OpenAI assigns its rights in it, "if
any". Output may not be unique to us. Source: https://openai.com/policies/terms-of-use/

## Audio

Every file under `public/audio/sfx` and `public/audio/music` has a row in
`public/audio/ATTRIBUTIONS.md`, all CC0 (Kenney packs, https://kenney.nl; freesound.org
uploads, https://freesound.org; and `boss-final.mp3` from opengameart.org,
https://opengameart.org, by Emma_MA, "determined-pursuit-epic-orchestra-loop"). `public/assets/audio` holds only `PROMPTS.md`: audio that is
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

- [x] Third-party notices for the npm packages and the vendored code with a licence text to
      copy: every build ships a generated `THIRD_PARTY_NOTICES.txt` (OFL texts with
      copyright lines for the fonts; MIT/ISC/BSD-2-Clause for Phaser, eventemitter3, Earcut,
      Matter.js, Simplify.js, klasse and Vite's polyfill), and `npm run package:itch` fails without
      it. klasse is covered too; rvfc-polyfill is stripped instead (next item).
- [x] **`rvfc-polyfill` (GPL-3.0 upstream): resolved by stripping it from our build.**
      Phaser 3.90's dist inlines `src/polyfills/requestVideoFrame.js`, copied from
      https://github.com/ThaUnknown/rvfc-polyfill (GPL-3.0 on npm from 1.0.5 and on GitHub;
      Phaser's MIT header does not change that, and a notice cannot satisfy GPL-3.0). The
      `strip-gpl-polyfill` Vite plugin (`scripts/vitePluginNotices.mjs`, logic in
      `src/systems/stripVendored.js`) removes the block at build time, leaving an empty
      webpack module so the rest of Phaser is untouched. This is safe because the game never
      uses Phaser video and current browsers implement `requestVideoFrameCallback` natively.
      Guards: `npm run package:itch` fails if `_rvfcpolyfillmap` or `ThaUnknown/rvfc-polyfill`
      is in the bundle (`FORBIDDEN_BUNDLE_MARKERS`), and the strip throws if the marker is not
      found exactly once, so a Phaser upgrade fails the build until the strip is re-checked.
- [x] **klasse (BSD-2-Clause):** notice added, see "Other code Phaser adapts".
- [ ] Take legal advice on copyright in AI-generated art; ownership of output may be
      limited or non-exclusive depending on jurisdiction.
- [ ] Re-check the OpenAI terms and the FLUX.1 [schnell] licence at release time, and
      confirm the licence of the converted T5 and CLIP files Draw Things serves.
- [ ] Keep `public/audio/ATTRIBUTIONS.md` current; any CC-BY addition needs attribution
      text there.
- [ ] Record the OpenAI terms version in force when the backgrounds were made (June 2026).
- [ ] Add the store AI-generated-content disclosure (Steam requires one; itch.io has an AI
      tag).
- [ ] Keep provenance evidence: generation dates, the terms version, and the CC0 source
      pages for the freesound and opengameart tracks.
- [ ] Title and trademark clearance (outside licences): "Last Light" overlaps *Metro: Last
      Light*, so run a trademark search.
