import { describe, it, expect } from 'vitest';
import { checkItchLimits, findAbsoluteUrls, zipName } from './itchPackage.js';

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
