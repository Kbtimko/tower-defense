// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { post, DEFAULT_TIMEOUT_MS } from './drawThings.mjs';

let server;
afterEach(() => new Promise((r) => (server ? server.close(r) : r())));

function slowServer(delayMs) {
  return new Promise((resolve) => {
    server = createServer((req, res) => {
      req.resume();
      setTimeout(() => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ images: ['x'] }));
      }, delayMs);
    }).listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

describe('post()', () => {
  it('resolves {ok,status,json} for a slow 2xx response', async () => {
    const port = await slowServer(1500);
    const res = await post(port, '/x', { a: 1 }, { timeoutMs: 5000 });
    expect(res).toEqual({ ok: true, status: 200, json: { images: ['x'] } });
  });

  it('rejects with a timeout error when the response exceeds timeoutMs', async () => {
    const port = await slowServer(1500);
    await expect(post(port, '/x', {}, { timeoutMs: 300 })).rejects.toThrow(/timed out/);
  });

  it('gives ok:false and json:null for a non-2xx response', async () => {
    const port = await new Promise((resolve) => {
      server = createServer((req, res) => { req.resume(); res.statusCode = 500; res.end('boom'); })
        .listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
    const res = await post(port, '/x', {}, { timeoutMs: 5000 });
    expect(res).toEqual({ ok: false, status: 500, json: null });
  });

  it('gives json:null for a 2xx with a non-JSON body', async () => {
    const port = await new Promise((resolve) => {
      server = createServer((req, res) => { req.resume(); res.end('not json'); })
        .listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
    const res = await post(port, '/x', {}, { timeoutMs: 5000 });
    expect(res).toEqual({ ok: true, status: 200, json: null });
  });
});

describe('post default timeout', () => {
  it('stays above undici\'s 300 s headers timeout so a slow FLUX image is not cut off', () => {
    const UNDICI_DEFAULT_MS = 300_000;
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThanOrEqual(30 * 60_000);
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(UNDICI_DEFAULT_MS);
  });
});
