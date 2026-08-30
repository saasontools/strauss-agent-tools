#!/usr/bin/env bash
set -euo pipefail

# A run Claude started for this session may have finished while the user was
# doing something else; this surfaces it on their next prompt.

if [[ -n "${CODEX_CLAUDE_AGENT_NESTED:-}" ]]; then
  exit 0
fi

# The plugin directory ships manifests and markdown, not a build: the runner
# comes from npm. Resolved through PATH rather than `npx`, deliberately — this
# runs on every prompt, and a registry round-trip per prompt is a cost the user
# would feel. An install that isn't there yet is silence, not an error; the
# skill's own examples fail loudly enough when the CLI is genuinely missing.
if ! command -v codex-claude-agent >/dev/null 2>&1; then
  exit 0
fi

codex-claude-agent hook unread
