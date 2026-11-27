// Keyboard-only: these screens have no links, so a modified tap (Ctrl/Cmd/Alt-click)
// means nothing to the browser and must still be swallowed or skip like any tap.
// Ctrl/Cmd/Alt key combos are the browser's (reload, new tab, back), and F5 is the
// bare reload key; no swallow or skip may eat them.
export function isBrowserShortcut(e) {
  return e.type.startsWith('key') && (e.ctrlKey || e.metaKey || e.altKey || e.key === 'F5');
}
