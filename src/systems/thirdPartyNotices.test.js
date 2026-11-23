import { describe, it, expect } from 'vitest';
import { packageDirOf, formatNotices } from './thirdPartyNotices.js';
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

  it('has a Vite MIT entry with the full licence text', () => {
    expect(vite).toBeDefined();
    expect(vite.version).toBeNull();
    expect(vite.license).toBe('MIT');
    expect(vite.text).toContain('MIT License');
  });
});
