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

# An installed CLI is used when present; otherwise the published package is
# fetched on demand, so the plugin works with nothing installed. The scope is
# pinned to npmjs because a project that maps @saasontools elsewhere would
# otherwise 404, and --omit=optional keeps the Agent SDK's ~245 MB bundled
# Claude Code binary out of it — the runner spawns the user's own install.
if command -v codex-claude-agent >/dev/null 2>&1; then
  codex-claude-agent hook unread
else
  npx -y --omit=optional \
    --@saasontools:registry=https://registry.npmjs.org \
    -p "@saasontools/codex-claude-agent@0.x" \
    -- codex-claude-agent hook unread
fi
