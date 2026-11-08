#!/bin/bash
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
HOOKS_DIR=$(git rev-parse --git-path hooks)
mkdir -p "$HOOKS_DIR"

for hook in pre-commit; do
  cp "$ROOT/.githooks/$hook" "$HOOKS_DIR/$hook"
  chmod +x "$HOOKS_DIR/$hook"
done

git config --worktree core.hooksPath "$HOOKS_DIR"
printf '已安装 worktree hooks：%s\n' "$HOOKS_DIR"
