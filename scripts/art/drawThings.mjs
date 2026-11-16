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

// Resolves to { ok, status, json }; json is null when the body is not JSON.
export async function post(port, endpoint, body) {
  const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = res.ok ? await res.json().catch(() => null) : null;
  return { ok: res.ok, status: res.status, json };
}
