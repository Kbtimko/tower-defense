// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hiDpiStyle, addText } from './hiDpiText.js';
import { setRenderScale } from '../systems/renderScale.js';

afterEach(() => setRenderScale(1));

describe('hiDpiStyle', () => {
  it('adds the current render scale without mutating the input', () => {
    setRenderScale(2);
    const style = { fontSize: '10px' };
    expect(hiDpiStyle(style)).toEqual({ fontSize: '10px', resolution: 2 });
    expect(style).toEqual({ fontSize: '10px' });
  });
});

describe('addText', () => {
  it('passes the hi-DPI style to scene.add.text', () => {
    setRenderScale(2);
    const scene = { add: { text: vi.fn(() => 'obj') } };
    expect(addText(scene, 1, 2, 'hi', { color: '#fff' })).toBe('obj');
    expect(scene.add.text).toHaveBeenCalledWith(1, 2, 'hi', { color: '#fff', resolution: 2 });
  });
});

function listJs(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}${e.name}`;
    if (e.isDirectory()) return listJs(`${p}/`);
    return p.endsWith('.js') && !p.endsWith('.test.js') ? [p] : [];
  });
}

// A raw add.text rasterises at resolution 1 and blurs under a k=2 camera.
describe('no raw add.text outside the helper', () => {
  it('routes every canvas text through addText', () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const files = listJs(root);
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((f) => !f.endsWith('/ui/hiDpiText.js') && readFileSync(f, 'utf8').includes('.add.text('));
    expect(offenders).toEqual([]);
  });
});
