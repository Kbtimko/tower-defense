import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The README is the repo's front door, so a moved spec or a renamed image must
// fail here rather than show a broken link on GitHub. Targets are derived from
// the README itself; nothing is listed by hand.
const root = process.cwd();
const readReadme = () => fs.readFileSync(path.join(root, 'README.md'), 'utf8');

const isExternal = (t) => /^(https?:|mailto:)/i.test(t) || t.startsWith('#');

const TARGET = String.raw`\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)`;
const SRC = /\bsrc="([^"]+)"/g;
const relative = (targets) =>
  targets.filter((t) => !isExternal(t)).map((t) => decodeURI(t.split('#')[0]));

// `](target)` with an optional "title", and `src="target"` from inline <img>.
const linkTargets = (md) => relative([
  ...[...md.matchAll(new RegExp(String.raw`\]` + TARGET, 'g'))].map((m) => m[1]),
  ...[...md.matchAll(SRC)].map((m) => m[1]),
]);

// Only embeds count as images: `![alt](target)` and <img src>, not plain links.
const imageTargets = (md) => relative([
  ...[...md.matchAll(new RegExp(String.raw`!\[[^\]]*\]` + TARGET, 'g'))].map((m) => m[1]),
  ...[...md.matchAll(SRC)].map((m) => m[1]),
]);

// Walk segment by segment with readdirSync: macOS resolves `Docs/x.JPG` happily,
// GitHub and Linux do not, so existsSync would hide exactly the bugs that matter.
const existsWithExactCase = (rel) => {
  let dir = root;
  for (const seg of rel.split('/').filter((s) => s && s !== '.')) {
    if (seg === '..') return false;
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return false;
    }
    if (!entries.includes(seg)) return false;
    dir = path.join(dir, seg);
  }
  return true;
};

describe('README links', () => {
  it('every relative link and image target exists with exact case', () => {
    const targets = linkTargets(readReadme());
    expect(targets.length).toBeGreaterThan(0);
    const missing = [...new Set(targets)].filter((t) => !existsWithExactCase(t));
    expect(missing).toEqual([]);
  });

  it('shows at least one image from docs/readme/', () => {
    const images = imageTargets(readReadme()).filter((t) => t.startsWith('docs/readme/'));
    expect(images.length).toBeGreaterThan(0);
  });
});
