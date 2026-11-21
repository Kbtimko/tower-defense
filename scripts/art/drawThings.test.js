// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { post } from './drawThings.mjs';

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
  it("waits for a response slower than undici's 300 s default", async () => {
    const port = await slowServer(1500);
    const res = await post(port, '/x', { a: 1 }, { timeoutMs: 5000 });
    expect(res).toEqual({ ok: true, status: 200, json: { images: ['x'] } });
  });

  it('rejects with a timeout error when the response exceeds timeoutMs', async () => {
    const port = await slowServer(1500);
    await expect(post(port, '/x', {}, { timeoutMs: 300 })).rejects.toThrow(/timed out/);
  });
});
