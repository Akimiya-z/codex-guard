#!/usr/bin/env bash
# Install the codex-guard skill for Codex and/or Claude Code agents.
# Usage: bash skills/install.sh [--codex] [--claude]   (default: both)
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/codex-guard"
DO_CODEX=1
DO_CLAUDE=1
for arg in "$@"; do
  case "$arg" in
    --codex) DO_CLAUDE=0 ;;
    --claude) DO_CODEX=0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [ "$DO_CODEX" -eq 1 ]; then
  DEST="$HOME/.codex/skills/codex-guard"
  mkdir -p "$(dirname "$DEST")"
  cp -R "$SRC" "$DEST"
  echo "installed for Codex → $DEST"
fi

if [ "$DO_CLAUDE" -eq 1 ]; then
  DEST="$HOME/.claude/skills/codex-guard"
  mkdir -p "$(dirname "$DEST")"
  cp -R "$SRC" "$DEST"
  echo "installed for Claude Code → $DEST"
fi

echo "done. Restart your agent session if it was already running."