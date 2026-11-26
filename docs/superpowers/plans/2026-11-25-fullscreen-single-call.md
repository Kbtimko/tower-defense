# Fullscreen Single Call Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `toggleFullscreen` calls exactly one fullscreen request or exit method per toggle (backlog #41e).

**Architecture:** Two expressions change in `src/ui/fullscreen.js`.

**Tech Stack:** Vanilla JS ES modules, Vitest 2 + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-25-fullscreen-single-call-design.md`

## Global Constraints
- Request: `await (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el);`
- Exit: `await (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);`
- The method must be called with its own receiver (`this === el` / `this === doc`). Real DOM methods throw "Illegal invocation" when called unbound.
- No other change to `fullscreen.js` or its callers.

## Review Focus
- Receiver binding: a test asserts `this`, because the old code got it for free from the method call.
- Every existing test in `fullscreen.test.js` must still pass unchanged.

---

### Task 1: Single fullscreen call

**Files:**
- Modify: `src/ui/fullscreen.js`
- Test: `src/ui/fullscreen.test.js`

- [ ] **Step 1: Write the failing tests** in the `toggleFullscreen` describe:
  1. `calls only the standard request when it returns undefined`. Use `el = { requestFullscreen: vi.fn(() => undefined), webkitRequestFullscreen: vi.fn() }`. Expect `requestFullscreen` called once and `webkitRequestFullscreen` not called.
  2. `exits only via the standard API when it returns undefined`. Use `doc = { fullscreenElement: {}, exitFullscreen: vi.fn(() => undefined), webkitExitFullscreen: vi.fn() }`. Expect `exitFullscreen` called once and `webkitExitFullscreen` not called.
  3. `calls the chosen method on its own element and document`. Use `function` spies that record `this`: for request (standard), for the webkit request fallback, and for exit. Expect each recorded receiver `toBe` the `el` or `doc` passed in.
- [ ] **Step 2: Run** `npx vitest run src/ui/fullscreen.test.js`. Expected: tests 1 and 2 fail and test 3 passes, since the old code binds via the method call. Paste the raw output.
- [ ] **Step 3: Implement** per the Global Constraints. Add a one-line *why* comment: `??` would fall through on an `undefined` return and call both.
- [ ] **Step 4: Run** the file, then `npx vitest run`. All pass, exit 0. Never pipe through `tail` or `head`.
- [ ] **Step 5: Mutation checks.** Paste the raw failing output for each, then restore:
  - (a) revert the request to `?.() ?? ?.()`: test 1 fails;
  - (b) revert the exit the same way: test 2 fails;
  - (c) call the selected request method without `.call(el)` (`const f = el.requestFullscreen ?? el.webkitRequestFullscreen; await f?.();`): test 3 fails.
- [ ] **Step 6: Commit**
```bash
git add src/ui/fullscreen.js src/ui/fullscreen.test.js
git commit -m "fix(fullscreen): call exactly one request/exit method per toggle (#41e)"
```
