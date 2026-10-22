import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMPACT_QUERY, VIEWPORT_CONTENT } from './mobile.js';

// jsdom's import.meta.url is not a file URL; vitest runs from the repo root.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('index.html mobile shell', () => {
  it('viewport meta content matches VIEWPORT_CONTENT', () => {
    const m = html.match(/<meta name="viewport" content="([^"]*)"/);
    expect(m, 'viewport meta present').not.toBeNull();
    expect(m[1]).toBe(VIEWPORT_CONTENT);
  });

  it('declares the compact landscape media block', () => {
    expect(html).toContain(`@media ${COMPACT_QUERY}`);
  });
});
