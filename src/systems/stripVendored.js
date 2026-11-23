// Build-time removal of vendored code we cannot ship. Phaser's dist inlines
// rvfc-polyfill (a requestVideoFrameCallback shim) whose upstream is GPL-3.0;
// the game never uses Phaser video, so the block is cut from our bundle.

const RVFC_MARKER = '//  From https://github.com/ThaUnknown/rvfc-polyfill';

// Removes the marker comment and the `if (...) { ... }` statement after it.
// The webpack module wrapper stays, so require() of that module still works
// (now with an empty body). Throws if Phaser's layout is not what we expect.
export function stripRvfcPolyfill(code) {
  const count = code.split(RVFC_MARKER).length - 1;
  if (count !== 1) {
    throw new Error(`rvfc-polyfill marker found ${count} times; Phaser changed — re-check the strip`);
  }
  const start = code.indexOf(RVFC_MARKER);
  const open = code.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) { end = i + 1; break; }
  }
  if (open < 0 || end < 0) throw new Error('rvfc-polyfill block has no balanced closing brace; Phaser changed — re-check the strip');
  return code.slice(0, start) + code.slice(end);
}
