// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { executeSteps } from './applyExec.mjs';
import { prepareApply, failureHints, failingTestFiles, appliedSummary } from './apply.mjs';
import { EventEmitter } from 'node:events';
import { planApply, parseSpriteVariants, renderSpriteVariants, CHECK_STEPS } from '../../src/assets/applyPlan.js';
import { SPRITE_MANIFEST } from '../../src/data/sprites.js';

const REPO = process.cwd();
let tmp, cache, paths;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'apply-'));
  cache = join(tmp, 'cache');
  paths = {
    spritesPath: join(tmp, 'sprites.js'),
    variantsPath: join(tmp, 'spriteVariants.js'),
    facingPath: join(tmp, 'facing.json'),
    sprite2xPath: join(tmp, 'sprite2x.js'),
  };
  copyFileSync(join(REPO, 'src/data/sprites.js'), paths.spritesPath);
  // An empty fixture, not the live file: the live one fills up as variants are applied.
  writeFileSync(paths.variantsPath, renderSpriteVariants({}));
  copyFileSync(join(REPO, 'scripts/art/facing.json'), paths.facingPath);
  copyFileSync(join(REPO, 'src/data/sprite2x.js'), paths.sprite2xPath);
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const solid = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 9, g: 80, b: 9 } } }).png();
const snapshot = () => Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, readFileSync(p)]));

const cannon = { assetId: 'tower_cannon', kind: 'sprite', category: 'tower', type: 'cannon', entity: 'tower_cannon', mirror: true, keepDebris: false };
const archerT4a = { assetId: 'tower_archer.t4a', kind: 'sprite', category: 'tower', type: 'archer', variant: 't4a', entity: 'tower_archer', mirror: false, keepDebris: false };
const outpost = { assetId: 'overworld_0_outpost_sigma', kind: 'overworld', id: 'overworld_0_outpost_sigma' };

async function candidate(assetId, index) {
  const dir = join(cache, 'candidates', 'b', assetId);
  mkdirSync(dir, { recursive: true });
  await solid(1024, 1024).toFile(join(dir, `${index}.png`));
}
const planFor = (assets, picks, flip = []) => planApply({
  picks: { batch: 'b', picks, flip, reroll: [] },
  job: { batch: 'b', assets },
  metas: Object.fromEntries(Object.entries(picks).map(([id, i]) => [id, { [i]: { mode: 'txt2img', round: 0 } }])),
  cache, manifest: SPRITE_MANIFEST, timestamp: 'TS', refExists: existsSync,
  facing: JSON.parse(readFileSync(paths.facingPath, 'utf8')),
});

// Stands in for Python and npm: normalize writes the ground json it was asked for.
function stubRun({ failOn } = {}) {
  const calls = [];
  const run = async (cmd) => {
    calls.push(cmd);
    if (failOn && failOn(cmd)) return { code: 1, output: 'Traceback: boom' };
    const gi = cmd.indexOf('--ground-json');
    if (gi !== -1) {
      const key = cmd[cmd.indexOf('--only') + 1];
      writeFileSync(cmd[gi + 1], JSON.stringify([{ key, ground: { footY: 30.5, width: 33 } }]));
    }
    return { code: 0, output: 'ok' };
  };
  return { run, calls };
}
const isNormalize = cmd => cmd[1] === 'scripts/art/normalize.py';

