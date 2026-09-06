#!/usr/bin/env bash
# Fast-forward or stop. Never rebase, never reset, never force.
#
# A session that starts on a stale base does not find out until it pushes, by
# which point its commits exist and the divergence needs adjudicating. So the
# fetch is at the start, and the only three outcomes are: already current,
# fast-forwarded onto origin, or a true fork that this script refuses to
# resolve. Resolving a fork means discarding one side's work, and which side is
# not a decision a session may take alone (.claude/CLAUDE.md §11.2).
#
#   bash scripts/sync.sh pull        fetch, fast-forward when behind
#   bash scripts/sync.sh auto-push   pull, then push development
#
# Exit codes: 0 fine · 2 wrong branch or bad usage · 3 forked, ask the owner.

set -eu

BRANCH=development
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

current="$(git branch --show-current)"
if [ "$current" != "$BRANCH" ]; then
  echo "sync: on '$current', not '$BRANCH'. Branch switching is the owner's." >&2
  exit 2
fi

do_pull() {
  git fetch origin "$BRANCH" --quiet

  local local_sha remote_sha base
  local_sha="$(git rev-parse HEAD)"
  remote_sha="$(git rev-parse "origin/$BRANCH")"

  if [ "$local_sha" = "$remote_sha" ]; then
    echo "sync: already at origin/$BRANCH ($(git rev-parse --short HEAD))"
    return 0
  fi

  base="$(git merge-base HEAD "origin/$BRANCH")"

  if [ "$base" = "$local_sha" ]; then
    # Strictly behind: a fast-forward loses nothing, because this side has
    # nothing origin does not.
    git merge --ff-only "origin/$BRANCH"
    echo "sync: fast-forwarded to $(git rev-parse --short HEAD)"
    return 0
  fi

  if [ "$base" = "$remote_sha" ]; then
    echo "sync: ahead of origin/$BRANCH by $(git rev-list --count "origin/$BRANCH"..HEAD) commit(s)"
    return 0
  fi

  echo "sync: FORKED — local and origin/$BRANCH have both moved since $(git rev-parse --short "$base")." >&2
  echo "      local  $(git rev-list --count "$base"..HEAD) commit(s): $(git log --oneline -1 HEAD)" >&2
  echo "      origin $(git rev-list --count "$base".."origin/$BRANCH") commit(s): $(git log --oneline -1 "origin/$BRANCH")" >&2
  echo "      Stop and ask the owner. Do not rebase, reset or force." >&2
  return 3
}

case "${1:-}" in
  pull)
    do_pull
    ;;
  auto-push)
    do_pull
    git push origin "$BRANCH"
    echo "sync: pushed $(git rev-parse --short HEAD) to origin/$BRANCH"
    ;;
  *)
    echo "usage: bash scripts/sync.sh {pull|auto-push}" >&2
    exit 2
    ;;
esac
