import { describe, it, expect } from 'vitest';
import { stripRvfcPolyfill } from './stripVendored.js';

const BEFORE = 'var a = 1;\n\n/***/ 63595:\n/***/ (() => {\n\n';
const BLOCK = `//  From https://github.com/ThaUnknown/rvfc-polyfill

if (a && b)
{
    X.prototype._rvfcpolyfillmap = {}
    X.prototype.f = function () { if (y) { z() } }
}
`;
const AFTER = '\n/***/ }),\n\n/***/ 1:\nvar b = { c: 2 };\n';
const fixture = BEFORE + BLOCK + AFTER;

describe('stripRvfcPolyfill', () => {
  it('removes the polyfill and its credit line', () => {
    const out = stripRvfcPolyfill(fixture);
    expect(out).not.toContain('_rvfcpolyfillmap');
    expect(out).not.toContain('ThaUnknown');
  });

  it('leaves the text before the marker and from the module end onward byte-identical', () => {
    const out = stripRvfcPolyfill(fixture);
    expect(out.startsWith(BEFORE)).toBe(true);
    expect(out.endsWith(AFTER)).toBe(true);
  });

  it('is not ended early by nested braces inside the block', () => {
    const out = stripRvfcPolyfill(fixture);
    expect(out).not.toContain('z()');
    expect(out).not.toContain('X.prototype');
  });

  it('throws when the marker is absent', () => {
    expect(() => stripRvfcPolyfill('var a = 1;')).toThrow('rvfc-polyfill marker found 0 times');
  });

  it('throws when the marker appears twice', () => {
    expect(() => stripRvfcPolyfill(fixture + fixture)).toThrow('rvfc-polyfill marker found 2 times; Phaser changed');
  });
});
