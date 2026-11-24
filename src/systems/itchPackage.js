// Pure packaging helpers for the itch.io zip. No Node APIs: the caller
// supplies the file list, so these stay unit-testable under jsdom.

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
const ATTR_ABS = /(?<![\w-])(?:src|href)=["'](\/(?!\/)[^"']*)["']/g;
const CSS_ABS = /url\(\s*["']?(\/(?!\/)[^"')\s]*)["']?\s*\)/g;

export function findAbsoluteUrls(text) {
  const found = [];
  for (const re of [ATTR_ABS, CSS_ABS]) {
    for (const m of text.matchAll(re)) found.push(m[1]);
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
