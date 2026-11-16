// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  planApply, setGroundLine, renderSpriteVariants, parseSpriteVariants, describeStep, CHECK_STEPS,
} from './applyPlan.js';
import { SPRITE_MANIFEST } from '../data/sprites.js';

const CACHE = '/c';
const FACING = { default: true, tower_archer: false };
const cannon = { assetId: 'tower_cannon', kind: 'sprite', category: 'tower', type: 'cannon', entity: 'tower_cannon', mirror: true, keepDebris: false };
const archerT4a = { assetId: 'tower_archer.t4a', kind: 'sprite', category: 'tower', type: 'archer', variant: 't4a', entity: 'tower_archer', mirror: false, keepDebris: false };
const archer = { assetId: 'tower_archer', kind: 'sprite', category: 'tower', type: 'archer', entity: 'tower_archer', mirror: false, keepDebris: false };
const outpost = { assetId: 'overworld_0_outpost_sigma', kind: 'overworld', id: 'overworld_0_outpost_sigma' };
const rael = { assetId: 'portrait-rael', kind: 'portrait', id: 'portrait-rael' };

const meta = (mode = 'txt2img') => ({ index: 0, round: 0, seed: 1, mode, prompt: 'p', createdAt: 'x' });
const plan = ({ assets, picks, flip = [], metas, refExists = () => false, allowFake, timestamp = 'TS', facing = FACING }) =>
  planApply({
    picks: { batch: 'b', picks, flip, reroll: [] },
    job: { batch: 'b', assets },
    metas: metas ?? Object.fromEntries(Object.entries(picks).map(([id, i]) => [id, { [i]: meta() }])),
    cache: CACHE, manifest: SPRITE_MANIFEST, timestamp, allowFake, refExists, facing,
  });

const GROUND = id => `/c/apply/b-${id}.ground.json`;
const build = (name, ...extra) => ({ op: 'run', cmd: ['python3', 'scripts/build-sprite-sheets.py', name, '--ref-dir', '/c/sprites', ...extra] });
const normalize = (only, id) => ({ op: 'run', cmd: ['python3', 'scripts/art/normalize.py', '--only', only, '--ground-json', GROUND(id)] });
const T4A_STATES = {
  idle: { path: 'assets/sprites/towers/archer_t4a_idle.png', frameWidth: 96, frameHeight: 96, frames: 1 },
  attack: { path: 'assets/sprites/towers/archer_t4a_attack.png', frameWidth: 96, frameHeight: 96, frames: 5, frameRate: 14 },
};

