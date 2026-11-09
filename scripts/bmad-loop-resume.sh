#!/usr/bin/env bash
# Run bmad-loop preflight, then forward to bmad-loop (resolve/resume/run/…).
# Usage:
#   scripts/bmad-loop-resume.sh resume 20261003-002047-b324
#   scripts/bmad-loop-resume.sh resolve --story KEY --no-interactive --resume RUN_ID
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Prefer pinned Node 24 when present (same as policy verify PATH).
if [[ -d "$HOME/.nvm/versions/node/v24.17.0/bin" ]]; then
  export PATH="$HOME/.nvm/versions/node/v24.17.0/bin:$PATH"
fi

node "$ROOT/scripts/bmad-loop-preflight.mjs"

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <bmad-loop-subcommand> [args...]" >&2
  exit 2
fi

cmd=$1
shift
# Global --project must follow the subcommand for this CLI.
exec bmad-loop "$cmd" --project "$ROOT" "$@"
