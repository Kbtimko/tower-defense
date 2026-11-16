// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { runJob } from './runJob.mjs';
import { buildReview } from './review.mjs';
import { prepareApply } from './apply.mjs';
import { executeSteps } from './applyExec.mjs';
import { parseSpriteVariants } from '../../src/assets/applyPlan.js';

const REAL = process.cwd();
let tmp;
afterAll(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

// A throwaway repo root: the real PROMPTS, job and data files are copied in, so the
// run can neither touch the real tree nor depend on prompts a later task edits.
function makeRepo() {
  tmp = mkdtempSync(join(tmpdir(), 'pipeline-e2e-'));
  const copy = (rel) => {
    mkdirSync(join(tmp, rel, '..'), { recursive: true });
    copyFileSync(join(REAL, rel), join(tmp, rel));
  };
  for (const rel of [
    'public/assets/sprites/PROMPTS.md', 'public/assets/overworld/PROMPTS.md',
    'public/assets/portraits/PROMPTS.md', 'public/assets/backgrounds/map_0_outpost_sigma.webp',
    'scripts/art/jobs/smoke.json', 'scripts/art/facing.json',
    'src/data/sprites.js', 'src/data/spriteVariants.js',
  ]) copy(rel);
  // The smoke job needs the archer.t4a bullet; keep this test independent of the real one.
  const md = join(tmp, 'public/assets/sprites/PROMPTS.md');
  if (!/\*\*archer\.t4a\*\*/.test(readFileSync(md, 'utf8'))) {
    writeFileSync(md, readFileSync(md, 'utf8').replace(/^(- \*\*cannon\*\* .*)$/m,
      '$1\n- **archer.t4a** — `#8B4513`: `upgraded ballista with twin bows`'));
  }
  return tmp;
}

// Stands in for python3 and npm. normalize must write the --ground-json it is
// told about, because the executor reads the ground back from it.
function stubRun() {
  const calls = [];
  const run = async (cmd) => {
    calls.push(cmd);
    const gi = cmd.indexOf('--ground-json');
    if (gi !== -1) {
      const key = cmd[cmd.indexOf('--only') + 1];
      writeFileSync(cmd[gi + 1], JSON.stringify([{ key, ground: { footY: 30.5, width: 33 } }]));
    }
    return { code: 0, output: 'ok' };
  };
  return { run, calls };
}

const protectedStatus = () => execFileSync('git', ['status', '--porcelain', '--', 'public', 'assets-src', 'src/data'],
  { cwd: REAL, encoding: 'utf8' });

describe('pipeline end to end (--fake, no Python, no Draw Things)', () => {
  it('generates, reviews, picks and applies a batch without touching the real tree', async () => {
    const before = protectedStatus();
    const root = makeRepo();
    const cache = join(root, 'cache');
    const logs = [];

    const code = await runJob({ repoRoot: root, batch: 'smoke', fake: true, noPrepare: true, cache, log: m => logs.push(m) });
    expect(code).toBe(0);
    const dirs = ['tower_cannon', 'tower_archer.t4a'].map(id => join(cache, 'candidates/smoke', id));
    for (const d of dirs) {
      for (let i = 0; i < 3; i++) {
        expect(existsSync(join(d, `${i}.png`))).toBe(true);
        expect(JSON.parse(readFileSync(join(d, `${i}.json`), 'utf8')).mode).toBe('fake');
      }
    }

    // prepare_review.py (Python) is skipped, so stand in for its outputs: the review
    // page only links cut/preview files that exist, and apply reads the cut.json mirror.
    const tiny = await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    for (const d of dirs) {
      for (let i = 0; i < 3; i++) {
        writeFileSync(join(d, `${i}.cut.png`), tiny);
        writeFileSync(join(d, `${i}.preview.png`), tiny);
        writeFileSync(join(d, `${i}.cut.json`), JSON.stringify({ mirror: false }));
      }
    }

    const html = readFileSync(await buildReview({ repoRoot: root, batch: 'smoke', cache }), 'utf8');
    expect(html).toContain('tower_cannon');
    expect(html).toContain('tower_archer.t4a');

    const picks = { batch: 'smoke', picks: { tower_cannon: 1, 'tower_archer.t4a': 0 }, flip: [], reroll: [] };
    const refused = prepareApply({ repoRoot: root, picks, cache, timestamp: 'TS' });
    expect(refused.errors.join('\n')).toMatch(/fake candidate; pass --allow-fake/);

    const plan = prepareApply({ repoRoot: root, picks, cache, allowFake: true, timestamp: 'TS' });
    expect(plan.errors).toEqual([]);
    const paths = {
      spritesPath: join(root, 'src/data/sprites.js'),
      variantsPath: join(root, 'src/data/spriteVariants.js'),
      facingPath: join(root, 'scripts/art/facing.json'),
    };
    const { run, calls } = stubRun();
    const res = await executeSteps(plan.steps, { repoRoot: root, ...paths, run });
    expect(res.ok).toBe(true);
    expect(calls.some(c => c[1] === 'scripts/art/normalize.py')).toBe(true);

    const variants = parseSpriteVariants(readFileSync(paths.variantsPath, 'utf8'));
    const t4a = variants['tower/archer'].t4a;
    expect(t4a.ground).toEqual({ footY: 30.5, width: 33 });
    expect(Object.keys(t4a.states).length).toBeGreaterThan(0);
    expect(readFileSync(paths.spritesPath, 'utf8')).toMatch(
      /type: 'cannon',\n.*\n {4}ground: \{ footY: 30\.5, width: 33\.0 \},/);

    expect(protectedStatus()).toBe(before);
  }, 60000);
});
