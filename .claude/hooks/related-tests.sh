#!/usr/bin/env bash
# PostToolUse(Edit|Write), asyncRewake: run the Vitest tests related to the edited file
# plus any other uncommitted .js changes. Silent when they pass or can't run here.
# On failure: exit 2, which wakes Claude with stderr.

f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
case "$f" in *.js|*.mjs) ;; *) exit 0 ;; esac
case "$f" in */node_modules/*|*/dist/*) exit 0 ;; esac

root=$(dirname "$f")
while [ "$root" != "/" ] && [ ! -f "$root/package.json" ]; do root=$(dirname "$root"); done
# Only run inside this repo or one of its worktrees, never another tree's vitest.
common() { (cd "$1" 2>/dev/null && cd "$(git rev-parse --git-common-dir 2>/dev/null)" 2>/dev/null && pwd -P); }
mine=$(common "${CLAUDE_PROJECT_DIR:-}")
[ -n "$mine" ] && [ "$mine" = "$(common "$root")" ] || exit 0
[ -x "$root/node_modules/.bin/vitest" ] || exit 0
# Stale install (lockfile changed since the last npm ci): results would be noise.
[ "$root/package-lock.json" -nt "$root/node_modules/.package-lock.json" ] && exit 0
cd "$root" || exit 0

# One run at a time per checkout; a skipped edit is covered by the next run because
# every run includes all uncommitted .js changes. Locks older than 10 minutes are stale.
lock="${TMPDIR:-/tmp}/related-tests-$(printf '%s' "$root" | cksum | cut -d' ' -f1).lock"
if ! mkdir "$lock" 2>/dev/null; then
  [ -n "$(find "$lock" -maxdepth 0 -mmin +10 2>/dev/null)" ] || exit 0
  rm -rf "$lock" && mkdir "$lock" 2>/dev/null || exit 0
fi
trap 'rmdir "$lock" 2>/dev/null' EXIT

files=("$f")
while IFS= read -r p; do
  [ -n "$p" ] && [ -f "$p" ] && files+=("$root/$p")
done < <({ git diff --name-only HEAD; git ls-files --others --exclude-standard; } 2>/dev/null |
         grep -E '\.(m?js)$' | grep -v '^node_modules/' | sort -u)

out=$(./node_modules/.bin/vitest related "${files[@]}" --run --passWithNoTests 2>&1)
[ $? -eq 0 ] && exit 0

fails=$(printf '%s\n' "$out" | grep -E '^ FAIL ' | head -30)
printf 'Related tests failed after editing %s:\n%s\n\nLast lines:\n%s\n' \
  "$f" "$fails" "$(printf '%s\n' "$out" | tail -25)" >&2
exit 2
