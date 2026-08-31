#!/usr/bin/env bash
set -euo pipefail

# A background run may have finished while the user was doing something else.
# This surfaces it on their next prompt.

if [[ -n "${CODEX_CLAUDE_AGENT_NESTED:-}" ]]; then
  exit 0
fi

# Fast path first: this runs on EVERY prompt, and most sessions never start a
# background job. One directory test is the whole cost for them. The path is
# the runner's own state root — kept in step by a test in the package.
state_root="${CODEX_CLAUDE_AGENT_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/codex-claude-agent}"
if [[ ! -d "$state_root/repositories" ]]; then
  exit 0
fi
# `-print -quit` stops at the first record rather than walking every repository.
if [[ -z "$(find "$state_root/repositories" -maxdepth 3 -name '*.json' -print -quit 2>/dev/null)" ]]; then
  exit 0
fi

# PATH only, and silent when the runner is not installed.
#
# The skill falls back to `npx -p @saasontools/codex-claude-agent@0.x`, which is
# right there: a delegated run takes minutes, so resolving the package first is
# noise. It is wrong here. Measured against the published 0.1.0 with a warm npx
# cache, that same fallback costs 7.5-9.0s per invocation — npx re-resolves the
# version range against the registry every time — against 0.4s for an installed
# binary. This hook runs on every prompt, so the fallback would put eight
# seconds in front of the user, per turn, for a courtesy notice.
#
# Best effort even so: stdout is the notice and is kept, while a runner that
# errors keeps its stderr and its exit code to itself.
if command -v codex-claude-agent >/dev/null 2>&1; then
  codex-claude-agent hook unread 2>/dev/null || true
fi
