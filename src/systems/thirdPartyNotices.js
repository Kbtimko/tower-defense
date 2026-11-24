// Pure helpers for the build-time THIRD_PARTY_NOTICES.txt. No fs access here:
// the Vite plugin owns I/O, so these stay unit-testable under jsdom.

const NODE_MODULES = 'node_modules/';

// Rollup module ids carry a \0 prefix for virtual modules and a ?query suffix
// for transforms; both must go before we look for the package root. Windows
// separators are normalised so one code path handles every platform.
export function packageDirOf(moduleId) {
  const id = moduleId
    .replace(/^\0/, '')
    .replace(/\?.*$/, '')
    .replace(/\\/g, '/');

  // Innermost wins: nested installs (a/node_modules/b) must attribute to b.
  const marker = /(^|\/)node_modules\//g;
  let start = -1;
  let m;
  while ((m = marker.exec(id)) !== null) {
    start = m.index + m[1].length + NODE_MODULES.length;
  }
  if (start < 0) return null;

  const parts = id.slice(start).split('/');
  const nameParts = parts[0].startsWith('@') ? 2 : 1;
  if (parts.length < nameParts) return null;

  return id.slice(0, start) + parts.slice(0, nameParts).join('/');
}

const HEADER =
  'Last Light (tower-defense) bundles the following third-party components. ' +
  'Their licence notices are reproduced below as their authors require.';

export function formatNotices(entries) {
  const sections = [...entries]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(
      ({ name, version, license, text }) =>
        `====\n${name} ${version} (${license})\n====\n${text.trim()}`,
    );
  return `${HEADER}\n\n${sections.join('\n\n')}\n`;
}

// A pre-bundled dist (phaser.esm.js) can inline its npm dependencies, so they
// never appear as module ids. Walk `dependencies` transitively from every
// package found in the bundle; listing one that was tree-shaken is harmless,
// missing one breaks a licence. Only `dependencies` count: optional peers are
// not shipped. `readPkg(dir)` and `resolveDep(name, fromDir)` are injected so
// the traversal stays pure.
export function collectPackages(startDirs, readPkg, resolveDep) {
  const seen = new Set();
  const queue = [...startDirs];
  while (queue.length) {
    const dir = queue.pop();
    if (seen.has(dir)) continue;
    seen.add(dir);
    for (const dep of Object.keys(readPkg(dir).dependencies || {})) {
      const depDir = resolveDep(dep, dir);
      if (!depDir) throw new Error(`third-party-notices: cannot find dependency ${dep} of ${dir}`);
      queue.push(depDir);
    }
  }
  return seen;
}
