// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { pageUrl, displaySize, buildReview } from './review.mjs';
import { getSpriteConfig } from '../../src/data/sprites.js';

describe('pageUrl', () => {
  it('percent-encodes spaces and URL-significant characters per segment', () => {
    expect(pageUrl('/c/review/b', "/c/candidates/b/a #1?/it's 100%/0.png"))
      .toBe('../../candidates/b/a%20%231%3F/it\'s%20100%25/0.png');
  });
});

describe('displaySize', () => {
  it('sizes a sprite from the manifest cell x scale, never a job cell', () => {
    const cfg = getSpriteConfig('tower', 'archer');
    const size = Math.round(cfg.states.idle.frameWidth * cfg.scale);
    const archer = { kind: 'sprite', category: 'tower', type: 'archer' };
    expect(displaySize(archer)).toEqual({ width: size, height: size });
    expect(displaySize({ ...archer, cell: 200 })).toEqual({ width: size, height: size });
  });
});

describe('buildReview', () => {
  // A throwaway repo with the real prompts and backdrop, and one cannon job.
  function makeRepo(facing) {
    const tmp = mkdtempSync(join(tmpdir(), 'review-'));
    for (const rel of ['public/assets/sprites/PROMPTS.md', 'public/assets/overworld/PROMPTS.md',
      'public/assets/portraits/PROMPTS.md', 'public/assets/backgrounds/map_0_outpost_sigma.webp']) {
      mkdirSync(join(tmp, rel, '..'), { recursive: true });
      copyFileSync(join(process.cwd(), rel), join(tmp, rel));
    }
    mkdirSync(join(tmp, 'scripts/art/jobs'), { recursive: true });
    writeFileSync(join(tmp, 'scripts/art/facing.json'), JSON.stringify(facing));
    writeFileSync(join(tmp, 'scripts/art/jobs/r.json'), JSON.stringify({ batch: 'r', assets: [{ kind: 'sprite', entity: 'tower_cannon' }] }));
    const dir = join(tmp, 'cache/candidates/r/tower_cannon');
    mkdirSync(dir, { recursive: true });
    for (const i of [0, 1, 2]) {
      writeFileSync(join(dir, `${i}.png`), '');
      writeFileSync(join(dir, `${i}.json`), JSON.stringify({ index: i, round: 0, mode: 'txt2img' }));
    }
    writeFileSync(join(dir, '0.cut.png'), '');
    writeFileSync(join(dir, '0.cut.json'), '{"mirror": true}');
    writeFileSync(join(dir, '1.cut.png'), '');   // cut.json missing: mirror unknown
    return tmp;
  }

  it('refuses a job whose batch differs from its file name', async () => {
    const tmp = makeRepo({ default: true });
    try {
      writeFileSync(join(tmp, 'scripts/art/jobs/r.json'), JSON.stringify({ batch: 'renamed', assets: [{ kind: 'sprite', entity: 'tower_cannon' }] }));
      await expect(buildReview({ repoRoot: tmp, batch: 'r', cache: join(tmp, 'cache') }))
        .rejects.toThrow('batch "renamed" does not match the job file name "r.json"');
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });

  it('treats a cutout without its cut.json as uncut and mirrors raw tiles per facing', async () => {
    for (const mirror of [true, false]) {
      const tmp = makeRepo({ default: true, tower_cannon: mirror });
      try {
        const d = new JSDOM(readFileSync(await buildReview({ repoRoot: tmp, batch: 'r', cache: join(tmp, 'cache') }), 'utf8')).window.document;
        const tile = i => d.querySelector(`.c[data-index="${i}"]`);
        expect(tile(0).querySelector('img.big').getAttribute('src')).toMatch(/0\.cut\.png$/);
        expect(tile(0).querySelector('.flip')).not.toBeNull();
        for (const i of [1, 2]) {
          expect(tile(i).querySelector('img.big').getAttribute('src')).toMatch(new RegExp(`/${i}\\.png$`));
          expect(tile(i).querySelector('.flip')).toBeNull();
          expect(tile(i).querySelector('img.big').classList.contains('mirrored')).toBe(mirror);
        }
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    }
  });
});
