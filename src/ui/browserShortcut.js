// Ctrl/Cmd/Alt combos are the browser's (reload, new tab, back); no swallow or
// skip may eat them.
export function isBrowserShortcut(e) {
  return e.ctrlKey || e.metaKey || e.altKey;
}
