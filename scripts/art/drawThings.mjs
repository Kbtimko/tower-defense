import { request as httpRequest } from 'node:http';

// Draw Things HTTP API server: port discovery, the "server is off" help text and
// a POST helper. Shared by the legacy generate-art.mjs path and runJob.mjs.

// Draw Things shows the port when you enable the API Server, but the default is
// not documented anywhere we can read, so scan the plausible range rather than
// making the user hunt for it. An explicit --port short-circuits the scan.
export function candidatePorts(explicitPort) {
  return explicitPort
    ? [explicitPort]
    : [7860, 7859, 3080, 8080, ...Array.from({ length: 21 }, (_, i) => 7850 + i)]
        .filter((p, i, a) => a.indexOf(p) === i);
}

async function probe(port) {
  // A live HTTP server answers *something* on the root; a closed port rejects
  // immediately. Short timeout keeps a 25-port scan near-instant on loopback.
  const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(400) })
    .catch(() => null);
  return Boolean(res);
}

export async function discoverPort(ports) {
  const hits = await Promise.all(ports.map(async p => (await probe(p)) ? p : null));
  return hits.find(Boolean) ?? null;
}

export function noServerHelp(ports) {
  return `
No local server answered on any of ${ports.length} scanned ports.

Draw Things already has FLUX.1 [schnell] downloaded; its API Server is just
switched off. To turn it on:

  1. Open Draw Things
  2. Open Settings and find "API Server"
  3. Set it to "HTTP"  (per the app's own description, HTTP "runs a compatible
     HTTP API server, allowing extensions that use the txt2img or img2img APIs
     to connect locally" — that is what this script speaks. "gRPC" will NOT
     work here.)
  4. Leave Draw Things running and re-run:  npm run art

The port is auto-discovered. If Draw Things shows a port outside the scanned
range, pass it explicitly:  npm run art -- --port <port>

Works right now with no server:  npm run art -- --dry-run
`;
}

// Resolves to { ok, status, json }; json is null when the response is not OK or the
// body is not JSON. node:http, not global fetch: undici's fetch gives up on response
// headers after 300 s, and a FLUX image under host load can take longer than that.
export function post(port, endpoint, body, { timeoutMs = 30 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = httpRequest({
      host: '127.0.0.1', port, path: endpoint, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('error', reject);
      res.on('end', () => {
        const ok = res.statusCode >= 200 && res.statusCode < 300;
        let json = null;
        if (ok) {
          try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { json = null; }
        }
        resolve({ ok, status: res.statusCode, json });
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`request to ${endpoint} timed out after ${timeoutMs} ms`));
    });
    req.on('error', reject);
    req.end(payload);
  });
}
