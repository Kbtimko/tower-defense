// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TOWER_DEFS } from '../data/towers.js';
import { buildPrompt } from './promptParser.js';
import { promptSources, resolveJob } from './artJob.js';
import { loadFacing } from '../../scripts/art/runJob.mjs';

// Reads the REAL prompt files and job files: these tests guard the shipped art inputs.
const root = resolve(import.meta.dirname, '../..');
const read = rel => readFileSync(resolve(root, rel), 'utf8');
const sources = promptSources({
  spriteMd: read('public/assets/sprites/PROMPTS.md'),
  overworldMd: read('public/assets/overworld/PROMPTS.md'),
  portraitMd: read('public/assets/portraits/PROMPTS.md'),
});
const towerTypes = Object.keys(TOWER_DEFS);

describe('tower art prompts', () => {
  it('the sprite anchor is the art-bible anchor with a subject slot', () => {
    const a = sources.sprite.style;
    expect(a.split('{subject}')).toHaveLength(2);
    expect(a).toContain('no outline');
    expect(a).toContain('no lettering');
    expect(a).not.toContain('(top-down 3/4 game sprite:1.2)');
  });

  it('every tower has a base, a 4A and a 4B prompt', () => {
    const towers = sources.sprite.entries.filter(e => e.category === 'tower');
    for (const type of towerTypes) {
      for (const variant of [undefined, 't4a', 't4b']) {
        const n = towers.filter(e => e.type === type && e.variant === variant).length;
        expect(n, `${type}.${variant ?? 'base'}`).toBe(1);
      }
    }
  });

  describe.each(['towers-base', 'towers-branches'])('job %s', name => {
    const job = JSON.parse(read(`scripts/art/jobs/${name}.json`));
    const { job: r, errors } = resolveJob(job, sources, { facing: loadFacing(root), batchName: name });

    it('resolves with no errors and 8 candidates', () => {
      expect(errors).toEqual([]);
      expect(r.candidates).toBe(8);
    });

    it('covers the expected assets', () => {
      if (name === 'towers-base') {
        expect(r.assets.map(a => a.assetId).sort()).toEqual([...towerTypes].map(t => `tower_${t}`).sort());
        expect(r.assets.every(a => a.variant === undefined)).toBe(true);
      } else {
        expect(r.assets).toHaveLength(towerTypes.length * 2);
        for (const a of r.assets) {
          expect(a.init).toBe('base');
          expect(a.strength).toBe(0.65);
        }
      }
    });
  });

  it('a built tower prompt places the subject inside the anchor', () => {
    const archer = sources.sprite.entries.find(e => e.type === 'archer' && !e.variant);
    const p = buildPrompt(sources.sprite.style, archer.subject);
    expect(p.startsWith('high-angle top-down game sprite of an automated crossbow')).toBe(true);
    expect(p.endsWith('no lettering')).toBe(true);
    expect(p).not.toContain('  ');
  });
});
