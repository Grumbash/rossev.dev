#!/bin/sh
# Reads git's pre-push stdin (<local ref> <local sha> <remote ref> <remote sha> per line) and
# prints "<pushed sha> <range>" for every pushed branch whose range touches the site.
# Prints nothing for deletions, tags and pushes that only touch docs, so the hook can skip them.
# Usage: scripts/push-range.sh <remote name>   (tested in tests/perf-budget.test.ts)
remote=${1:-origin}
zero=0000000000000000000000000000000000000000
empty_tree=$(git hash-object -t tree /dev/null)
site='^(src/|public/|scripts/|astro\.config\.|package\.json$|bun\.lock$|perf-budgets\.json$)'

while read -r lref lsha _rref rsha; do
  case "$lref" in refs/heads/*) ;; *) continue ;; esac
  [ "$lsha" = "$zero" ] && continue

  base=""
  if [ "$rsha" != "$zero" ] && git cat-file -e "$rsha^{commit}" 2>/dev/null; then
    base=$rsha
  elif base=$(git merge-base "refs/remotes/$remote/main" "$lsha" 2>/dev/null); then
    :
  else
    oldest=$(git rev-list --reverse "$lsha" --not --remotes="$remote" | head -n 1)
    base=$(git rev-parse -q --verify "${oldest:-$lsha}~1" 2>/dev/null) ||
      base=$(git rev-parse -q --verify "$lsha~1" 2>/dev/null) || base=""
  fi

  if [ -n "$base" ]; then range="$base..$lsha"; from=$base; else range=$lsha; from=$empty_tree; fi
  git diff --name-only "$from" "$lsha" | grep -Eq "$site" && echo "$lsha $range"
done
exit 0
