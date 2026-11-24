// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Native title= tooltips never show on touch and duplicate the HintPeek /
// AbilityTooltip surfaces; this keeps them from creeping back.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const srcDir = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.js$/.test(name) && !/\.test\.js$/.test(name)) out.push(p);
  }
  return out;
}

describe('no native title tooltips', () => {
  it('index.html body has no title= attribute', () => {
    const body = html.slice(html.indexOf('<body'));
    expect(body.match(/\stitle="/g) ?? []).toEqual([]);
  });

  it('non-test src never assigns .title or setAttribute("title")', () => {
    const hits = [];
    for (const f of sourceFiles(srcDir)) {
      const text = readFileSync(f, 'utf8');
      if (/\.title\s*=[^=]|setAttribute\(\s*['"]title['"]/.test(text)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });
});
