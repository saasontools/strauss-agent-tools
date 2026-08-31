# codex-claude-agent

Delegate a task from Codex to Claude Code and get a structured result back.
`$codex-claude-agent:claude review the auth changes` runs Claude Code through the Claude Agent
SDK — read-only by default, optionally in a throwaway Git worktree, under a
turn/budget/time ceiling — and relays what it found.

This plugin is the front end: a `claude` skill, session hooks, and an optional
Codex agent.

## Install

Add this repository as a Codex marketplace
(`.agents/plugins/marketplace.json`) and install `codex-claude-agent` by name.

The plugin directory ships manifests and markdown; the runner itself is the
[`@saasontools/codex-claude-agent`](../../packages/codex-claude-agent) npm
package. **You do not have to install it.** When it is not on `PATH`, the skill
reaches it through `npx -y --omit=optional -p
@saasontools/codex-claude-agent@0.x`, which tracks every 0.x release without
anyone updating anything.

Install it anyway. npx re-resolves the version range on every invocation, which
measures at 7.5-9.0s against 0.4s for an installed binary — worth little on a
delegated run that takes minutes, and worth a lot on the finished-job notice,
which is why that hook skips npx entirely and goes quiet instead:

```bash
npm install -g --omit=optional @saasontools/codex-claude-agent
```

Then, once per machine:

```bash
codex-claude-agent setup
```

`setup` is idempotent. It checks the SDK, the Claude Code executable, your
auth, Git, and free disk,
then enables `[features].hooks`, `[features].plugin_hooks`, and the
repository's `.codex-claude` writable root in `~/.codex/config.toml`. Restart
Codex after it changes anything.

Requirements: Node 22+, Git 2.30+, Claude Code installed, and either a Claude
login or `ANTHROPIC_API_KEY`.

### Why `--omit=optional`

The Agent SDK ships the Claude Code executable as a per-platform optional
dependency: ~245 MB, and a second copy of the CLI you are already running,
frozen at whatever build that SDK release carried. The runner never spawns it
— it resolves your installed `claude` and hands the SDK that path, so
delegated runs follow your own Claude Code version. Omitting it takes the
download from ~290 MB to ~45 MB. `CODEX_CLAUDE_AGENT_CLAUDE_PATH` pins a
specific executable if you keep several.

## What the plugin carries

| Piece                                | Where                                |
| ------------------------------------ | ------------------------------------ |
| The `claude` skill                   | `skills/claude/SKILL.md`             |
| Session-id capture for job ownership | `hooks/session-start.sh`             |
| Finished-job notice on next prompt   | `hooks/unread-result.sh`             |
| Optional `claude-delegate` agent     | `.codex/agents/claude-delegate.toml` |

`hooks/hooks.json` wires `SessionStart` and `UserPromptSubmit`. Both scripts
exit silently when `CODEX_CLAUDE_AGENT_NESTED` is set, so a Claude session the
runner started never re-enters the plugin.

The unread-result hook runs on every prompt, so it is ordered to cost nothing
until it can't: it tests for the runner's state directory first and exits when
no job has ever been started, then calls an installed CLI. It does **not** fall
back to `npx` the way the skill does — measured against the published package
with a warm cache, npx costs 7.5-9.0s per invocation against 0.4s for an
installed binary, and eight seconds per turn is not a price a courtesy notice
gets to charge. Without the CLI on `PATH` the hook stays silent, which is the
one thing `npm i -g` buys you that the skill's npx fallback does not.

The agent file is a Codex project agent, not something the plugin registers.
Copy it in to get `claude-delegate` as a selectable agent:

```bash
cp .codex/agents/claude-delegate.toml <repo>/.codex/agents/
```

## Using it

Codex addresses a plugin's skill by its qualified name, so the invocation
carries the plugin in front of it:

```
$codex-claude-agent:claude review the current authentication changes
$codex-claude-agent:claude --edit --worktree ephemeral fix the failing tests
$codex-claude-agent:claude --background audit this diff against our error-handling rules
$codex-claude-agent:claude status
$codex-claude-agent:claude result <job-id>
```

Durations take a suffix — `--timeout 30m`, `1h`, `90s` — and a bare number is
milliseconds. `--worktree existing` and `create` both require
`--worktree-path`; `ephemeral` picks its own path and branch. The skill spells
these out so the model does not have to guess them one failed run at a time.

Read-only is the default; `--edit` is the only thing that lets Claude write,
and `--worktree ephemeral` keeps those writes off your checkout. Background
runs are tracked per repository — `status`, `result`, and `cancel` address them
by job id, and the first prompt after one finishes says so.

The full flag list, the `RunResult` contract, and the retry, budget, and
timeout rules are in the
[package README](../../packages/codex-claude-agent/README.md).
