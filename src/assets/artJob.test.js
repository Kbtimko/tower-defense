import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildPrompt } from './promptParser.js';
import { VARIANT_KEYS, promptSources, resolveJob } from './artJob.js';

const spriteMd = [
  '## Shared style anchor',
  '```',
  'Painted sci-fi sprite.',
  '```',
  '### (b) Towers',
  '- **cannon** — meta:',
  '```',
  'a squat cannon turret',
  '```',
  '- **archer** — meta:',
  '```',
  'a crossbow turret',
  '```',
  '- **archer.t4a** — meta:',
  '```',
  'a heavy crossbow turret with a banner',
  '```',
  '### (c) Heroes',
  '- **rael** — meta:',
  '```',
  'a hooded scout hero',
  '```',
].join('\n');
const overworldMd = [
  '> *"A painted overworld icon."*',
  '',
  '- `overworld_0_outpost_sigma.png` — *Outpost Sigma:* a walled outpost',
  '',
].join('\n');
const portraitMd = [
  '> *"A painted portrait."*',
  '',
  '| `portrait-rael` | **Commander Rael** | a weathered scout | `#fff` gold |',
].join('\n');

const realSources = () => promptSources({
  spriteMd: readFileSync('public/assets/sprites/PROMPTS.md', 'utf8'),
  overworldMd: readFileSync('public/assets/overworld/PROMPTS.md', 'utf8'),
  portraitMd: readFileSync('public/assets/portraits/PROMPTS.md', 'utf8'),
});
const sources = promptSources({ spriteMd, overworldMd, portraitMd });
const job = (assets, extra = {}) => ({ batch: 'b', assets, ...extra });
const spr = (entity, extra = {}) => ({ kind: 'sprite', entity, ...extra });
const fails = (j, fragment) => {
  const r = resolveJob(j, sources, { facing: {} });
  expect(r.job).toBeNull();
  expect(r.errors.join('\n')).toContain(fragment);
};

describe('promptSources', () => {
  it('builds a style anchor and entries per kind from the real files', () => {
    const s = realSources();
    for (const k of ['sprite', 'overworld', 'portrait']) {
      expect(s[k].style).toBeTruthy();
      expect(s[k].entries.length).toBeGreaterThan(0);
    }
  });
  it('exposes the variant keys', () => {
    expect(VARIANT_KEYS).toEqual(['t2', 't3', 't4a', 't4b']);
  });
});

