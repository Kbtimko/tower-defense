// Carries out the steps planApply produced. The three data files it edits
// (sprites.js, spriteVariants.js, facing.json) are snapshotted first and restored
// byte-for-byte if any step fails, so a half-applied pick can never leave the game
// declaring art that was not built. Image outputs (references, sheets) are left
// in place for inspection: they are not read by the game until declared.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import {
  describeStep, setGroundLine, renderSpriteVariants, parseSpriteVariants,
} from '../../src/assets/applyPlan.js';

export function spawnCapture(cmd, cwd) {
  return new Promise((done) => {
    const child = spawn(cmd[0], cmd.slice(1), { cwd });
    let output = '';
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('error', (err) => done({ code: 1, output: `could not start ${cmd[0]}: ${err.message}` }));
    child.on('close', (code) => done({ code: code ?? 1, output }));
  });
}

// `default` stays first because it is the fallback a reader looks for; the rest
// are sorted so re-recording the same facing is byte-stable.
function renderFacing(facing) {
  const { default: def, ...rest } = facing;
  const ordered = def === undefined ? {} : { default: def };
  for (const k of Object.keys(rest).sort()) ordered[k] = rest[k];
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function groundFrom(fromJson, key) {
  const rec = JSON.parse(readFileSync(fromJson, 'utf8')).find(r => r.key === key);
  if (!rec) throw new Error(`no ground for ${key} in ${fromJson}`);
  return rec.ground;
}

export async function executeSteps(steps, {
  repoRoot, spritesPath, variantsPath, facingPath, run, onLog = () => {},
  signals = process, exit = code => process.exit(code),
}) {
  const runCmd = run ?? (cmd => spawnCapture(cmd, repoRoot));
  const abs = p => resolve(repoRoot, p);
  const log = [];
  const say = (line) => { log.push(line); onLog(line); };

  const guarded = [spritesPath, variantsPath, facingPath];
  const saved = guarded.map(p => (existsSync(p) ? readFileSync(p) : null));
  const restore = () => guarded.forEach((p, i) => {
    if (saved[i] === null) rmSync(p, { force: true });
    else writeFileSync(p, saved[i]);
  });

  // normalize.py writes the ground json but does not create its directory, and a
  // stale json from an earlier apply must never be mistaken for this run's.
  for (const s of steps) {
    if (s.op !== 'setGround') continue;
    mkdirSync(dirname(abs(s.fromJson)), { recursive: true });
    rmSync(abs(s.fromJson), { force: true });
  }

  const handlers = {
    backup: s => { mkdirSync(dirname(abs(s.to)), { recursive: true }); copyFileSync(abs(s.from), abs(s.to)); },
    copy: s => { mkdirSync(dirname(abs(s.to)), { recursive: true }); copyFileSync(abs(s.from), abs(s.to)); },
    resize: async (s) => {
      mkdirSync(dirname(abs(s.to)), { recursive: true });
      await sharp(abs(s.from)).resize(s.width, s.height, { fit: 'fill' }).png().toFile(abs(s.to));
    },
    run: async (s) => {
      say(`running: ${s.cmd.join(' ')} …`);
      const { code, output } = await runCmd(s.cmd);
      if (code !== 0) throw new Error(`exit ${code}\n${output}`);
    },
    writeVariant: (s) => {
      const variants = parseSpriteVariants(readFileSync(variantsPath, 'utf8'));
      variants[s.key] = { ...variants[s.key], [s.variant]: s.def };
      writeFileSync(variantsPath, renderSpriteVariants(variants));
    },
    setGround: (s) => {
      const fromJson = abs(s.fromJson);
      if (s.target === 'sprites') {
        const [category, type] = s.key.split('/');
        const ground = groundFrom(fromJson, s.key);
        writeFileSync(spritesPath, setGroundLine(readFileSync(spritesPath, 'utf8'), category, type, ground));
        return;
      }
      const ground = groundFrom(fromJson, `${s.key}.${s.variant}`);
      const variants = parseSpriteVariants(readFileSync(variantsPath, 'utf8'));
      const def = variants[s.key]?.[s.variant];
      if (!def) throw new Error(`${s.key}.${s.variant} is not declared in ${variantsPath}`);
      const { ground: _old, ...rest } = def;
      variants[s.key][s.variant] = { ground, ...rest };
      writeFileSync(variantsPath, renderSpriteVariants(variants));
    },
    setFacing: (s) => {
      const facing = existsSync(facingPath) ? JSON.parse(readFileSync(facingPath, 'utf8')) : {};
      facing[s.name] = s.mirror;
      writeFileSync(facingPath, renderFacing(facing));
    },
  };
  handlers.check = handlers.run;

  // Ctrl-C during the long checks would otherwise leave the data files
  // half-applied; the terminal sends it to the child commands too.
  const onInterrupt = () => {
    restore();
    say('interrupted: data files restored');
    exit(130);
  };
  signals.on('SIGINT', onInterrupt);
  try {
    for (const step of steps) {
      // A command step announces itself as it starts (see handlers.run).
      if (step.op !== 'run' && step.op !== 'check') say(describeStep(step));
      try {
        const handler = handlers[step.op];
        if (!handler) throw new Error(`unknown step op "${step.op}"`);
        await handler(step);
      } catch (err) {
        say(`  FAILED: ${err.message}`);
        restore();
        return { ok: false, failedStep: step, log };
      }
    }
    return { ok: true, log };
  } finally {
    signals.off('SIGINT', onInterrupt);
  }
}
