// Static file server that behaves like itch.io's host rather than like Vite:
// exact-case paths (a case-insensitive macOS disk would otherwise hide a
// `Foo.png` vs `foo.png` mismatch that 404s on the real, case-sensitive host),
// no index.html fallback for missing files (it would mask broken asset URLs as
// a 200 of HTML), and the game mounted under a nested path like /html/12345/.
import http from 'node:http';
import { readdirSync, statSync, createReadStream } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

// Walks segment by segment, requiring each name to appear verbatim in its parent's
// listing. Returns the absolute path, or null if any segment is missing or differs in case.
function exactPath(root, segments) {
  let dir = root;
  for (const seg of segments) {
    if (!readdirSync(dir).includes(seg)) return null;
    dir = join(dir, seg);
  }
  return dir;
}

function send(res, status, body = '') {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body || String(status));
}

export function startStaticServer({ root, mountPath = '/', port = 0 }) {
  const absRoot = resolve(root);
  const mount = mountPath === '/' ? '' : mountPath.replace(/\/+$/, '');

  const server = http.createServer((req, res) => {
    try {
      const pathname = req.url.split('?')[0].split('#')[0];
      if (pathname !== mount && !pathname.startsWith(mount + '/')) return send(res, 404);
      const rest = pathname.slice(mount.length);
      let segments = rest.split('/').filter((s, i, a) => !(s === '' && (i === 0 || i === a.length - 1)));
      segments = segments.map(decodeURIComponent);
      // A segment that is empty, relative, or smuggles a separator could leave root.
      if (segments.some(s => s === '' || s === '.' || s === '..' || /[/\\\0]/.test(s))) return send(res, 404);
      const atMount = segments.length === 0;
      if (atMount) segments = ['index.html'];

      const file = exactPath(absRoot, segments);
      if (!file || !(file + sep).startsWith(absRoot + sep)) return send(res, 404);
      const stat = statSync(file);
      if (stat.isDirectory()) return send(res, 403);
      // A file addressed as a directory ("/a.png/") is not that file.
      if (rest.endsWith('/') && !atMount) return send(res, 404);
      res.writeHead(200, {
        'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-length': stat.size,
      });
      createReadStream(file).pipe(res);
    } catch {
      // Missing parent dir, bad percent-encoding, a file where a directory was expected.
      send(res, 404);
    }
  });

  return new Promise((resolveStart, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      const actual = server.address().port;
      resolveStart({
        url: `http://localhost:${actual}${mount}`,
        port: actual,
        close: () => new Promise(done => { server.close(done); server.closeAllConnections(); }),
      });
    });
  });
}