describe('resolveJob', () => {
  it('resolves a base sprite, a variant, an overworld node and a portrait', () => {
    const { job: out, errors } = resolveJob(job([
      spr('tower_cannon'),
      spr('tower_archer', { variant: 't4a' }),
      { kind: 'overworld', id: 'overworld_0_outpost_sigma' },
      { kind: 'portrait', id: 'portrait-rael' },
    ]), sources, { facing: {} });
    expect(errors).toEqual([]);
    expect(out.assets.map(a => a.assetId)).toEqual(
      ['tower_cannon', 'tower_archer.t4a', 'overworld_0_outpost_sigma', 'portrait-rael']);
    expect(out.assets[0].prompt).toBe(buildPrompt('Painted sci-fi sprite.', 'a squat cannon turret'));
    expect(out.assets[1].prompt).toBe(
      buildPrompt('Painted sci-fi sprite.', 'a heavy crossbow turret with a banner'));
    expect(out.assets[2].prompt).toBe(buildPrompt('A painted overworld icon.', 'a walled outpost'));
    expect(out.assets[3].prompt).toBe(buildPrompt('A painted portrait.', 'a weathered scout'));
    expect(out).toMatchObject({ batch: 'b', candidates: 8, seed: 77021 });
    expect(out.assets[1]).toMatchObject({
      kind: 'sprite', category: 'tower', type: 'archer', variant: 't4a', entity: 'tower_archer',
    });
  });

  it('takes mirror from the facing table, a variant inheriting its base', () => {
    const facing = { tower_archer: false };
    const { job: out } = resolveJob(job([
      spr('tower_archer', { variant: 't4a' }), spr('tower_cannon'),
    ]), sources, { facing });
    expect(out.assets[0].mirror).toBe(false);
    expect(out.assets[1].mirror).toBe(true);
  });

  it('lets an explicit job mirror win over the facing table', () => {
    const { job: out } = resolveJob(job([
      spr('tower_archer', { variant: 't4a', mirror: true }),
    ]), sources, { facing: { tower_archer: false } });
    expect(out.assets[0].mirror).toBe(true);
  });

  it('defaults keepDebris to false and carries job overrides', () => {
    const { job: out } = resolveJob(job([spr('tower_cannon')], { candidates: 3, seed: 5 }),
      sources, { facing: {} });
    expect(out).toMatchObject({ candidates: 3, seed: 5 });
    expect(out.assets[0].keepDebris).toBe(false);
  });

  it('rejects an unknown kind', () => fails(job([{ kind: 'icon', id: 'x' }]), 'kind "icon"'));
  it('rejects a sprite with no prompt', () =>
    fails(job([spr('tower_laser')]), 'no PROMPTS.md entry for tower_laser'));
  it('rejects a variant with no variant prompt', () =>
    fails(job([spr('tower_cannon', { variant: 't4a' })]), 'no PROMPTS.md entry for tower_cannon.t4a'));
  it('rejects an unknown variant', () =>
    fails(job([spr('tower_archer', { variant: 't5' })]), 'variant "t5"'));
  it('rejects a variant on a hero', () =>
    fails(job([spr('hero_rael', { variant: 't2' })]), 'variants are towers-only'));
  it('rejects a duplicate assetId', () =>
    fails(job([spr('tower_cannon'), spr('tower_cannon')]), 'duplicate tower_cannon'));
  it('rejects candidates 0', () =>
    fails(job([spr('tower_cannon')], { candidates: 0 }), 'candidates must be 1-16'));
  it('rejects candidates 17', () =>
    fails(job([spr('tower_cannon')], { candidates: 17 }), 'candidates must be 1-16'));
  it('rejects strength 1.5', () =>
    fails(job([spr('tower_archer', { variant: 't4a', init: 'x.png', strength: 1.5 })]),
      'strength must be 0-1'));
  it('rejects init on a base sprite', () =>
    fails(job([spr('tower_cannon', { init: 'x.png' })]), 'init needs a variant'));
  it('rejects cell on a base sprite and on a variant', () => {
    fails(job([spr('tower_cannon', { cell: 80 })]), 'tower_cannon: cell overrides are not supported yet');
    fails(job([spr('tower_archer', { variant: 't4a', cell: 96 })]), 'tower_archer.t4a: cell overrides are not supported yet');
  });
  it('rejects empty assets', () => fails(job([]), 'no assets'));
  it('rejects a batch that differs from its job file name', () => {
    const r = resolveJob(job([spr('tower_cannon')]), sources, { facing: {}, batchName: 'other' });
    expect(r.job).toBeNull();
    expect(r.errors).toEqual(['batch "b" does not match the job file name "other.json"']);
    expect(resolveJob(job([spr('tower_cannon')]), sources, { facing: {}, batchName: 'b' }).errors).toEqual([]);
  });

  it('collects every error, not just the first', () => {
    const r = resolveJob(job([spr('tower_laser'), { kind: 'icon' }]), sources, { facing: {} });
    expect(r.job).toBeNull();
    expect(r.errors).toHaveLength(2);
  });

  it('resolves real overworld and portrait ids against the real files', () => {
    const s = realSources();
    const ow = s.overworld.entries[0];
    const pt = s.portrait.entries[0];
    const { job: out, errors } = resolveJob(job([
      { kind: 'overworld', id: ow.file.replace(/\.png$/, '') },
      { kind: 'portrait', id: pt.key },
    ]), s, { facing: {} });
    expect(errors).toEqual([]);
    expect(out.assets).toHaveLength(2);
  });
});
