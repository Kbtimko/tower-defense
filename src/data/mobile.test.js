// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMPACT_QUERY, PHONE_PORTRAIT_QUERY, VIEWPORT_CONTENT } from './mobile.js';

// Node environment so import.meta.url is a real file URL (jsdom's is not); resolving
// from this file keeps the test independent of the cwd vitest was launched from.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('index.html mobile shell', () => {
  it('viewport meta content matches VIEWPORT_CONTENT', () => {
    const m = html.match(/<meta name="viewport" content="([^"]*)"/);
    expect(m, 'viewport meta present').not.toBeNull();
    expect(m[1]).toBe(VIEWPORT_CONTENT);
  });

  it('declares the compact landscape media block', () => {
    expect(html).toContain(`@media ${COMPACT_QUERY}`);
  });

  it('declares the portrait rotate-prompt media block and element', () => {
    expect(html).toContain(`@media ${PHONE_PORTRAIT_QUERY}`);
    expect(html).toContain('id="rotate-prompt"');
  });

  it('gates overscroll-behavior to coarse pointers (desktop swipe-back unchanged)', () => {
    expect(html).not.toMatch(/^\s*html, body \{[^}]*overscroll-behavior/m);
    expect(html).toMatch(/@media \(pointer: coarse\) \{ html, body \{ overscroll-behavior: none; \} \}/);
  });
});
