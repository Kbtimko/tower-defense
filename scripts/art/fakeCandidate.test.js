// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { makeFakeCandidate } from './fakeCandidate.mjs';

const dir = mkdtempSync(join(tmpdir(), 'fake-cand-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const base = () => sharp({ create: { width: 48, height: 48, channels: 4, background: { r: 200, g: 60, b: 20, alpha: 1 } } }).png().toBuffer();
const raw = async p => (await sharp(p).raw().toBuffer());

describe('makeFakeCandidate', () => {
  it('writes a 1024x1024 PNG', async () => {
    const out = join(dir, 'a.png');
    await makeFakeCandidate({ outPath: out, index: 0, label: 'x #0', basePng: await base() });
    const meta = await sharp(out).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1024, 1024]);
  });

  it('gives different indices different pixels from the same base', async () => {
    const b = await base();
    await makeFakeCandidate({ outPath: join(dir, 'b0.png'), index: 0, label: 'l', basePng: b });
    await makeFakeCandidate({ outPath: join(dir, 'b1.png'), index: 1, label: 'l', basePng: b });
    expect((await raw(join(dir, 'b0.png'))).equals(await raw(join(dir, 'b1.png')))).toBe(false);
  });

  it('works with no base art', async () => {
    const out = join(dir, 'c.png');
    await makeFakeCandidate({ outPath: out, index: 2, label: 'card', basePng: null });
    expect((await sharp(out).metadata()).width).toBe(1024);
    expect(readFileSync(out).length).toBeGreaterThan(0);
  });
});