describe('executeSteps', () => {
  it('installs a base and a flipped variant pick and runs the checks', async () => {
    mkdirSync(join(cache, 'sprites'), { recursive: true });
    await solid(64, 64).toFile(join(cache, 'sprites/tower_cannon.png'));
    const oldRef = readFileSync(join(cache, 'sprites/tower_cannon.png'));
    await candidate('tower_cannon', 0);
    await candidate('tower_archer.t4a', 1);
    const steps = planFor([cannon, archerT4a], { tower_cannon: 0, 'tower_archer.t4a': 1 }, ['tower_archer.t4a']);
    const { run, calls } = stubRun();

    const res = await executeSteps(steps, { repoRoot: tmp, ...paths, run });
    expect(res.ok).toBe(true);
    expect(res.log).toHaveLength(steps.length);
    // A long npm test must not look like a hang: each command announces itself.
    expect(res.log.filter(l => l.startsWith('running: '))).toEqual(
      steps.filter(st => st.op === 'run' || st.op === 'check').map(st => `running: ${st.cmd.join(' ')} …`));

    expect(readFileSync(join(cache, 'sprites/backup/tower_cannon-TS.png'))).toEqual(oldRef);
    expect(readFileSync(join(cache, 'sprites/tower_cannon.png')))
      .toEqual(readFileSync(join(cache, 'candidates/b/tower_cannon/0.png')));
    expect(existsSync(join(cache, 'sprites/tower_archer.t4a.png'))).toBe(true);

    expect(readFileSync(paths.spritesPath, 'utf8')).toMatch(
      /type: 'cannon',\n.*\n {4}ground: \{ footY: 30\.5, width: 33\.0 \},/);
    const variants = parseSpriteVariants(readFileSync(paths.variantsPath, 'utf8'));
    expect(variants['tower/archer'].t4a.ground).toEqual({ footY: 30.5, width: 33 });
    expect(Object.keys(variants['tower/archer'].t4a)).toEqual(['ground', 'states']);
    expect(variants['tower/archer'].t4a.states.idle.path).toBe('assets/sprites/towers/archer_t4a_idle.png');

    const facingText = readFileSync(paths.facingPath, 'utf8');
    const facing = JSON.parse(facingText);
    expect(facing['tower_archer.t4a']).toBe(true);
    expect(Object.keys(facing)[0]).toBe('default');
    expect(Object.keys(facing).slice(1)).toEqual([...Object.keys(facing).slice(1)].sort());
    expect(facingText).toBe(`${JSON.stringify(facing, null, 2)}\n`);

    expect(calls.map(c => c.slice(0, 3).join(' '))).toEqual([
      'python3 scripts/build-sprite-sheets.py tower_cannon',
      'python3 scripts/art/normalize.py --only',
      'python3 scripts/build-sprite-sheets.py tower_cannon',
      'python3 scripts/art/normalize.py --scale',
      'python3 scripts/build-sprite-sheets.py tower_archer.t4a',
      'python3 scripts/art/normalize.py --only',
      'python3 scripts/build-sprite-sheets.py tower_archer.t4a',
      'python3 scripts/art/normalize.py --scale',
      'npm run assets',
      'npm test',
    ]);
  });

  it('writing the same variant twice leaves spriteVariants.js byte-identical', async () => {
    const steps = planFor([archerT4a], { 'tower_archer.t4a': 0 }).filter(s => s.op === 'writeVariant');
    const { run } = stubRun();
    expect((await executeSteps(steps, { repoRoot: tmp, ...paths, run })).ok).toBe(true);
    const first = readFileSync(paths.variantsPath);
    expect((await executeSteps(steps, { repoRoot: tmp, ...paths, run })).ok).toBe(true);
    expect(readFileSync(paths.variantsPath)).toEqual(first);
  });

  it('restores a sprite2x.js that an earlier step rewrote when a later step fails', async () => {
    // normalize.py --scale 2 regenerates this file; a failed apply must not leave
    // the game declaring @2x sheets that were not built.
    writeFileSync(paths.sprite2xPath, 'export const SPRITE_2X = new Set([]);\n');
    const before = readFileSync(paths.sprite2xPath);
    const steps = [{ op: 'run', cmd: ['rewrite-2x'] }, { op: 'run', cmd: ['boom'] }];
    const run = async (cmd) => {
      if (cmd[0] === 'rewrite-2x') {
        writeFileSync(paths.sprite2xPath, 'export const SPRITE_2X = new Set(["x"]);\n');
        return { code: 0, output: 'ok' };
      }
      return { code: 1, output: 'boom' };
    };
    const res = await executeSteps(steps, { repoRoot: tmp, ...paths, run });
    expect(res.ok).toBe(false);
    expect(readFileSync(paths.sprite2xPath)).toEqual(before);
  });

  it('keeps other variant entries when writing one', async () => {
    writeFileSync(paths.variantsPath, renderSpriteVariants({ 'tower/mage': { t2: { states: {} } } }));
    const steps = planFor([archerT4a], { 'tower_archer.t4a': 0 }).filter(s => s.op === 'writeVariant');
    await executeSteps(steps, { repoRoot: tmp, ...paths, run: stubRun().run });
    expect(Object.keys(parseSpriteVariants(readFileSync(paths.variantsPath, 'utf8')))).toEqual(['tower/archer', 'tower/mage']);
  });

  it('keeps a hand-set scale and anchor on the variant when writing new states', async () => {
    writeFileSync(paths.variantsPath, renderSpriteVariants({
      'tower/archer': { t4a: { scale: 0.75, anchor: { x: 0.5, y: 0.9 }, states: {} } },
    }));
    const steps = planFor([archerT4a], { 'tower_archer.t4a': 0 }).filter(s => s.op === 'writeVariant');
    await executeSteps(steps, { repoRoot: tmp, ...paths, run: stubRun().run });
    const def = parseSpriteVariants(readFileSync(paths.variantsPath, 'utf8'))['tower/archer'].t4a;
    expect(def.scale).toBe(0.75);
    expect(def.anchor).toEqual({ x: 0.5, y: 0.9 });
    expect(Object.keys(def.states).length).toBeGreaterThan(0);
  });

  it('rolls back the data files when normalize fails, keeping the image outputs', async () => {
    await candidate('tower_archer.t4a', 1);
    const steps = planFor([archerT4a], { 'tower_archer.t4a': 1 }, ['tower_archer.t4a']);
    expect(steps.map(s => s.op)).toContain('writeVariant');
    expect(steps.map(s => s.op)).toContain('setFacing');
    const before = snapshot();
    const { run, calls } = stubRun({ failOn: isNormalize });

    const res = await executeSteps(steps, { repoRoot: tmp, ...paths, run });
    expect(res.ok).toBe(false);
    expect(res.failedStep).toBe(steps.find(s => s.op === 'run' && isNormalize(s.cmd)));
    expect(res.log.join('\n')).toContain('Traceback: boom');
    expect(calls.some(c => c[0] === 'npm')).toBe(false);
    expect(snapshot()).toEqual(before);
    expect(existsSync(join(cache, 'sprites/tower_archer.t4a.png'))).toBe(true);
  });

  it('fails and rolls back when the ground json lacks the entry', async () => {
    await candidate('tower_cannon', 0);
    const steps = planFor([cannon], { tower_cannon: 0 });
    const before = snapshot();
    const run = async (cmd) => {
      const gi = cmd.indexOf('--ground-json');
      if (gi !== -1) writeFileSync(cmd[gi + 1], '[]');
      return { code: 0, output: '' };
    };
    const res = await executeSteps(steps, { repoRoot: tmp, ...paths, run });
    expect(res.ok).toBe(false);
    expect(res.failedStep.op).toBe('setGround');
    expect(res.log.join('\n')).toContain('no ground for tower/cannon');
    expect(snapshot()).toEqual(before);
  });

  it('rolls back when a check fails after the data files changed', async () => {
    await candidate('tower_cannon', 0);
    const steps = planFor([cannon], { tower_cannon: 0 });
    const before = snapshot();
    const res = await executeSteps(steps, { repoRoot: tmp, ...paths, run: stubRun({ failOn: c => c[1] === 'test' }).run });
    expect(res.ok).toBe(false);
    expect(res.failedStep).toEqual({ op: 'check', cmd: ['npm', 'test'] });
    expect(snapshot()).toEqual(before);
  });

  it('restores the data files and exits non-zero on Ctrl-C, then unhooks itself', async () => {
    await candidate('tower_archer.t4a', 1);
    const steps = planFor([archerT4a], { 'tower_archer.t4a': 1 }, ['tower_archer.t4a']);
    const before = snapshot();
    const signals = new EventEmitter();
    const exits = [];
    let restoredAtExit;
    // The real exit never returns, so the files must already be restored when it is called.
    const exit = (code) => {
      exits.push(code);
      restoredAtExit = Object.entries(before).every(([k, buf]) => readFileSync(paths[k]).equals(buf));
      throw new Error('exited');
    };
    const { run: base } = stubRun();
    let changedAtInterrupt;
    const run = async (cmd) => {
      if (cmd[1] === 'test') {
        changedAtInterrupt = !snapshot().variantsPath.equals(before.variantsPath);
        signals.emit('SIGINT');
      }
      return base(cmd);
    };
    const res = await executeSteps(steps, { repoRoot: tmp, ...paths, run, signals, exit });
    expect(changedAtInterrupt).toBe(true);
    expect(exits).toEqual([130]);
    expect(restoredAtExit).toBe(true);
    expect(res.ok).toBe(false);
    expect(snapshot()).toEqual(before);
    expect(signals.listenerCount('SIGINT')).toBe(0);
  });

  it('unhooks the SIGINT handler after a successful run', async () => {
    const signals = new EventEmitter();
    const steps = planFor([archerT4a], { 'tower_archer.t4a': 0 }).filter(st => st.op === 'writeVariant');
    expect((await executeSteps(steps, { repoRoot: tmp, ...paths, run: stubRun().run, signals })).ok).toBe(true);
    expect(signals.listenerCount('SIGINT')).toBe(0);
  });

  it('resizes an overworld pick into public/ at the exact expected size', async () => {
    await candidate('overworld_0_outpost_sigma', 0);
    const steps = planFor([outpost], { overworld_0_outpost_sigma: 0 });
    const res = await executeSteps(steps, { repoRoot: tmp, ...paths, run: stubRun().run });
    expect(res.ok).toBe(true);
    const meta = await sharp(join(tmp, 'public/assets/overworld/overworld_0_outpost_sigma.png')).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([512, 512, 'png']);
  });
});

