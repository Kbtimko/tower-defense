// `npm run art:apply -- <picks.json> [--cache dir] [--allow-fake] [--dry-run]`:
// installs each picked candidate (see src/assets/applyPlan.js), then runs the
// strict asset check and the tests. It never commits: review `git status` after.
// prepareApply is importable (Task 11's end-to-end test) and never exits.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveJob } from '../../src/assets/artJob.js';
import { cacheRoot, candidateDir, readExisting, cliPath } from '../../src/assets/candidates.js';
import { validatePicks } from '../../src/assets/picks.js';
import { planApply, describeStep } from '../../src/assets/applyPlan.js';
import { SPRITE_MANIFEST } from '../../src/data/sprites.js';
import { loadFacing, loadPromptSources, readMetas } from './runJob.mjs';
import { executeSteps } from './applyExec.mjs';

const dataPaths = repoRoot => ({
  spritesPath: join(repoRoot, 'src/data/sprites.js'),
  variantsPath: join(repoRoot, 'src/data/spriteVariants.js'),
  facingPath: join(repoRoot, 'scripts/art/facing.json'),
});

// The mirror prepare_review.py drew the preview with; undefined when the
// candidate was never prepared (apply then falls back to the job's facing).
function readReviewMirror(path) {
  if (!existsSync(path)) return undefined;
  try {
    const { mirror } = JSON.parse(readFileSync(path, 'utf8'));
    return typeof mirror === 'boolean' ? mirror : undefined;
  } catch {
    return undefined;
  }
}

