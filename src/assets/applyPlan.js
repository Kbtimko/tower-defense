// Picks -> an ordered list of steps that install each winner. Pure: the caller
// says which references exist and what facing.json holds, and scripts/art/
// applyExec.mjs carries the steps out. Keeping the plan data means a dry run
// prints exactly what a real run would do.
import { join, posix } from 'node:path';
import { candidateDir } from './candidates.js';
import { requiredAssets } from './assetManifest.js';

export const CHECK_STEPS = [
  { op: 'check', cmd: ['npm', 'run', 'assets', '--', '--strict'] },
  { op: 'check', cmd: ['npm', 'test'] },
];

// Same precedence as build-sprite-sheets.py's mirror_for: exact name, then the
// base entity (variants inherit), then `default`.
function facingFor(name, facing) {
  const base = name.split('.')[0];
  if (Object.hasOwn(facing, name)) return Boolean(facing[name]);
  if (Object.hasOwn(facing, base)) return Boolean(facing[base]);
  return Boolean(facing.default ?? true);
}

function manifestEntry(manifest, category, type) {
  const entry = manifest.find(e => e.category === category && e.type === type);
  if (!entry) throw new Error(`no manifest entry for ${category}/${type}`);
  return entry;
}

// The variant inherits the base's states and cells; only the file names change.
function variantStates(entry, variant) {
  return Object.fromEntries(Object.entries(entry.states).map(([state, def]) => [
    state, { ...def, path: `${posix.dirname(def.path)}/${entry.type}_${variant}_${state}.png` },
  ]));
}

function spriteSteps(asset, { raw, cache, batch, timestamp, refExists, facing, flipped, manifest }) {
  const { assetId, category, type, variant } = asset;
  const entry = manifestEntry(manifest, category, type);
  const refDir = join(cache, 'sprites');
  const ref = join(refDir, `${assetId}.png`);
  const groundJson = join(cache, 'apply', `${batch}-${assetId}.ground.json`);
  const key = `${category}/${type}`;
  const steps = [];

  if (refExists(ref)) steps.push({ op: 'backup', from: ref, to: join(refDir, 'backup', `${assetId}-${timestamp}.png`) });
  steps.push({ op: 'copy', from: raw, to: ref });

  // facing.json is the only place the mirror lives, so a later `--all` rebuild
  // reproduces this install; the build itself is never given a mirror flag.
  const mirror = asset.mirror !== flipped;
  if (mirror !== facingFor(assetId, facing)) {
    steps.push({ op: 'setFacing', name: assetId, mirror });
    facing[assetId] = mirror;
  }

  // normalize.py reads the variant from SPRITE_MANIFEST, so declare it first.
  if (variant) steps.push({ op: 'writeVariant', key, variant, def: { states: variantStates(entry, variant) } });

  const build = ['python3', 'scripts/build-sprite-sheets.py', assetId, '--ref-dir', refDir];
  if (asset.cell !== undefined) build.push('--cell', String(asset.cell));
  if (asset.keepDebris) build.push('--keep-debris');
  steps.push({ op: 'run', cmd: build });
  steps.push({ op: 'run', cmd: ['python3', 'scripts/art/normalize.py', '--only',
    variant ? `${key}.${variant}` : key, '--ground-json', groundJson] });
  steps.push(variant
    ? { op: 'setGround', target: 'variants', key, variant, fromJson: groundJson }
    : { op: 'setGround', target: 'sprites', key, fromJson: groundJson });
  return steps;
}

function imageStep(asset, raw) {
  const req = requiredAssets().find(a => a.kind === asset.kind && a.path.endsWith(`/${asset.id}.png`));
  if (!req?.expected) throw new Error(`${asset.assetId}: no ${asset.kind} asset with an expected size`);
  return { op: 'resize', from: raw, to: req.path, width: req.expected.width, height: req.expected.height };
}

