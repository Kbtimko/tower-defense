// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { startStaticServer } from './staticServer.mjs';

let parent, server;

// fetch() normalises "." / ".." (and their %2e forms) in the URL before sending, so
// traversal that must reach the server needs a raw request.
function raw(port, path) {
  return new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port, path }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    }).on('error', reject);
  });
}

beforeAll(async () => {
  parent = mkdtempSync(join(tmpdir(), 'static-server-'));
  const root = join(parent, 'root');
  mkdirSync(join(root, 'assets', 'sub'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<h1>game</h1>');
  writeFileSync(join(root, 'assets', 'A.png'), 'png');
  writeFileSync(join(root, 'assets', 'sub', 'x.js'), 'x');
  writeFileSync(join(parent, 'secret'), 'secret');
  server = await startStaticServer({ root, mountPath: '/html/12345' });
});

afterAll(async () => {
  await server.close();
  rmSync(parent, { recursive: true, force: true });
});

const get = path => fetch(`http://localhost:${server.port}${path}`);

describe('startStaticServer', () => {
  it('reports a url without a trailing slash', () => {
    expect(server.url).toBe(`http://localhost:${server.port}/html/12345`);
  });
  it('serves index.html at the mount path, with and without a slash', async () => {
    for (const p of ['/html/12345/', '/html/12345']) {
      const r = await get(p);
      expect(r.status).toBe(200);
      expect(await r.text()).toBe('<h1>game</h1>');
    }
  });
  it('serves a file with its content type', async () => {
    const r = await get('/html/12345/assets/A.png');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
  });
  it('matches file case exactly, even on a case-insensitive disk', async () => {
    expect((await get('/html/12345/assets/a.png')).status).toBe(404);
  });
  it('matches directory case exactly', async () => {
    expect((await get('/html/12345/Assets/A.png')).status).toBe(404);
  });
  it('returns 403 for a directory', async () => {
    expect((await get('/html/12345/assets/')).status).toBe(403);
    expect((await get('/html/12345/assets')).status).toBe(403);
  });
  it('returns 404 for a missing file, never index.html', async () => {
    expect((await get('/html/12345/nope.js')).status).toBe(404);
  });
  it('returns 404 outside the mount path', async () => {
    expect((await get('/index.html')).status).toBe(404);
    expect((await get('/html/123456/index.html')).status).toBe(404);
  });
  it('returns 404 for client-normalised traversal', async () => {
    expect((await get('/html/12345/../secret')).status).toBe(404);
  });
  it('returns 404 for traversal that reaches the server', async () => {
    expect(await raw(server.port, '/html/12345/%2e%2e/secret')).toBe(404);
    expect(await raw(server.port, '/html/12345/assets/%2e%2e/%2e%2e/secret')).toBe(404);
    expect(await raw(server.port, '/html/12345/../secret')).toBe(404);
    expect(await raw(server.port, '/html/12345/assets/..%2f..%2fsecret')).toBe(404);
  });
});
