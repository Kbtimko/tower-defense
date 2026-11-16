// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { runJob } from './runJob.mjs';

// Never the real Draw Things: every request goes to a stub on an ephemeral port.
let server, port, requests, img2imgStatus, tmp, tinyB64;

const solid = (w, h, c) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png();

beforeAll(async () => {
  tinyB64 = (await solid(8, 8, { r: 1, g: 2, b: 3 }).toBuffer()).toString('base64');
  server = createServer((req, res) => {
    let data = '';
    req.on('data', d => { data += d; });
    req.on('end', () => {
      requests.push({ url: req.url, body: JSON.parse(data || '{}') });
      if (req.url === '/sdapi/v1/img2img' && img2imgStatus !== 200) { res.statusCode = img2imgStatus; res.end('no'); return; }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ images: [tinyB64] }));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
afterAll(() => { server.close(); });

function makeRepo(init) {
  tmp = mkdtempSync(join(tmpdir(), 'runjob-'));
  const cwd = process.cwd();
  mkdirSync(join(tmp, 'scripts/art/jobs'), { recursive: true });
  for (const d of ['sprites', 'overworld', 'portraits']) mkdirSync(join(tmp, 'public/assets', d), { recursive: true });
  let md = readFileSync(join(cwd, 'public/assets/sprites/PROMPTS.md'), 'utf8');
  md = md.replace(/^(- \*\*cannon\*\* .*)$/m, '$1\n- **archer.t4a** — `#8B4513`: `upgraded ballista with twin bows`');
  writeFileSync(join(tmp, 'public/assets/sprites/PROMPTS.md'), md);
  for (const d of ['overworld', 'portraits']) {
    copyFileSync(join(cwd, `public/assets/${d}/PROMPTS.md`), join(tmp, `public/assets/${d}/PROMPTS.md`));
  }
  writeFileSync(join(tmp, 'scripts/art/jobs/t.json'), JSON.stringify({
    batch: 't', candidates: 3,
    assets: [
      { kind: 'sprite', entity: 'tower_cannon' },
      { kind: 'sprite', entity: 'tower_archer', variant: 't4a', init: 'base', ...init },
    ],
  }));
  return tmp;
}
const metas = (root, id) => readdirSync(join(root, 'cache/candidates/t', id)).filter(n => /^\d+\.json$/.test(n)).sort()
  .map(n => JSON.parse(readFileSync(join(root, 'cache/candidates/t', id, n), 'utf8')));

describe('runJob against a stub server', () => {
  it('falls back from a 404 img2img to txt2img, once, and records the mode', async () => {
    requests = []; img2imgStatus = 404;
    const root = makeRepo({});
    mkdirSync(join(root, 'cache/sprites'), { recursive: true });
    await solid(64, 64, { r: 9, g: 9, b: 9 }).toFile(join(root, 'cache/sprites/tower_archer.png'));
    const logs = [];
    const code = await runJob({ repoRoot: root, batch: 't', cache: join(root, 'cache'), port, log: m => logs.push(m) });
    expect(code).toBe(0);

    const hits = requests.filter(r => r.body.prompt?.includes('twin bows'));
    expect(hits[0].url).toBe('/sdapi/v1/img2img');
    expect(hits[0].body.init_images).toHaveLength(1);
    expect(hits[0].body.denoising_strength).toBe(0.45);
    expect(hits.slice(1).map(h => h.url)).toEqual(Array(3).fill('/sdapi/v1/txt2img'));
    expect(hits.slice(1).map(h => h.body.seed)).toEqual([77021, 77022, 77023]);
    expect(hits.slice(1).every(h => !('init_images' in h.body))).toBe(true);

    expect(metas(root, 'tower_archer.t4a').map(m => m.mode)).toEqual(['txt2img', 'txt2img', 'txt2img']);
    expect(metas(root, 'tower_cannon').map(m => m.mode)).toEqual(['txt2img', 'txt2img', 'txt2img']);
    expect(logs.filter(l => l.includes('img2img unsupported (HTTP 404)'))).toHaveLength(1);
    rmSync(root, { recursive: true, force: true });
  });

  it('uses img2img for every candidate when the server supports it', async () => {
    requests = []; img2imgStatus = 200;
    const root = makeRepo({ strength: 0.5 });
    mkdirSync(join(root, 'cache/sprites'), { recursive: true });
    await solid(64, 64, { r: 9, g: 9, b: 9 }).toFile(join(root, 'cache/sprites/tower_archer.png'));
    await runJob({ repoRoot: root, batch: 't', cache: join(root, 'cache'), port, log: () => {} });
    const hits = requests.filter(r => r.body.prompt?.includes('twin bows'));
    expect(hits.map(h => h.url)).toEqual(Array(3).fill('/sdapi/v1/img2img'));
    expect(hits[0].body.denoising_strength).toBe(0.5);
    expect(metas(root, 'tower_archer.t4a').map(m => m.mode)).toEqual(['img2img', 'img2img', 'img2img']);
    rmSync(root, { recursive: true, force: true });
  });

  it('inits from the first frame of the shipped sheet when no reference is cached', async () => {
    requests = []; img2imgStatus = 200;
    const root = makeRepo({});
    // archer idle frame is 96x96: a 192-wide strip, red first frame, blue second.
    mkdirSync(join(root, 'assets-src/sprites/towers'), { recursive: true });
    const strip = await sharp({ create: { width: 192, height: 96, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .composite([{ input: await solid(96, 96, { r: 255, g: 0, b: 0 }).toBuffer(), left: 0, top: 0 }]).png().toBuffer();
    writeFileSync(join(root, 'assets-src/sprites/towers/archer_idle.png'), strip);
    await runJob({ repoRoot: root, batch: 't', cache: join(root, 'cache'), port, log: () => {} });
    const init = requests.find(r => r.url === '/sdapi/v1/img2img').body.init_images[0];
    const { data, info } = await sharp(Buffer.from(init, 'base64')).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1024, 1024]);
    const px = (x, y) => [...data.subarray((y * 1024 + x) * info.channels, (y * 1024 + x) * info.channels + 3)];
    expect(px(1000, 512)).toEqual([255, 0, 0]);   // whole strip would put blue here
    rmSync(root, { recursive: true, force: true });
  });
});