describe('prepareApply', () => {
  // A throwaway repo: the real PROMPTS.md files plus a job, so the CLI layer runs end to end.
  function makeRepo(assets) {
    for (const d of ['sprites', 'overworld', 'portraits']) {
      mkdirSync(join(tmp, 'public/assets', d), { recursive: true });
      copyFileSync(join(REPO, `public/assets/${d}/PROMPTS.md`), join(tmp, `public/assets/${d}/PROMPTS.md`));
    }
    mkdirSync(join(tmp, 'scripts/art/jobs'), { recursive: true });
    copyFileSync(paths.facingPath, join(tmp, 'scripts/art/facing.json'));
    writeFileSync(join(tmp, 'scripts/art/jobs/b.json'), JSON.stringify({ batch: 'b', assets }));
  }
  async function fakeCandidate(assetId, index, mode = 'txt2img') {
    await candidate(assetId, index);
    writeFileSync(join(cache, 'candidates/b', assetId, `${index}.json`),
      JSON.stringify({ index, round: 0, seed: 1, mode, prompt: 'p', createdAt: 'x' }));
  }
  const JOB = [{ kind: 'sprite', entity: 'tower_cannon' }, { kind: 'overworld', id: 'overworld_0_outpost_sigma' }];

  it('plans a valid picks file', async () => {
    makeRepo(JOB);
    await fakeCandidate('tower_cannon', 0);
    const r = prepareApply({ repoRoot: tmp, picks: { batch: 'b', picks: { tower_cannon: 0 }, flip: [], reroll: [] }, cache, timestamp: 'TS' });
    expect(r.errors).toEqual([]);
    expect(r.steps.map(s => s.op)).toEqual(['copy', 'run', 'run', 'setGround', 'run', 'run', 'check', 'check']);
  });

  it('re-applying the same flipped picks three times leaves facing.json as the first apply set it', async () => {
    makeRepo(JOB);
    await fakeCandidate('tower_cannon', 0);
    // What prepare_review.py recorded: the preview was mirrored per the facing table.
    writeFileSync(join(cache, 'candidates/b/tower_cannon/0.cut.json'), '{"mirror": true}\n');
    const facingPath = join(tmp, 'scripts/art/facing.json');
    const picks = { batch: 'b', picks: { tower_cannon: 0 }, flip: ['tower_cannon'], reroll: [] };
    const recorded = [];
    const facingAfter = [];
    for (let n = 0; n < 3; n++) {
      const { errors, steps } = prepareApply({ repoRoot: tmp, picks, cache, timestamp: `T${n}` });
      expect(errors).toEqual([]);
      recorded.push(steps.filter(st => st.op === 'setFacing').map(st => st.mirror));
      const res = await executeSteps(steps, { repoRoot: tmp, ...paths, facingPath, run: stubRun().run });
      expect(res.ok).toBe(true);
      facingAfter.push(readFileSync(facingPath, 'utf8'));
    }
    expect(recorded).toEqual([[false], [], []]);
    expect(JSON.parse(facingAfter[0]).tower_cannon).toBe(false);
    expect(facingAfter[1]).toBe(facingAfter[0]);
    expect(facingAfter[2]).toBe(facingAfter[0]);
  });

  it('a picks file whose index was removed gives errors and no steps', async () => {
    makeRepo(JOB);
    await fakeCandidate('tower_cannon', 0);
    const r = prepareApply({ repoRoot: tmp, picks: { batch: 'b', picks: { tower_cannon: 1 }, flip: [], reroll: [] }, cache, timestamp: 'TS' });
    expect(r.errors).toEqual(['tower_cannon: no candidate #1']);
    expect(r.steps).toEqual([]);
  });

  it('an empty picks file says there is nothing to apply', () => {
    makeRepo(JOB);
    const r = prepareApply({ repoRoot: tmp, picks: { batch: 'b', picks: {}, flip: [], reroll: [] }, cache, timestamp: 'TS' });
    expect(r).toEqual({ errors: [], steps: [], message: 'Nothing to apply: picks.json picks no assets.' });
  });

  it('reports a fake pick as an error unless allowFake', async () => {
    makeRepo(JOB);
    await fakeCandidate('tower_cannon', 0, 'fake');
    const picks = { batch: 'b', picks: { tower_cannon: 0 }, flip: [], reroll: [] };
    const r = prepareApply({ repoRoot: tmp, picks, cache, timestamp: 'TS' });
    expect(r.errors).toEqual(['tower_cannon #0 is a fake candidate; pass --allow-fake to apply it anyway']);
    expect(r.steps).toEqual([]);
    expect(prepareApply({ repoRoot: tmp, picks, cache, timestamp: 'TS', allowFake: true }).steps.length).toBe(8);
  });

  it('reports a job whose batch differs from its file name', () => {
    makeRepo(JOB);
    writeFileSync(join(tmp, 'scripts/art/jobs/b.json'), JSON.stringify({ batch: 'renamed', assets: JOB }));
    const r = prepareApply({ repoRoot: tmp, picks: { batch: 'b', picks: {}, flip: [], reroll: [] }, cache, timestamp: 'TS' });
    expect(r.errors).toEqual(['job "b": batch "renamed" does not match the job file name "b.json"']);
    expect(r.steps).toEqual([]);
  });

  it('reports a batch with no job file', () => {
    makeRepo(JOB);
    const r = prepareApply({ repoRoot: tmp, picks: { batch: 'nope', picks: {} }, cache, timestamp: 'TS' });
    expect(r.errors).toEqual([`no job file for batch "nope" at ${join(tmp, 'scripts/art/jobs/nope.json')}`]);
  });
});