describe('planApply', () => {
  it('base sprite: backup, copy, build, normalize, ground, then the checks', () => {
    const steps = plan({ assets: [cannon], picks: { tower_cannon: 2 }, refExists: p => p === '/c/sprites/tower_cannon.png' });
    expect(steps).toEqual([
      { op: 'backup', from: '/c/sprites/tower_cannon.png', to: '/c/sprites/backup/tower_cannon-TS.png' },
      { op: 'copy', from: '/c/candidates/b/tower_cannon/2.png', to: '/c/sprites/tower_cannon.png' },
      build('tower_cannon'),
      normalize('tower/cannon', 'tower_cannon'),
      { op: 'setGround', target: 'sprites', key: 'tower/cannon', fromJson: GROUND('tower_cannon') },
      ...CHECK_STEPS,
    ]);
    expect(CHECK_STEPS).toEqual([
      { op: 'check', cmd: ['npm', 'run', 'assets', '--', '--strict'] },
      { op: 'check', cmd: ['npm', 'test'] },
    ]);
  });

  it('skips the backup when there is no reference to overwrite', () => {
    const steps = plan({ assets: [cannon], picks: { tower_cannon: 0 } });
    expect(steps.some(s => s.op === 'backup')).toBe(false);
  });

  it('passes the job cell and keepDebris to the build', () => {
    const steps = plan({ assets: [{ ...cannon, cell: 80, keepDebris: true }], picks: { tower_cannon: 0 } });
    expect(steps).toContainEqual(build('tower_cannon', '--cell', '80', '--keep-debris'));
  });

  it('variant: copy to <entity>.<variant>.png, declare it, build, normalize, ground', () => {
    const steps = plan({ assets: [archerT4a], picks: { 'tower_archer.t4a': 1 } });
    expect(steps).toEqual([
      { op: 'copy', from: '/c/candidates/b/tower_archer.t4a/1.png', to: '/c/sprites/tower_archer.t4a.png' },
      { op: 'writeVariant', key: 'tower/archer', variant: 't4a', def: { states: T4A_STATES } },
      build('tower_archer.t4a'),
      normalize('tower/archer.t4a', 'tower_archer.t4a'),
      { op: 'setGround', target: 'variants', key: 'tower/archer', variant: 't4a', fromJson: GROUND('tower_archer.t4a') },
      ...CHECK_STEPS,
    ]);
  });

  it('flipped variant: records the inverted facing before declaring and building', () => {
    const steps = plan({ assets: [archerT4a], picks: { 'tower_archer.t4a': 1 }, flip: ['tower_archer.t4a'] });
    expect(steps.slice(0, 3)).toEqual([
      { op: 'copy', from: '/c/candidates/b/tower_archer.t4a/1.png', to: '/c/sprites/tower_archer.t4a.png' },
      { op: 'setFacing', name: 'tower_archer.t4a', mirror: true },
      { op: 'writeVariant', key: 'tower/archer', variant: 't4a', def: { states: T4A_STATES } },
    ]);
    // No flag: facing.json is the single source, so a later --all rebuild reproduces this.
    expect(steps).toContainEqual(build('tower_archer.t4a'));
  });

  it('records a job mirror override that facing.json does not already give', () => {
    const steps = plan({ assets: [{ ...cannon, mirror: false }], picks: { tower_cannon: 0 } });
    expect(steps).toContainEqual({ op: 'setFacing', name: 'tower_cannon', mirror: false });
  });

  it('plans a base before its variant and sees the base facing change', () => {
    const steps = plan({
      assets: [archerT4a, archer], picks: { 'tower_archer.t4a': 0, tower_archer: 0 }, flip: ['tower_archer'],
    });
    expect(steps.filter(s => s.op === 'setFacing')).toEqual([
      { op: 'setFacing', name: 'tower_archer', mirror: true },
      // The variant was reviewed un-flipped against the old facing; it must not inherit the new one.
      { op: 'setFacing', name: 'tower_archer.t4a', mirror: false },
    ]);
    expect(steps.findIndex(s => s.cmd?.[2] === 'tower_archer'))
      .toBeLessThan(steps.findIndex(s => s.cmd?.[2] === 'tower_archer.t4a'));
  });

  it('anchors a flip to the mirror the review preview used, not the job-time facing', () => {
    // An earlier apply already recorded tower_cannon: false, so resolveJob now says false.
    const metas = { tower_cannon: { 0: { ...meta(), reviewMirror: true } } };
    const steps = plan({ assets: [{ ...cannon, mirror: false }], picks: { tower_cannon: 0 }, flip: ['tower_cannon'],
      metas, facing: { default: true, tower_cannon: false } });
    expect(steps.some(s => s.op === 'setFacing')).toBe(false);
  });

  it('re-applying the same flipped pick three times records the facing once', () => {
    let facing = { default: true };
    const recorded = [];
    for (let n = 0; n < 3; n++) {
      // What resolveJob derives from the facing.json the previous apply left.
      const asset = { ...cannon, mirror: facing.tower_cannon ?? facing.default };
      const steps = plan({ assets: [asset], picks: { tower_cannon: 0 }, flip: ['tower_cannon'], facing,
        metas: { tower_cannon: { 0: { ...meta(), reviewMirror: true } } } });
      const sets = steps.filter(s => s.op === 'setFacing');
      recorded.push(sets.map(s => s.mirror));
      for (const s of sets) facing = { ...facing, [s.name]: s.mirror };
    }
    expect(recorded).toEqual([[false], [], []]);
  });

  it('overworld and portrait: resize the raw pick into public/ at the expected size', () => {
    const steps = plan({ assets: [outpost, rael], picks: { overworld_0_outpost_sigma: 3, 'portrait-rael': 0 } });
    expect(steps).toEqual([
      { op: 'resize', from: '/c/candidates/b/overworld_0_outpost_sigma/3.png',
        to: 'public/assets/overworld/overworld_0_outpost_sigma.png', width: 512, height: 512 },
      { op: 'resize', from: '/c/candidates/b/portrait-rael/0.png',
        to: 'public/assets/portraits/portrait-rael.png', width: 256, height: 256 },
      ...CHECK_STEPS,
    ]);
  });

  it('an empty picks file plans nothing', () => {
    expect(plan({ assets: [cannon, outpost], picks: {} })).toEqual([]);
  });

  it('refuses a fake pick unless allowFake', () => {
    const metas = { tower_cannon: { 0: meta('fake') } };
    expect(() => plan({ assets: [cannon], picks: { tower_cannon: 0 }, metas }))
      .toThrow('tower_cannon #0 is a fake candidate; pass --allow-fake to apply it anyway');
    expect(plan({ assets: [cannon], picks: { tower_cannon: 0 }, metas, allowFake: true }).length).toBeGreaterThan(0);
  });

  it('refuses a pick with no metadata', () => {
    expect(() => plan({ assets: [cannon], picks: { tower_cannon: 0 }, metas: { tower_cannon: {} } }))
      .toThrow('tower_cannon #0 has no metadata');
  });

  it('refuses a variant whose base entity has no manifest entry', () => {
    const laser = { ...archerT4a, assetId: 'tower_laser.t4a', type: 'laser', entity: 'tower_laser' };
    expect(() => plan({ assets: [laser], picks: { 'tower_laser.t4a': 0 } })).toThrow('no manifest entry for tower/laser');
  });

  it('is idempotent apart from backup timestamps', () => {
    const args = { assets: [cannon, archerT4a, outpost], picks: { tower_cannon: 0, 'tower_archer.t4a': 1, overworld_0_outpost_sigma: 0 },
      flip: ['tower_archer.t4a'], refExists: () => true };
    const a = plan({ ...args, timestamp: '2026-11-16T10-00-00-000Z' });
    const b = plan({ ...args, timestamp: '2026-11-16T11-30-00-000Z' });
    expect(a).not.toEqual(b);
    const strip = steps => steps.map(s => (s.op === 'backup' ? { ...s, to: s.to.replace(/-[^/]*\.png$/, '') } : s));
    expect(strip(a)).toEqual(strip(b));
  });

  it('describes every step on one line', () => {
    const steps = plan({ assets: [cannon, archerT4a, outpost], picks: { tower_cannon: 0, 'tower_archer.t4a': 0, overworld_0_outpost_sigma: 0 },
      flip: ['tower_archer.t4a'], refExists: () => true });
    for (const s of steps) expect(describeStep(s)).toMatch(/^\S.*$/);
    expect(describeStep({ op: 'run', cmd: ['python3', 'x.py', '--only', 'tower/cannon'] })).toBe('run      python3 x.py --only tower/cannon');
  });
});

