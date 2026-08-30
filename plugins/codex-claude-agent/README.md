# codex-claude-agent

Delegate a task from Codex to Claude Code and get a structured result back.
`$claude review the auth changes` runs Claude Code through the Claude Agent
SDK — read-only by default, optionally in a throwaway Git worktree, under a
turn/budget/time ceiling — and relays what it found.

This plugin is the front end: a `$claude` skill, session hooks, and an optional
Codex agent. The runner behind it is the
[`@saasontools/codex-claude-agent`](../../packages/codex-claude-agent) npm
package.

## Install

The plugin directory ships manifests and markdown; the runner comes from npm,
and both the skill and the hooks call it through `PATH`:

```bash
npm install -g @saasontools/codex-claude-agent
```

Then add this repository as a Codex marketplace
(`.agents/plugins/marketplace.json`) and install `codex-claude-agent` by name.

Finally, once per machine:

```bash
codex-claude-agent setup
```

`setup` is idempotent. It checks the SDK, your Claude auth, Git, and free disk,
then enables `[features].hooks`, `[features].plugin_hooks`, and the
repository's `.codex-claude` writable root in `~/.codex/config.toml`. Restart
Codex after it changes anything.

Requirements: Node 22+, Git 2.30+, and either a Claude login or
`ANTHROPIC_API_KEY`.

## What the plugin carries

| Piece                                | Where                                |
| ------------------------------------ | ------------------------------------ |
| The `$claude` skill                  | `skills/claude/SKILL.md`             |
| Session-id capture for job ownership | `hooks/session-start.sh`             |
| Finished-job notice on next prompt   | `hooks/unread-result.sh`             |
| Optional `claude-delegate` agent     | `.codex/agents/claude-delegate.toml` |

`hooks/hooks.json` wires `SessionStart` and `UserPromptSubmit`. Both scripts
exit silently when `CODEX_CLAUDE_AGENT_NESTED` is set, so a Claude session the
runner started never re-enters the plugin. The unread-result hook also exits
silently when the CLI is not on `PATH`: it runs on every prompt, so it resolves
an installed binary rather than paying a registry round-trip through `npx`.

The agent file is a Codex project agent, not something the plugin registers.
Copy it in to get `claude-delegate` as a selectable agent:

```bash
cp .codex/agents/claude-delegate.toml <repo>/.codex/agents/
```

## Using it

```
$claude review the current authentication changes
$claude --edit --worktree ephemeral fix the failing tests
$claude --background audit this diff against our error-handling rules
$claude status
$claude result <job-id>
```

Read-only is the default; `--edit` is the only thing that lets Claude write,
and `--worktree ephemeral` keeps those writes off your checkout. Background
runs are tracked per repository — `status`, `result`, and `cancel` address them
by job id, and the first prompt after one finishes says so.

The full flag list, the `RunResult` contract, and the retry, budget, and
timeout rules are in the
[package README](../../packages/codex-claude-agent/README.md).
