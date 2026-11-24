import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { buildIdentity, checkItchLimits, findAbsoluteUrls, missingNotices, parsePackageArgs, zipArgs, zipBundle, zipName } from './itchPackage.js';

const ok = [{ path: 'index.html', bytes: 2_000 }, { path: 'assets/index-abc.js', bytes: 1_500_000 }];
it('a small build with index.html at the root passes', () => expect(checkItchLimits(ok)).toEqual([]));
it('missing root index.html fails, and case matters', () => {
  expect(checkItchLimits([{ path: 'game/index.html', bytes: 10 }]).join()).toMatch(/index\.html/);
  expect(checkItchLimits([{ path: 'Index.html', bytes: 10 }]).join()).toMatch(/index\.html/);
});
it('1,001 files fails; 1,000 passes', () => {
  const many = n => [{ path: 'index.html', bytes: 1 }, ...Array.from({ length: n - 1 }, (_, i) => ({ path: `a/${i}.png`, bytes: 1 }))];
  expect(checkItchLimits(many(1000))).toEqual([]);
  expect(checkItchLimits(many(1001)).join()).toMatch(/1001 files/);
});
it('size limits: one file over 200 MB, total over 500 MB', () => {
  expect(checkItchLimits([...ok, { path: 'big.bin', bytes: 200_000_001 }]).join()).toMatch(/big\.bin/);
  const total = [...ok, ...[1, 2, 3].map(i => ({ path: `p${i}.bin`, bytes: 170_000_000 }))];
  expect(checkItchLimits(total).join()).toMatch(/total/);
});
it('a 241-character path fails; 240 passes', () => {
  const p = n => 'x'.repeat(n - 4) + '.png';
  expect(checkItchLimits([...ok, { path: p(240), bytes: 1 }])).toEqual([]);
  expect(checkItchLimits([...ok, { path: p(241), bytes: 1 }]).join()).toMatch(/241/);
});
it('any dotfile segment fails (Review Focus 4)', () => {
  expect(checkItchLimits([...ok, { path: 'audio/sfx/.gitkeep', bytes: 0 }]).join()).toMatch(/\.gitkeep/);
  expect(checkItchLimits([...ok, { path: '.hidden/a.png', bytes: 1 }]).join()).toMatch(/\.hidden/);
});
it('finds root-absolute URLs only', () => {
  const html = '<script src="/assets/a.js"></script><link href="./assets/b.css"><a href="https://x.io/y">';
  expect(findAbsoluteUrls(html)).toEqual(['/assets/a.js']);
  expect(findAbsoluteUrls('a{background:url(/img/x.png)} b{background:url("./y.png")} c{background:url(\'/z.webp\')} d{src:url(//cdn/f.woff2)} e{x:url(data:image/png;base64,AA)}'))
    .toEqual(['/img/x.png', '/z.webp']);
});
it('zip name carries version, sha and dirty (Review Focus 5)', () => {
  expect(zipName({ version: '0.1.0', sha: '18455fc', dirty: false })).toBe('last-light-0.1.0-18455fc.zip');
  expect(zipName({ version: '0.1.0', sha: '18455fc', dirty: true })).toBe('last-light-0.1.0-18455fc-dirty.zip');
});
it('zipName marks unverified builds, alone and with dirty', () => {
  expect(zipName({ version: '0.1.0', sha: 'abc1234', dirty: false, unverified: true })).toBe('last-light-0.1.0-abc1234-unverified.zip');
  expect(zipName({ version: '0.1.0', sha: 'abc1234', dirty: true, unverified: true })).toBe('last-light-0.1.0-abc1234-dirty-unverified.zip');
  expect(zipName({ version: '0.1.0', sha: 'abc1234', dirty: false, unverified: false })).toBe('last-light-0.1.0-abc1234.zip');
});
it('buildIdentity reads sha and dirtiness from git', () => {
  const run = out => a => ({ status: 0, stdout: a[0] === 'rev-parse' ? 'abc1234\n' : out });
  expect(buildIdentity(run(''))).toEqual({ sha: 'abc1234', dirty: false });
  expect(buildIdentity(run(' M x.js\n'))).toEqual({ sha: 'abc1234', dirty: true });
});
it('buildIdentity treats missing git or an unresolvable HEAD as nogit and dirty', () => {
  const nogit = { sha: 'nogit', dirty: true };
  expect(buildIdentity(() => ({ status: null, stdout: null, error: new Error('ENOENT') }))).toEqual(nogit);
  expect(buildIdentity(() => ({ status: 128, stdout: '' }))).toEqual(nogit);
  expect(buildIdentity(() => ({ status: 0, stdout: '' }))).toEqual(nogit);
  expect(buildIdentity(() => ({ status: 128, stdout: 'abc\n' }))).toEqual(nogit);
  expect(buildIdentity(a => (a[0] === 'rev-parse' ? { status: 0, stdout: 'abc\n' } : { status: 128, stdout: '' }))).toEqual({ sha: 'abc', dirty: true });
});

