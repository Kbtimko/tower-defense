import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { cacheRoot, candidateDir, readExisting, planCandidates, cliPath } from './candidates.js';

const entry = (index, round = 0) => ({ index, round });

describe('planCandidates', () => {
  it('plans a fresh asset', () => {
    expect(planCandidates({ existing: [], candidates: 3, seed: 100, reroll: false })).toEqual([
      { index: 0, round: 0, seed: 100 },
      { index: 1, round: 0, seed: 101 },
      { index: 2, round: 0, seed: 102 },
    ]);
  });

  it('resumes an interrupted round with the same seeds', () => {
    const existing = [entry(0), entry(1)];
    expect(planCandidates({ existing, candidates: 3, seed: 100, reroll: false })).toEqual([
      { index: 2, round: 0, seed: 102 },
    ]);
  });

  it('a complete round plans nothing', () => {
    const existing = [entry(0), entry(1), entry(2)];
    expect(planCandidates({ existing, candidates: 3, seed: 100, reroll: false })).toEqual([]);
  });

  it('a reroll starts the next round after the last index', () => {
    const existing = [entry(0), entry(1), entry(2)];
    expect(planCandidates({ existing, candidates: 3, seed: 100, reroll: true })).toEqual([
      { index: 3, round: 1, seed: 1100 },
      { index: 4, round: 1, seed: 1101 },
      { index: 5, round: 1, seed: 1102 },
    ]);
  });

  it('a reroll with nothing existing starts round 0', () => {
    expect(planCandidates({ existing: [], candidates: 2, seed: 100, reroll: true })).toEqual([
      { index: 0, round: 0, seed: 100 },
      { index: 1, round: 0, seed: 101 },
    ]);
  });

  it('an interrupted reroll resumes the newest round with its seeds', () => {
    const existing = [entry(0), entry(1), entry(2), entry(3, 1)];
    expect(planCandidates({ existing, candidates: 3, seed: 100, reroll: false })).toEqual([
      { index: 4, round: 1, seed: 1101 },
      { index: 5, round: 1, seed: 1102 },
    ]);
  });
});

describe('readExisting', () => {
  it('ignores a png without its json (an interrupted write)', () => {
    const names = ['0.png', '0.json', '1.png'];
    const metas = { 0: { round: 0 } };
    expect(readExisting(names, metas)).toEqual([
      { index: 0, round: 0, hasCut: false, hasPreview: false },
    ]);
  });

  it('ignores a json without its png', () => {
    expect(readExisting(['0.json'], { 0: { round: 0 } })).toEqual([]);
  });

  it('reports hasCut and hasPreview from sibling files', () => {
    const names = ['2.png', '2.json', '2.cut.png', '2.preview.png', '5.png', '5.json'];
    const metas = { 2: { round: 1 }, 5: { round: 0 } };
    expect(readExisting(names, metas)).toEqual([
      { index: 2, round: 1, hasCut: true, hasPreview: true },
      { index: 5, round: 0, hasCut: false, hasPreview: false },
    ]);
  });

  it('returns entries sorted by index', () => {
    const names = ['10.png', '2.png', '7.png'];
    const metas = { 10: { round: 0 }, 2: { round: 0 }, 7: { round: 0 } };
    expect(readExisting(names, metas).map((e) => e.index)).toEqual([2, 7, 10]);
  });
});

describe('cacheRoot', () => {
  const repo = '/repo';

  it('prefers --cache, then ART_CACHE, then the repo default', () => {
    expect(cacheRoot(repo, { cache: 'custom', env: { ART_CACHE: 'env-dir' } }))
      .toBe(resolve(repo, 'custom'));
    expect(cacheRoot(repo, { env: { ART_CACHE: '/abs/env' } })).toBe('/abs/env');
    expect(cacheRoot(repo, { env: {} })).toBe(resolve(repo, '.art-cache'));
  });
});

describe('candidateDir', () => {
  it('joins cache, candidates, batch and asset id', () => {
    expect(candidateDir('/c', 'b1', 'tower_archer.t2'))
      .toBe('/c/candidates/b1/tower_archer.t2');
  });
});

describe('cliPath', () => {
  // npm runs scripts from the package root; INIT_CWD is where the user typed the command.
  it('resolves a relative path against INIT_CWD when npm set it', () => {
    expect(cliPath('picks.json', { env: { INIT_CWD: '/home/me/Downloads' }, cwd: '/repo' }))
      .toBe('/home/me/Downloads/picks.json');
  });
  it('falls back to the process cwd', () => {
    expect(cliPath('../c', { env: {}, cwd: '/repo/sub' })).toBe('/repo/c');
  });
  it('keeps absolute paths and passes undefined through', () => {
    expect(cliPath('/abs/p.json', { env: { INIT_CWD: '/x' }, cwd: '/y' })).toBe('/abs/p.json');
    expect(cliPath(undefined, { env: { INIT_CWD: '/x' } })).toBeUndefined();
  });
});