export function planApply({
  picks, job, metas, cache, manifest, timestamp,
  allowFake = false, refExists = () => false, facing = {},
}) {
  const chosen = job.assets.filter(a => Object.hasOwn(picks.picks, a.assetId));
  if (chosen.length === 0) return [];

  for (const a of chosen) {
    const index = picks.picks[a.assetId];
    const meta = metas[a.assetId]?.[index];
    if (!meta) throw new Error(`${a.assetId} #${index} has no metadata`);
    if (meta.mode === 'fake' && !allowFake) {
      throw new Error(`${a.assetId} #${index} is a fake candidate; pass --allow-fake to apply it anyway`);
    }
  }

  // A variant takes its tone from the base sheet and inherits the base's facing,
  // so any base picked in the same batch has to land first.
  const ordered = [...chosen].sort((a, b) => Number(Boolean(a.variant)) - Number(Boolean(b.variant)));
  const flips = new Set(picks.flip ?? []);
  const workingFacing = { ...facing };
  const steps = [];
  for (const asset of ordered) {
    const raw = join(candidateDir(cache, job.batch, asset.assetId), `${picks.picks[asset.assetId]}.png`);
    if (asset.kind === 'sprite') {
      steps.push(...spriteSteps(asset, {
        raw, cache, batch: job.batch, timestamp, refExists, manifest,
        facing: workingFacing, flipped: flips.has(asset.assetId),
      }));
    } else {
      steps.push(imageStep(asset, raw));
    }
  }
  return [...steps, ...CHECK_STEPS];
}

export function describeStep(step) {
  const detail = {
    backup: s => `${s.from} -> ${s.to}`,
    copy: s => `${s.from} -> ${s.to}`,
    resize: s => `${s.from} -> ${s.to} (${s.width}x${s.height})`,
    run: s => s.cmd.join(' '),
    check: s => s.cmd.join(' '),
    writeVariant: s => `${s.key} ${s.variant} (${Object.keys(s.def.states).join(', ')})`,
    setGround: s => `${s.target} ${s.key}${s.variant ? `.${s.variant}` : ''} <- ${s.fromJson}`,
    setFacing: s => `${s.name} mirror=${s.mirror}`,
  }[step.op];
  return `${step.op.padEnd(8)} ${detail ? detail(step) : JSON.stringify(step)}`;
}

// --- sprites.js `ground` line --------------------------------------------------

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fmt = n => n.toFixed(1);   // the hand-written entries carry one decimal

// Rewrites only the ground line of one entry. "Within the entry" = after its
// `category/type` line and before the next `category:`, so a comment example or
// a neighbouring entry can never be matched instead.
export function setGroundLine(text, category, type, ground) {
  if (!Number.isFinite(ground?.footY) || !Number.isFinite(ground?.width)) {
    throw new Error(`bad ground for ${category}/${type}: ${JSON.stringify(ground)}`);
  }
  const re = new RegExp(
    `(category: '${escapeRe(category)}', type: '${escapeRe(type)}',(?:(?!category:)[\\s\\S])*?ground: )`
    + '\\{ footY: -?[\\d.]+, width: -?[\\d.]+ \\}', 'g');
  const n = [...text.matchAll(re)].length;
  if (n !== 1) throw new Error(`ground line for ${category}/${type} found ${n} times`);
  return text.replace(re, `$1{ footY: ${fmt(ground.footY)}, width: ${fmt(ground.width)} }`);
}

// --- spriteVariants.js ---------------------------------------------------------

const HEADER = `// GENERATED by \`npm run art:apply\` — do not hand-edit. Tier-variant art
// declarations keyed by '<category>/<type>' (see mergeVariants in sprites.js).
export const SPRITE_VARIANTS = `;

const sortKeys = obj => Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]]));

// Entity and variant keys are sorted so a re-apply is byte-stable; state order is
// kept because normalize.py measures ground on the FIRST state.
export function renderSpriteVariants(obj) {
  const sorted = Object.fromEntries(Object.keys(obj).sort().map(k => [k, sortKeys(obj[k])]));
  return `${HEADER}${JSON.stringify(sorted, null, 2)};\n`;
}

export function parseSpriteVariants(text) {
  const m = /^export const SPRITE_VARIANTS = ([\s\S]*);\s*$/m.exec(text);
  try {
    if (!m) throw new Error('no export');
    return JSON.parse(m[1]);
  } catch {
    throw new Error('spriteVariants.js is not in the generated format; regenerate it rather than hand-edit');
  }
}
