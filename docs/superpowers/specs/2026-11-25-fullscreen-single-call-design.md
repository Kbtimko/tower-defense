# Fullscreen toggle calls one API (backlog #41e) — design

**Status:** self-approved (`[auto]` item), 2026-11-25. A small change.

## Intent
`toggleFullscreen` (`src/ui/fullscreen.js`) does `await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())`, and the same for exit. The `??` falls through on `undefined`, so on an engine whose standard method exists but returns `undefined` (older engines did not return a promise), the webkit method is called as well. That is a second fullscreen request or exit in the same gesture.

## Goal
Pick the method first, then call it once, bound to its receiver:
- `(el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el)`
- `(doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc)`

Behaviour is unchanged wherever the standard method returns a promise, and when only one method exists.

## Non-goals
Orientation lock, support detection and the MapSelect wiring are unchanged. The other parts of #41 are device-only checks or harness audits, and stay open.

## Approaches
1. **Select the method, then call it (chosen).** This is the backlog's own fix: one line each.
2. Check the return value and call webkit only when the standard method is missing. That is the same thing with more code.
