// Pure packaging helpers for the itch.io zip. The caller supplies the file
// list and the spawn/rm functions, so these stay unit-testable under jsdom.
// (node:path is only for building the zip argument, never for touching disk.)

import path from 'node:path';
import { ITCH_LIMITS } from '../data/release.js';

export function checkItchLimits(files, limits = ITCH_LIMITS) {
  const problems = [];

  if (files.length > limits.maxFiles) {
    problems.push(`${files.length} files (limit ${limits.maxFiles})`);
  }

  const total = files.reduce((sum, f) => sum + f.bytes, 0);
  if (total > limits.maxTotalBytes) {
    problems.push(`total ${total} bytes (limit ${limits.maxTotalBytes})`);
  }

  for (const f of files) {
    if (f.bytes > limits.maxFileBytes) {
      problems.push(`${f.path} is ${f.bytes} bytes (limit ${limits.maxFileBytes})`);
    }
    if (f.path.length > limits.maxPathLength) {
      problems.push(
        `path of ${f.path.length} characters (limit ${limits.maxPathLength}): ${f.path}`,
      );
    }
    if (f.path.split('/').some(seg => seg.startsWith('.'))) {
      problems.push(`dotfile in zip: ${f.path}`);
    }
  }

  if (!files.some(f => f.path === 'index.html')) {
    problems.push('no index.html at the zip root');
  }

  return problems;
}

// Root-absolute URLs only: "/x" in src/href attributes and url(...) in CSS.
// Protocol-relative (//), scheme URLs and relative paths are not matched.
// HTML attribute names are case-insensitive and values may be unquoted, so a
// narrower scan would let a root-absolute URL through to a page that breaks
// under itch's nested path.
const ATTR_ABS = /(?<![\w-])(?:src|href)\s*=\s*(?:"(\/(?!\/)[^"]*)"|'(\/(?!\/)[^']*)'|(\/(?!\/)[^\s>"']*))/gi;
const CSS_ABS = /url\(\s*["']?(\/(?!\/)[^"')\s]*)["']?\s*\)/g;

export function findAbsoluteUrls(text) {
  const found = [];
  for (const re of [ATTR_ABS, CSS_ABS]) {
    for (const m of text.matchAll(re)) found.push(m[1] ?? m[2] ?? m[3]);
  }
  return found;
}

// A zip is only named plainly when its device flow passed, so the file name
// is the only record of verification once the console output is gone.
export function zipName({ version, sha, dirty, unverified }) {
  return `last-light-${version}-${sha}${dirty ? '-dirty' : ''}${unverified ? '-unverified' : ''}.zip`;
}

// `run(args)` returns { status, stdout } like spawnSync. Without git, or when
// HEAD can't be resolved, report an unknown dirty tree so the name can never
// pass for a clean commit build.
export function buildIdentity(run) {
  const head = run(['rev-parse', '--short', 'HEAD']);
  const sha = head && head.status === 0 && typeof head.stdout === 'string' ? head.stdout.trim() : '';
  if (!sha) return { sha: 'nogit', dirty: true };
  const st = run(['status', '--porcelain']);
  const dirty = !(st && st.status === 0 && typeof st.stdout === 'string') || st.stdout.trim() !== '';
  return { sha, dirty };
}

// Section headers in THIRD_PARTY_NOTICES.txt are the single line between two
// `====` rules. Only those count: a name can appear in a licence body (or in a
// longer package name) without its own notice being shipped.
export function missingNotices(noticesText, required) {
  const lines = noticesText.split('\n');
  const headers = [];
  for (let i = 1; i < lines.length - 1; i++) {
    if (lines[i - 1] === '====' && lines[i + 1] === '====') headers.push(lines[i]);
  }
  return required.filter(name => !headers.some(h => h.startsWith(`${name} `)));
}

// -D drops directory entries: itch's zip validation rejects them. -X keeps the
// zip free of timestamps/uids so the same build zips the same way.
export function zipArgs(name) {
  return ['-r', '-X', '-D', '-q', path.join('..', name), '.'];
}

// A typo like `--devices` with no value must fail before a multi-minute build,
// not quietly fall back to the default device list.
export function parsePackageArgs(argv) {
  const verify = !argv.includes('--no-verify');
  let devices = 'desktop,iphone';
  const di = argv.indexOf('--devices');
  if (di >= 0) {
    const v = argv[di + 1];
    if (v === undefined || v.startsWith('--')) throw new Error('--devices needs a value');
    devices = v;
  }
  return { verify, devices };
}

// A failed zip can leave a truncated file in release/, which the user uploads
// by hand; remove it so the folder never holds a broken archive.
export function zipBundle({ spawn, rm, cwd, name, zipPath }) {
  const z = spawn('zip', zipArgs(name), { cwd, stdio: 'inherit' });
  if (z.error || z.status !== 0) {
    rm(zipPath, { force: true });
    return false;
  }
  return true;
}
