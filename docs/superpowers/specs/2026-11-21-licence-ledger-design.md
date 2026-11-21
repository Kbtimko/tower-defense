# Roadmap 4.6: licence ledger (short design)

Status: design · 2026-11-21 · branch `docs/4.6-licence-ledger` · user: "move on to 4.6" (Claude's calls)

**Intent.** Roadmap 4.6: `docs/licenses.md` recording the model (FLUX.1 [schnell], "confirm
the exact weights Draw Things serves"), rembg, fonts (OFL) and the existing
`public/audio/ATTRIBUTIONS.md`. It is "needed before any commercial release": one place
that says where every shipped third-party or generated asset came from and what it allows.

**Facts gathered 2026-11-21 (the ledger's content).**
- Runtime npm dependencies (bundled): `phaser` 3.90.0 MIT; `@fontsource/orbitron` 5.3.0 and
  `@fontsource/rajdhani` 5.3.0, OFL-1.1 (Orbitron: Matt McInerney; Rajdhani: Indian Type
  Foundry). Dev dependencies do not ship.
- Draw Things `/sdapi/v1/options` reports `model: flux_1_schnell_q8p.ckpt` (Draw Things'
  8-bit conversion of black-forest-labs FLUX.1 [schnell], Apache-2.0), no LoRAs, no
  refiner, no upscaler; the Models folder also holds `flux_1_vae_f16.ckpt`,
  `t5_xxl_encoder_q6p.ckpt`, `clip_vit_l14_f16.ckpt`. Used for sprites (towers, tiers,
  enemies, heroes, soldier, sentry), portraits and overworld nodes (per each PROMPTS.md).
- Cutouts: rembg 2.0.61 (MIT) with `isnet-general-use` (IS-Net/DIS, Xuebin Qin et al.,
  Apache-2.0), run at build time only (`scripts/build-sprite-sheets.py`).
- Map backgrounds: ChatGPT Plus (DALL-E 3), per commit a5ad396 (the 2026-06-06 spec
  planned Midjourney; it was not used). OpenAI's terms assign the user its rights in output
  (with an "if any" caveat and a non-uniqueness note).
- Audio: every file under `public/audio/{sfx,music}` has a row in `ATTRIBUTIONS.md`; all
  CC0 (Kenney packs, freesound.org).
- Project-made: `public/particles/spark.png` (72 bytes), plus code-drawn roads, FX
  textures, vignette and the world-map backdrop (`BACKDROP_ART = null`).
- Gaps for a commercial release: the build ships the font files and Phaser's code without
  their licence texts (OFL and MIT both require the notice to travel with copies).

**Goals.** A correct, sourced ledger; a pre-commercial-release checklist; a guard test so
the ledger cannot silently go stale.

**Non-goals.** Shipping a notices file in the build now (listed as a release action);
legal advice; re-licensing anything; changing any asset.

**Anti-goals.** A ledger that names a tool or licence we did not actually use (e.g.
Midjourney); a guard test with a hardcoded list that would pass when a new dependency or
asset folder is added.

**Approaches.** (a) Hand-written doc only — goes stale silently. (b) **Doc + derived guard
test (chosen).** (c) Script-generated ledger — too much machinery for one page.

**Design.**
- `docs/licenses.md`: header (purpose, "not legal advice", last verified 2026-11-21);
  summary table (Component · Used for · Ships in build? · Licence · Obligations · Source);
  sections: Code, Fonts, AI-generated art (FLUX/Draw Things incl. exact files, encoders,
  rembg/IS-Net; DALL-E 3 backgrounds), Audio (points to ATTRIBUTIONS.md with the CC0
  summary), Project-made assets, Build/dev tools (not shipped), "Before a commercial
  release" checklist (ship third-party notices incl. MIT + OFL texts; AI-art copyright
  caveat; re-check OpenAI terms and FLUX licence at release; keep ATTRIBUTIONS current;
  any CC-BY addition needs attribution). Each licence claim links its source URL.
- `src/assets/licenseLedger.test.js` (derived, not hardcoded): (1) every key of
  `package.json` `dependencies` appears in `docs/licenses.md` on a line that also contains
  the `license` field read from `node_modules/<pkg>/package.json`; (2) every directory
  directly under `public/` and `public/assets/` appears in the ledger by its path
  (`public/audio`, `public/assets/sprites`, …); (3) every file stem under
  `public/audio/sfx` and `public/audio/music` appears in `public/audio/ATTRIBUTIONS.md`;
  each loop has a vacuity guard (found > 0).
- Roadmap: tick 4.6 with a one-line note.

**Left to the builder.** Wording and table layout; extra rows found while writing, as long
as each is sourced.
