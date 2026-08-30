---
name: claude
description: Delegate arbitrary reviews, investigations, fixes, or implementation work from Codex to Claude Code through the codex-claude-agent runner. Use when the user invokes $claude, asks Codex to get a Claude Code second opinion, wants Claude to work in a Git worktree, or needs a tracked Claude background job or structured Claude result.
---

# Claude delegate

Run `codex-claude-agent run ... --format markdown` by default and relay the rendered output.

If `codex-claude-agent` is not on `PATH`, prefix every invocation in this skill with `npx -y --omit=optional -p @saasontools/codex-claude-agent@0.x --`. Nothing else changes. `--omit=optional` is not decorative: it keeps the Agent SDK's bundled Claude Code binary (~245 MB) out of the download, and the runner spawns the installed `claude` instead.

## Procedure

1. Convert the user's free text and flags directly into one runner invocation. Do not replace the task with a fixed command.
2. Default to read-only. Pass `--edit` only when the user asks Claude to change files. Prefer `--worktree ephemeral` for isolated edits unless the user selected another worktree mode.
3. Run in the foreground unless the user asks for `--background`. Use `codex-claude-agent status`, `result`, or `cancel` for a tracked job.
4. Relay `result` or `structured` verbatim, without softening or rewriting it. List every warning.
5. If `ok` is false, show `error.message` and `error.hint`, then stop.

When `caveman:caveman-review` is installed, use it for host-authored prose around the relayed result. Never apply it to Claude's verbatim `result` or `structured` payload.

Never retry independently. The runner already classifies and exhausts permitted retries.

If the user's first free-text word is `status`, `result`, `cancel`, or `setup`, route to that CLI subcommand instead of treating it as a Claude prompt. This makes `$claude result <job-id>` open the stored result without launching a new model run.

## Structured consumers

When a downstream step needs stable fields, pass `--json` and parse only the last stdout line as `RunResult`. For example, a fix loop may read `structured.findings` from an output schema. Ignore stderr except for optional JSONL events from `--stream`.

## Flags

Use free text or `--prompt-file`, plus any of: `--cwd`, `--worktree <none|existing|create|ephemeral>`, `--worktree-path`, `--ref`, `--branch`, `--edit`, `--read-only`, `--model`, `--effort`, `--max-turns`, `--budget`, `--timeout`, `--schema`, `--agents`, `--resume`, `--fork`, `--background`, `--wait`, `--format`, and `--stream`.

Examples:

```bash
codex-claude-agent run --format markdown --read-only review the current authentication changes
codex-claude-agent run --format markdown --edit --worktree ephemeral fix the failing tests
codex-claude-agent run --json --schema findings.schema.json audit this diff
```
