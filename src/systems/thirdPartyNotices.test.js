import { describe, it, expect } from 'vitest';
import { packageDirOf, formatNotices, collectPackages } from './thirdPartyNotices.js';
import { VENDORED_NOTICES } from '../data/vendoredNotices.js';

describe('packageDirOf', () => {
  it('returns the package directory for a file inside a package', () => {
    expect(packageDirOf('/p/node_modules/phaser/dist/phaser.esm.js')).toBe('/p/node_modules/phaser');
  });

  it('keeps the scope segment for scoped packages', () => {
    expect(packageDirOf('/p/node_modules/@fontsource/orbitron/400.css')).toBe(
      '/p/node_modules/@fontsource/orbitron',
    );
  });

  it('resolves to the innermost node_modules for nested packages', () => {
    expect(packageDirOf('/p/node_modules/a/node_modules/b/x.js')).toBe('/p/node_modules/a/node_modules/b');
  });

  it('strips the rollup \\0 prefix and the ?query suffix', () => {
    expect(packageDirOf('\0/p/node_modules/eventemitter3/index.mjs?commonjs-proxy')).toBe(
      '/p/node_modules/eventemitter3',
    );
  });

  it('normalises Windows separators to forward slashes', () => {
    expect(packageDirOf('C:\\p\\node_modules\\phaser\\x.js')).toBe('C:/p/node_modules/phaser');
  });

  it('returns null for ids without a node_modules segment', () => {
    expect(packageDirOf('/p/src/main.js')).toBeNull();
    expect(packageDirOf('\0vite/modulepreload-polyfill.js')).toBeNull();
  });
});

describe('formatNotices', () => {
  const entries = [
    { name: 'zeta', version: '1.0.0', license: 'MIT', text: '  Z text \n' },
    { name: 'alpha', version: '2.0.0', license: 'ISC', text: 'A text' },
  ];

  it('writes each section as name version (license) between rules, sorted by name', () => {
    const out = formatNotices(entries);
    const alpha = out.indexOf('alpha 2.0.0 (ISC)');
    const zeta = out.indexOf('zeta 1.0.0 (MIT)');
    expect(alpha).toBeGreaterThan(-1);
    expect(zeta).toBeGreaterThan(alpha);
    expect(out).toContain('====\nalpha 2.0.0 (ISC)\n====\nA text');
  });

  it('trims each licence text', () => {
    const out = formatNotices(entries);
    expect(out).toContain('Z text');
    expect(out).not.toContain('  Z text');
  });

  it('ends with exactly one newline', () => {
    const out = formatNotices(entries);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });

  it('is deterministic regardless of input order', () => {
    expect(formatNotices(entries)).toBe(formatNotices([...entries].reverse()));
  });
});

describe('VENDORED_NOTICES', () => {
  const earcut = VENDORED_NOTICES.find((n) => n.name === 'Earcut (vendored in Phaser)');
  const vite = VENDORED_NOTICES.find((n) => n.name === 'Vite modulepreload polyfill');

  it('has an Earcut ISC entry with the full licence text', () => {
    expect(earcut).toBeDefined();
    expect(earcut.version).toBe('2.2.4');
    expect(earcut.license).toBe('ISC');
    expect(earcut.text).toContain('ISC License');
    expect(earcut.text).toContain('Copyright (c) 2016, Mapbox');
  });

  it('has a Matter.js MIT entry with its copyright line', () => {
    const matter = VENDORED_NOTICES.find((n) => n.name === 'Matter.js (vendored in Phaser)');
    expect(matter).toBeDefined();
    expect(matter.version).toBe('0.20.0');
    expect(matter.license).toBe('MIT');
    expect(matter.text).toContain('MIT License');
    expect(matter.text).toContain('Copyright (c) Liam Brummitt and contributors.');
  });

  it('has a Simplify.js BSD-2-Clause entry with the redistribution clause', () => {
    const simplify = VENDORED_NOTICES.find((n) => n.name === 'Simplify.js (vendored in Phaser)');
    expect(simplify).toBeDefined();
    expect(simplify.license).toBe('BSD-2-Clause');
    expect(simplify.text).toContain('Copyright (c) 2017, Vladimir Agafonkin');
    expect(simplify.text).toContain('Redistributions in binary form must reproduce the above copyright notice');
    expect(simplify.text).toContain('SUCH DAMAGE.');
  });

  it('leaves a null version only on the Vite entry, because the plugin fills every null with its version', () => {
    const nulls = VENDORED_NOTICES.filter((n) => n.version === null).map((n) => n.name);
    expect(nulls).toEqual(['Vite modulepreload polyfill']);
  });

  it('has a Vite MIT entry with the full licence text', () => {
    expect(vite).toBeDefined();
    expect(vite.version).toBeNull();
    expect(vite.license).toBe('MIT');
    expect(vite.text).toContain('MIT License');
  });
});

describe('collectPackages', () => {
  const tree = {
    '/n/a': { name: 'a', dependencies: { b: '1' } },
    '/n/b': { name: 'b', dependencies: { c: '1' } },
    '/n/c': { name: 'c' },
  };
  const readPkg = dir => tree[dir];
  const resolveDep = name => (tree[`/n/${name}`] ? `/n/${name}` : null);

  it('includes transitive dependencies, each once, even when also required directly', () => {
    const dirs = collectPackages(['/n/a', '/n/b'], readPkg, resolveDep);
    expect([...dirs].sort()).toEqual(['/n/a', '/n/b', '/n/c']);
  });
  it('terminates on a dependency cycle', () => {
    const cyc = { '/n/x': { dependencies: { y: '1' } }, '/n/y': { dependencies: { x: '1' } } };
    const dirs = collectPackages(['/n/x'], d => cyc[d], n => `/n/${n}`);
    expect([...dirs].sort()).toEqual(['/n/x', '/n/y']);
  });
  it('throws naming a dependency that cannot be found', () => {
    expect(() => collectPackages(['/n/a'], readPkg, () => null)).toThrow(/b/);
  });
});