const stripAnsi = text => String(text).replace(/\x1b\[[0-9;]*m/g, '');

// Vitest marks each failing file with a `FAIL  <path>` line (once per failed test,
// and once for a file that would not load). Unique, in order of appearance.
export function failingTestFiles(output) {
  const files = [...stripAnsi(output).matchAll(/^\s*FAIL\s+(\S+)/gm)].map(m => m[1]);
  return [...new Set(files)];
}

const PAD_FIT_TEST = 'src/systems/tierLookPadFit.test.js';

// What a failed apply leaves behind and how to undo it. Only backups that ran.
export function failureHints(steps, failedStep, { error = '' } = {}) {
  const ran = steps.slice(0, steps.indexOf(failedStep) + 1);
  const lines = ['src/data/sprites.js, src/data/spriteVariants.js and scripts/art/facing.json were restored;',
    'copied references and built sheets were left in place for inspection.'];
  if (failedStep?.op === 'check' && failedStep.cmd.join(' ') === 'npm test') {
    const files = failingTestFiles(error);
    if (files.length) lines.push('Failing test files:', ...files.map(f => `  ${f}`));
    if (files.includes(PAD_FIT_TEST)) {
      lines.push(`${PAD_FIT_TEST} failing means the new art changed tower footprints:`,
        '  a footprint clash: check the overlaps in the game; change the pinned set only on purpose.',
        '  off the 36px footprint: set that variant\'s `scale` in src/data/spriteVariants.js to scale * 36 / width',
        '    (width is in the failure message), then re-run apply. The tolerance stays as is.');
    }
  }
  lines.push('To undo the art it wrote:',
    '  git restore public/assets/sprites public/assets/overworld public/assets/portraits assets-src/sprites',
    '  git clean -n public/assets/sprites assets-src/sprites   (new variant sheets are untracked;',
    '    then git clean -f <each path it printed>)');
  const backups = ran.filter(s => s.op === 'backup');
  if (backups.length) {
    lines.push('The previous references were backed up; to put them back:',
      ...backups.map(b => `  cp ${b.to} ${b.from}`));
  }
  return lines;
}

// A built sheet lands in assets-src/ and normalize.py ships it under public/.
const sheetPaths = states => Object.values(states ?? {}).flatMap(st =>
  [`assets-src/${st.path.replace(/^assets\//, '')}`, `public/${st.path}`]);

// What a successful apply changed, in step order, and what the checks reported.
export function appliedSummary(steps, checks, manifest) {
  const changed = [];
  for (const s of steps) {
    if (s.op === 'backup') changed.push(`${s.to} (the previous reference)`);
    else if (s.op === 'copy' || s.op === 'resize') changed.push(s.to);
    else if (s.op === 'setFacing') changed.push('scripts/art/facing.json');
    else if (s.op === 'writeVariant') changed.push('src/data/spriteVariants.js');
    else if (s.op === 'setGround') {
      changed.push(s.target === 'sprites' ? 'src/data/sprites.js' : 'src/data/spriteVariants.js');
    } else if (s.op === 'run' && s.cmd[1] === 'scripts/build-sprite-sheets.py') {
      const [entity, variant] = s.cmd[2].split('.');
      const cut = entity.indexOf('_');
      const [category, type] = [entity.slice(0, cut), entity.slice(cut + 1)];
      const declared = steps.find(w => w.op === 'writeVariant' && w.key === `${category}/${type}` && w.variant === variant);
      const states = variant ? declared?.def.states
        : manifest.find(e => e.category === category && e.type === type)?.states;
      changed.push(...sheetPaths(states));
    }
  }
  const lines = ['Changed:', ...[...new Set(changed)].map(f => `  ${f}`), 'Checks:'];
  for (const { cmd, output } of checks) {
    const text = stripAnsi(output);
    const result = /^\s*Tests\s+(.+?)\s*$/m.exec(text)?.[1]
      ?? text.split('\n').map(l => l.trim()).filter(Boolean).at(-1) ?? '';
    lines.push(`  ${cmd.join(' ')}: ok${result ? ` (${result})` : ''}`);
  }
  return lines;
}

// -> { errors, steps, message? }. Errors mean nothing may be applied.
export function prepareApply({ repoRoot, picks, cache, allowFake = false, timestamp, env = process.env }) {
  const fail = errors => ({ errors, steps: [] });
  if (typeof picks?.batch !== 'string') return fail(['picks.json has no batch']);
  const jobPath = join(repoRoot, 'scripts/art/jobs', `${picks.batch}.json`);
  if (!existsSync(jobPath)) return fail([`no job file for batch "${picks.batch}" at ${jobPath}`]);

  const facing = loadFacing(repoRoot);
  const { job, errors: jobErrors } = resolveJob(JSON.parse(readFileSync(jobPath, 'utf8')),
    loadPromptSources(repoRoot), { facing, batchName: picks.batch });
  if (jobErrors.length) return fail(jobErrors.map(e => `job "${picks.batch}": ${e}`));

  const cacheDir = cacheRoot(repoRoot, { cache, env });
  const metas = {};
  const existingByAsset = {};
  for (const asset of job.assets) {
    const dir = candidateDir(cacheDir, job.batch, asset.assetId);
    const { names, metas: m } = readMetas(dir, () => {});
    metas[asset.assetId] = m;
    existingByAsset[asset.assetId] = readExisting(names, m).map(e => e.index);
    for (const [index, meta] of Object.entries(m)) {
      const reviewMirror = readReviewMirror(join(dir, `${index}.cut.json`));
      if (reviewMirror !== undefined) m[index] = { ...meta, reviewMirror };
    }
  }

  const errors = validatePicks(picks, job, existingByAsset);
  if (errors.length) return fail(errors);
  if (Object.keys(picks.picks).length === 0) {
    return { errors: [], steps: [], message: 'Nothing to apply: picks.json picks no assets.' };
  }
  try {
    const steps = planApply({
      picks, job, metas, cache: cacheDir, manifest: SPRITE_MANIFEST, timestamp,
      allowFake, refExists: existsSync, facing,
    });
    return { errors: [], steps };
  } catch (err) {
    return fail([err.message]);
  }
}

async function main(argv) {
  const value = name => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const picksArg = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--cache');
  const picksPath = cliPath(picksArg);
  if (!picksPath) {
    console.error('usage: npm run art:apply -- <picks.json> [--cache dir] [--allow-fake] [--dry-run]');
    return 1;
  }
  const repoRoot = process.cwd();
  let picks;
  try { picks = JSON.parse(readFileSync(picksPath, 'utf8')); } catch (err) {
    console.error(`cannot read ${picksPath}: ${err.message}`);
    return 1;
  }

  const { errors, steps, message } = prepareApply({
    repoRoot, picks, cache: cliPath(value('--cache')), allowFake: argv.includes('--allow-fake'),
    timestamp: new Date().toISOString().replace(/[:.]/g, '-'),
  });
  if (errors.length) {
    console.error(`${picksPath} cannot be applied:`);
    for (const e of errors) console.error(`  - ${e}`);
    return 1;
  }
  if (message) { console.log(message); return 0; }

  if (argv.includes('--dry-run')) {
    console.log(`\nApply plan for batch "${picks.batch}" (${steps.length} steps):\n`);
    for (const s of steps) console.log(`  ${describeStep(s)}`);
    console.log('\nDry run: nothing changed.\n');
    return 0;
  }

  console.log(`\nApplying batch "${picks.batch}":\n`);
  const res = await executeSteps(steps, { repoRoot, ...dataPaths(repoRoot), onLog: l => console.log(`  ${l}`) });
  if (!res.ok) {
    console.error(`\nApply FAILED at: ${describeStep(res.failedStep)}`);
    for (const line of failureHints(steps, res.failedStep, { error: res.error })) console.error(line);
    console.error('');
    return 1;
  }
  console.log('');
  for (const line of appliedSummary(steps, res.checks, SPRITE_MANIFEST)) console.log(line);
  console.log('\nApplied. Nothing is committed: review `git status` and commit what you keep.\n');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)));
}