describe('missingNotices', () => {
  const header = t => `====\n${t}\n====\nLicence body.`;
  const text = `Intro.\n\n${header('phaser 3.90.0 (MIT)')}\n\n${header('eventemitter3 5.0.4 (MIT)')}\n`;
  it('returns the required names with no section header', () => {
    expect(missingNotices(text, ['phaser', 'eventemitter3', '@fontsource/orbitron'])).toEqual(['@fontsource/orbitron']);
  });
  it('a name found only in a licence body still counts as missing', () => {
    const body = `${header('phaser 3.90.0 (MIT)')}\n\n====\nother 1.0.0 (MIT)\n====\nDerived from eventemitter3.\n`;
    expect(missingNotices(body, ['eventemitter3'])).toEqual(['eventemitter3']);
  });
  it('matches a name that is a prefix of a longer header (Earcut, Vite)', () => {
    const v = header('Earcut (vendored in Phaser) 2.2.4 (ISC)');
    expect(missingNotices(v, ['Earcut', 'Vite'])).toEqual(['Vite']);
  });
});

describe('zipArgs', () => {
  it('omits directory entries (-D) and zips the folder contents from inside it', () => {
    const a = zipArgs('z.zip');
    expect(a).toContain('-D');
    expect(a.slice(-2)).toEqual([path.join('..', 'z.zip'), '.']);
  });
});

describe('parsePackageArgs', () => {
  it('defaults to verifying on desktop and iphone', () => {
    expect(parsePackageArgs([])).toEqual({ verify: true, devices: 'desktop,iphone' });
  });
  it('reads --no-verify and --devices', () => {
    expect(parsePackageArgs(['--no-verify', '--devices', 'iphone'])).toEqual({ verify: false, devices: 'iphone' });
  });
  it('throws when --devices has no value rather than silently defaulting', () => {
    expect(() => parsePackageArgs(['--devices'])).toThrow(/--devices needs a value/);
    expect(() => parsePackageArgs(['--devices', '--no-verify'])).toThrow(/--devices needs a value/);
    expect(() => parsePackageArgs(['--devices', ''])).toThrow(/--devices needs a value/);
  });
});

describe('zipBundle', () => {
  const run = result => {
    const spawn = vi.fn(() => result);
    const rm = vi.fn();
    const ok = zipBundle({ spawn, rm, cwd: 'release/itch', name: 'z.zip', zipPath: 'release/z.zip' });
    return { ok, spawn, rm };
  };
  it('removes the partial zip and returns false on a non-zero exit', () => {
    const { ok, rm, spawn } = run({ status: 12 });
    expect(ok).toBe(false);
    expect(rm).toHaveBeenCalledTimes(1);
    expect(rm).toHaveBeenCalledWith('release/z.zip', { force: true });
    expect(spawn).toHaveBeenCalledWith('zip', zipArgs('z.zip'), { cwd: 'release/itch', stdio: 'inherit' });
  });
  it('removes the partial zip and returns false when zip cannot be spawned', () => {
    const { ok, rm } = run({ status: null, error: new Error('ENOENT') });
    expect(ok).toBe(false);
    expect(rm).toHaveBeenCalledTimes(1);
    expect(rm).toHaveBeenCalledWith('release/z.zip', { force: true });
  });
  it('leaves the zip alone and returns true on success', () => {
    const { ok, rm } = run({ status: 0 });
    expect(ok).toBe(true);
    expect(rm).not.toHaveBeenCalled();
  });
});

describe('findAbsoluteUrls attribute forms', () => {
  it('matches uppercase, unquoted and spaced attributes', () => {
    expect(findAbsoluteUrls('<IMG SRC="/a.png"><script src=/b.js></script><a HREF = \'/c\'>')).toEqual(['/a.png', '/b.js', '/c']);
  });
  it('still ignores protocol-relative, scheme and relative URLs in those forms', () => {
    expect(findAbsoluteUrls('<IMG SRC="//cdn/x.png"><a HREF=https://x.io/><img src=./rel.png>')).toEqual([]);
  });
});
