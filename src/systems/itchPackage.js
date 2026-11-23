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

export function zipName({ version, sha, dirty }) {
  return `last-light-${version}-${sha}${dirty ? '-dirty' : ''}.zip`;
}
