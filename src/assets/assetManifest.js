// The complete list of image assets the game asks for, DERIVED FROM THE CODE
// that requests them rather than transcribed from the PROMPTS.md prose. Add a
// map or a story speaker and it appears here automatically; there is no second
// list to keep in sync.
//
// `path` is the on-disk location under the repo root. It must live beneath
// public/ — Vite copies only publicDir into dist/, and art kept anywhere else
// is served by the dev server but silently missing from the production build.
// That exact mistake shipped broken backdrops for two months (see PR #45).
import { MAPS } from '../data/maps.js';
import { STORY_SPEAKERS } from '../data/story.js';
import { SPRITE_MANIFEST } from '../data/sprites.js';
import { spriteTextureKey, variantTextureKey } from '../systems/spriteKeys.js';
import { portraitPath } from '../systems/portraitFallback.js';
import { backgroundUrl } from '../systems/backgroundAsset.js';
import { SPRITE_2X } from '../data/sprite2x.js';
import { at2x } from '../systems/spriteResolution.js';
import { BACKGROUND_VARIANTS } from '../data/backgroundAssets.js';

export const PUBLIC_ROOT = 'public';

// Base states fall back to Graphics (optional); a DECLARED variant has no
// fallback worth shipping without, so its files are required.
export function spriteAssets(manifest) {
  const record = (entry, state, def, variant) => ({
    kind: 'sprite',
    id: `${entry.category}/${entry.type} ${state}${variant ? ` ${variant}` : ''}`,
    path: `${PUBLIC_ROOT}/${def.path}`,
    url: def.path,
    required: Boolean(variant),
    key: variant
      ? variantTextureKey(entry.category, entry.type, state, variant)
      : spriteTextureKey(entry.category, entry.type, state),
    frames: def.frames ?? 1,
    expected: def.frameWidth && def.frameHeight
      ? { width: def.frameWidth * (def.frames ?? 1), height: def.frameHeight }
      : undefined,
  });
  const out = [];
  for (const entry of manifest) {
    for (const [state, def] of Object.entries(entry.states ?? {})) out.push(record(entry, state, def));
  }
  for (const entry of manifest) {
    for (const [variant, v] of Object.entries(entry.variants ?? {})) {
      for (const [state, def] of Object.entries(v.states ?? {})) out.push(record(entry, state, def, variant));
    }
  }
  return [...out, ...sprites2x(out)];
}

// A sheet in SPRITE_2X ships an @2x sibling that the game requests at render
// scale 2, so it is required (no fallback) and exactly twice the 1x size.
function sprites2x(rows) {
  return rows.filter(r => SPRITE_2X.has(r.url)).map(r => ({
    ...r,
    id: `${r.id} @2x`,
    path: at2x(r.path),
    url: at2x(r.url),
    required: true,
    key: `${r.key}@2x`,
    expected: r.expected && { width: r.expected.width * 2, height: r.expected.height * 2 },
  }));
}

// Every entry: { kind, id, path, url, required, expected }
//   required — the game is visibly broken without it (no fallback)
//   expected — { width, height } when the art has a fixed target size
export function requiredAssets() {
  const out = [];

  for (const m of MAPS) {
    // The shipped WebPs, not the source PNG in assets-src/ (which never ships):
    // BootScene may request any variant, so each one is required.
    if (m.backgroundImage) {
      for (const v of BACKGROUND_VARIANTS) {
        const url = backgroundUrl(m.backgroundImage, v);
        out.push({
          kind: 'background',
          id: `map ${m.id}${v.suffix} — ${m.name}`,
          path: `${PUBLIC_ROOT}/${url}`,
          url,
          required: true,             // GameScene falls back to a flat colour
        });
      }
    }
    if (m.overworldArt) {
      out.push({
        kind: 'overworld',
        id: `node ${m.id} — ${m.name}`,
        path: `${PUBLIC_ROOT}/assets/overworld/${m.overworldArt}`,
        url: `assets/overworld/${m.overworldArt}`,
        required: false,              // numbered-circle fallback
        expected: { width: 512, height: 512 },
      });
    }
  }

  const seenPortraits = new Set();
  for (const sp of Object.values(STORY_SPEAKERS)) {
    if (!sp.portraitKey || seenPortraits.has(sp.portraitKey)) continue;
    seenPortraits.add(sp.portraitKey);
    out.push({
      kind: 'portrait',
      id: `${sp.name} (${sp.portraitKey})`,
      path: `${PUBLIC_ROOT}/${portraitPath(sp.portraitKey)}`,
      url: portraitPath(sp.portraitKey),
      required: false,                // coloured-initial fallback
      expected: { width: 256, height: 256 },
    });
  }

  out.push(...spriteAssets(SPRITE_MANIFEST));

  return out;
}