// Trimmed from a real `npx vitest run` (non-TTY) after a base-archer ground change.
const VITEST_FAIL = [
  ' ❯ src/systems/tierLookPadFit.test.js (3 tests | 2 failed) 21ms',
  ' ✓ src/data/sprites.test.js (9 tests) 4ms',
  '\x1b[31m FAIL \x1b[39m src/systems/tierLookPadFit.test.js > tier-look pad fit (R25) > footprint clashes',
  ' ❯ src/systems/tierLookPadFit.test.js:42:33',
  ' FAIL  src/systems/tierLookPadFit.test.js > tier-look pad fit (R25) > T4 rings cross',
  ' FAIL  src/scenes/BootScene.test.js [ src/scenes/BootScene.test.js ]',
  ' Test Files  2 failed | 22 passed (24)',
].join('\n');

describe('failingTestFiles', () => {
  it('lists each failing file once, in order, ignoring colour codes', () => {
    expect(failingTestFiles(VITEST_FAIL)).toEqual(['src/systems/tierLookPadFit.test.js', 'src/scenes/BootScene.test.js']);
  });
  it('finds none in a green run', () => {
    expect(failingTestFiles(' ✓ a.test.js (1 test)\n Test Files  1 passed (1)')).toEqual([]);
  });
});

describe('failureHints', () => {
  it('lists the backups that ran, how to put them back and how to undo the art', () => {
    const steps = [
      { op: 'backup', from: '/c/sprites/tower_cannon.png', to: '/c/sprites/backup/tower_cannon-TS.png' },
      { op: 'copy', from: 'a', to: 'b' },
      { op: 'run', cmd: ['python3', 'build'] },
      { op: 'backup', from: '/c/sprites/tower_archer.png', to: '/c/sprites/backup/tower_archer-TS.png' },
    ];
    const hints = failureHints(steps, steps[2]).join('\n');
    expect(hints).toContain('cp /c/sprites/backup/tower_cannon-TS.png /c/sprites/tower_cannon.png');
    expect(hints).not.toContain('tower_archer-TS.png');
    expect(hints).toContain('git restore public/assets/sprites public/assets/overworld public/assets/portraits assets-src/sprites');
    expect(hints).toContain('git clean -n public/assets/sprites assets-src/sprites');
    expect(hints).toContain('git clean -f <each path it printed>');
    expect(hints).not.toContain('Failing test files');
  });

  it('says so when no reference was backed up', () => {
    const steps = [{ op: 'run', cmd: ['npm', 'test'] }];
    expect(failureHints(steps, steps[0]).join('\n')).not.toContain('backed up');
  });

  it('names the failing test files when npm test is the failed check, and explains a pad-fit failure', () => {
    const steps = [...CHECK_STEPS];
    const hints = failureHints(steps, steps[1], { error: `exit 1\n${VITEST_FAIL}` });
    expect(hints).toContain('Failing test files:');
    expect(hints).toContain('  src/systems/tierLookPadFit.test.js');
    expect(hints).toContain('  src/scenes/BootScene.test.js');
    expect(hints.join('\n')).toMatch(/tierLookPadFit\.test\.js failing means the new art changed tower footprints/);
    expect(hints.join('\n')).toContain('a footprint clash: check the overlaps in the game');
    expect(hints.join('\n')).toContain('off the 36px footprint: set that variant\'s `scale` in src/data/spriteVariants.js to scale * 36 / width');
    expect(hints.join('\n')).not.toMatch(/loosen|widen|raise the tolerance/i);
    // The asset check's output is not vitest's: no file list there.
    expect(failureHints(steps, steps[0], { error: VITEST_FAIL }).join('\n')).not.toContain('Failing test files');
  });

  it('names sprite2x.js among the restored files and the undo list', () => {
    const steps = [{ op: 'run', cmd: ['python3', 'build'] }];
    const hints = failureHints(steps, steps[0]).join('\n');
    expect(hints).toContain('src/data/sprite2x.js');
  });

  it('explains the pinned 1x drone set when spriteResolution.test.js fails', () => {
    const steps = [...CHECK_STEPS];
    const hints = failureHints(steps, steps[1], { error: ' FAIL  src/systems/spriteResolution.test.js > exactly enemy:drone stays 1x at k=2' }).join('\n');
    expect(hints).toContain('spriteResolution.test.js failing');
    expect(hints).toContain('enemy:drone');
    expect(hints).toContain('on purpose');
    expect(failureHints(steps, steps[1], { error: ' FAIL  src/a.test.js > x' }).join('\n')).not.toContain('enemy:drone');
  });

  it('gives no footprint advice when the pad-fit test passed', () => {
    const steps = [...CHECK_STEPS];
    const hints = failureHints(steps, steps[1], { error: ' FAIL  src/a.test.js > x' }).join('\n');
    expect(hints).toContain('  src/a.test.js');
    expect(hints).not.toContain('footprints');
  });
});

