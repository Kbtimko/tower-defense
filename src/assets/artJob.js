import {
  parseStyleAnchor, parseOverworldPrompts, parsePortraitPrompts, parseFencedSection,
  parseSpritePrompts, buildPrompt,
} from './promptParser.js';

// The parser accepts any [a-z0-9]+ suffix so a typo'd PROMPTS bullet is not
// silently dropped; this list is where unknown keys get rejected.
export const VARIANT_KEYS = ['t2', 't3', 't4a', 't4b'];

const DEFAULT_CANDIDATES = 8;
const DEFAULT_SEED = 77021;   // matches generate-art.mjs: one seed keeps a set cohesive

export function promptSources({ spriteMd, overworldMd, portraitMd }) {
  return {
    sprite: {
      style: parseFencedSection(spriteMd, 'Shared style anchor'),
      entries: parseSpritePrompts(spriteMd),
    },
    overworld: { style: parseStyleAnchor(overworldMd), entries: parseOverworldPrompts(overworldMd) },
    portrait: { style: parseStyleAnchor(portraitMd), entries: parsePortraitPrompts(portraitMd) },
  };
}

const inRange = (n, lo, hi) => typeof n === 'number' && n >= lo && n <= hi;

function resolveSprite(a, sources, facing, fail) {
  const { entity, variant } = a;
  const assetId = variant ? `${entity}.${variant}` : entity;
  if (typeof entity !== 'string' || !entity.includes('_')) {
    fail(`sprite needs an entity like tower_archer (got ${JSON.stringify(entity)})`);
    return { assetId };
  }
  const cut = entity.indexOf('_');
  const category = entity.slice(0, cut);
  const type = entity.slice(cut + 1);

  let variantOk = true;
  if (variant !== undefined) {
    if (!VARIANT_KEYS.includes(variant)) {
      fail(`${assetId}: variant "${variant}" is not one of ${VARIANT_KEYS.join(', ')}`);
      variantOk = false;
    } else if (category !== 'tower') {
      fail(`${assetId}: variants are towers-only`);
      variantOk = false;
    }
    if (a.cell !== undefined) fail(`${assetId}: a variant uses its base cell`);
  } else if (a.init !== undefined) {
    fail(`${assetId}: init needs a variant`);
  }
  if (a.strength !== undefined && !inRange(a.strength, 0, 1)) {
    fail(`${assetId}: strength must be 0-1`);
  }

  const entry = variantOk && sources.sprite.entries.find(
    e => e.category === category && e.type === type && e.variant === variant);
  if (variantOk && !entry) fail(`${assetId}: no PROMPTS.md entry for ${assetId}`);

  // A variant falls back to its base's facing: it is the same art lineage.
  const mirror = a.mirror ?? facing[assetId] ?? facing[entity] ?? true;
  const out = {
    assetId, kind: 'sprite', category, type, entity, mirror, keepDebris: a.keepDebris ?? false,
    prompt: entry ? buildPrompt(sources.sprite.style, entry.subject) : null,
  };
  if (variant !== undefined) out.variant = variant;
  for (const k of ['cell', 'init', 'strength']) if (a[k] !== undefined) out[k] = a[k];
  return out;
}

function resolveListed(a, kind, sources, fail) {
  const { style, entries } = sources[kind];
  const entry = kind === 'overworld'
    ? entries.find(e => e.file.replace(/\.png$/, '') === a.id)
    : entries.find(e => e.key === a.id);
  if (!entry) fail(`${a.id}: no PROMPTS.md entry for ${a.id}`);
  return {
    assetId: a.id, kind, id: a.id,
    prompt: entry ? buildPrompt(style, entry.subject) : null,
  };
}

export function resolveJob(job, sources, { facing = {} } = {}) {
  const errors = [];
  const candidates = job.candidates ?? DEFAULT_CANDIDATES;
  const seed = job.seed ?? DEFAULT_SEED;
  if (!Number.isInteger(candidates) || !inRange(candidates, 1, 16)) {
    errors.push('candidates must be 1-16');
  }
  const list = Array.isArray(job.assets) ? job.assets : [];
  if (list.length === 0) errors.push('no assets');

  const assets = [];
  const seen = new Set();
  list.forEach((a, i) => {
    const fail = msg => errors.push(`assets[${i}]: ${msg}`);
    let r;
    if (a.kind === 'sprite') r = resolveSprite(a, sources, facing, fail);
    else if (a.kind === 'overworld' || a.kind === 'portrait') r = resolveListed(a, a.kind, sources, fail);
    else { fail(`unknown kind "${a.kind}"`); return; }
    if (seen.has(r.assetId)) fail(`duplicate ${r.assetId}`);
    seen.add(r.assetId);
    assets.push(r);
  });

  if (errors.length) return { job: null, errors };
  return { job: { batch: job.batch, candidates, seed, assets }, errors };
}
