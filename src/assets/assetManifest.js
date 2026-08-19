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
import { spriteTextureKey } from '../systems/spriteKeys.js';
import { portraitPath } from '../systems/portraitFallback.js';

export const PUBLIC_ROOT = 'public';

// Every entry: { kind, id, path, url, required, expected }
//   required — the game is visibly broken without it (no fallback)
//   expected — { width, height } when the art has a fixed target size
export function requiredAssets() {
  const out = [];

  for (const m of MAPS) {
    if (m.backgroundImage) {
      out.push({
        kind: 'background',
        id: `map ${m.id} — ${m.name}`,
        path: `${PUBLIC_ROOT}/assets/backgrounds/${m.backgroundImage}`,
        url: `assets/backgrounds/${m.backgroundImage}`,
        required: true,               // GameScene falls back to a flat colour
      });
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

  for (const entry of SPRITE_MANIFEST) {
    for (const [state, def] of Object.entries(entry.states ?? {})) {
      out.push({
        kind: 'sprite',
        id: `${entry.category}/${entry.type} ${state}`,
        path: `${PUBLIC_ROOT}/${def.path}`,
        url: def.path,
        required: false,              // Graphics fallback
        key: spriteTextureKey(entry.category, entry.type, state),
        frames: def.frames ?? 1,
        expected: def.frameWidth && def.frameHeight
          ? { width: def.frameWidth * (def.frames ?? 1), height: def.frameHeight }
          : undefined,
      });
    }
  }

  return out;
}