describe('appliedSummary', () => {
  const CHECKS = [
    { cmd: ['npm', 'run', 'assets', '--', '--strict'], output: 'sprite (39/39)\n\n72/72 assets present · 0 required missing\n\n' },
    { cmd: ['npm', 'test'], output: ' Test Files  234 passed (234)\n      Tests  3883 passed (3883)\n   Duration  16s' },
  ];

  it('lists every file the steps changed, once, and both check results', () => {
    const steps = planFor([cannon, archerT4a, outpost], { tower_cannon: 0, 'tower_archer.t4a': 1, overworld_0_outpost_sigma: 0 },
      ['tower_archer.t4a']);
    const lines = appliedSummary([{ op: 'backup', from: 'r', to: '/c/backup/r-TS.png' }, ...steps], CHECKS, SPRITE_MANIFEST);
    expect(lines).toEqual([
      'Changed:',
      '  /c/backup/r-TS.png (the previous reference)',
      `  ${join(cache, 'sprites/tower_cannon.png')}`,
      '  assets-src/sprites/towers/cannon_idle.png',
      '  public/assets/sprites/towers/cannon_idle.png',
      '  assets-src/sprites/towers/cannon_attack.png',
      '  public/assets/sprites/towers/cannon_attack.png',
      '  src/data/sprites.js',
      '  public/assets/overworld/overworld_0_outpost_sigma.png',
      `  ${join(cache, 'sprites/tower_archer.t4a.png')}`,
      '  scripts/art/facing.json',
      '  src/data/spriteVariants.js',
      '  assets-src/sprites/towers/archer_t4a_idle.png',
      '  public/assets/sprites/towers/archer_t4a_idle.png',
      '  assets-src/sprites/towers/archer_t4a_attack.png',
      '  public/assets/sprites/towers/archer_t4a_attack.png',
      'Checks:',
      '  npm run assets -- --strict: ok (72/72 assets present · 0 required missing)',
      '  npm test: ok (3883 passed (3883))',
    ]);
  });

  it('executeSteps hands back each check output for the summary', async () => {
    const steps = CHECK_STEPS;
    const run = async cmd => ({ code: 0, output: cmd[1] === 'test' ? 'Tests  9 passed (9)' : 'all present' });
    const res = await executeSteps(steps, { repoRoot: tmp, ...paths, run });
    expect(res.checks).toEqual([
      { cmd: CHECK_STEPS[0].cmd, output: 'all present' },
      { cmd: CHECK_STEPS[1].cmd, output: 'Tests  9 passed (9)' },
    ]);
    const failed = await executeSteps(steps, { repoRoot: tmp, ...paths, run: async () => ({ code: 1, output: ' FAIL  x.test.js' }) });
    expect(failed.error).toBe('exit 1\n FAIL  x.test.js');
  });
});