describe('setGroundLine', () => {
  const text = readFileSync(join(process.cwd(), 'src/data/sprites.js'), 'utf8');

  it('rewrites exactly one line of the real sprites.js', () => {
    const out = setGroundLine(text, 'tower', 'archer', { footY: 40.5, width: 36 });
    const before = text.split('\n');
    const after = out.split('\n');
    expect(after).toHaveLength(before.length);
    const changed = after.map((l, i) => (l !== before[i] ? i : -1)).filter(i => i >= 0);
    expect(changed).toHaveLength(1);
    expect(before[changed[0]]).toBe('    ground: { footY: 41.2, width: 37.1 },');
    expect(after[changed[0]]).toBe('    ground: { footY: 40.5, width: 36.0 },');
  });

  it('leaves the text unchanged when the ground already matches', () => {
    expect(setGroundLine(text, 'tower', 'archer', { footY: 41.2, width: 37.1 })).toBe(text);
  });

  it('throws unless the entry has exactly one ground line', () => {
    expect(() => setGroundLine(text, 'tower', 'laser', { footY: 1, width: 1 }))
      .toThrow('ground line for tower/laser found 0 times');
    const entry = /  \{\n    category: 'tower', type: 'cannon',[\s\S]*?\n  \},\n/.exec(text)[0];
    expect(() => setGroundLine(text.replace(entry, entry + entry), 'tower', 'cannon', { footY: 1, width: 1 }))
      .toThrow('ground line for tower/cannon found 2 times');
  });

  it('throws on a non-numeric ground', () => {
    expect(() => setGroundLine(text, 'tower', 'archer', { footY: NaN, width: 1 })).toThrow('bad ground for tower/archer');
  });
});

describe('renderSpriteVariants', () => {
  it('renders the committed empty module byte-for-byte', () => {
    expect(renderSpriteVariants({})).toBe(readFileSync(join(process.cwd(), 'src/data/spriteVariants.js'), 'utf8'));
  });

  it('round-trips through import with sorted keys and state order kept', async () => {
    const obj = {
      'tower/mage': { t2: { states: { idle: { path: 'a.png', frameWidth: 96, frameHeight: 96, frames: 1 } } } },
      'tower/archer': {
        t4b: { states: { idle: { path: 'b.png' } } },
        t4a: { ground: { footY: 40.5, width: 36 }, states: T4A_STATES },
      },
    };
    const text = renderSpriteVariants(obj);
    const dir = mkdtempSync(join(tmpdir(), 'variants-'));
    try {
      const p = join(dir, 'spriteVariants.mjs');
      writeFileSync(p, text);
      const { SPRITE_VARIANTS } = await import(pathToFileURL(p).href);
      expect(SPRITE_VARIANTS).toEqual(obj);
      expect(Object.keys(SPRITE_VARIANTS)).toEqual(['tower/archer', 'tower/mage']);
      expect(Object.keys(SPRITE_VARIANTS['tower/archer'])).toEqual(['t4a', 't4b']);
      expect(Object.keys(SPRITE_VARIANTS['tower/archer'].t4a.states)).toEqual(['idle', 'attack']);
      expect(parseSpriteVariants(text)).toEqual(obj);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('parseSpriteVariants rejects a hand-edited module', () => {
    expect(() => parseSpriteVariants('export const SPRITE_VARIANTS = { a: 1 };\n'))
      .toThrow('spriteVariants.js is not in the generated format');
  });
});
