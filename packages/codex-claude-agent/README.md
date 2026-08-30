# codex-claude-agent

`@saasontools/codex-claude-agent` lets Codex delegate arbitrary text prompts to Claude Code through `@anthropic-ai/claude-agent-sdk`. It supports foreground and tracked background work, Git worktrees, read-only/edit tool policies, JSON Schema output, retries, budgets, timeouts, and one stable `RunResult` contract.

The runtime never executes `claude -p`. `src/sdk.ts` is the only Agent SDK import boundary.

## Install and setup

Requirements: Node 22+, Git 2.30+, and either a Claude login or `ANTHROPIC_API_KEY`.

```bash
npm install -g @saasontools/codex-claude-agent
codex-claude-agent setup
```

The CLI is installed rather than run through `npx` on purpose: the Codex plugin's `UserPromptSubmit` hook calls it on every prompt, and the skill's examples shell out to it by name.

The front end for Codex — the `$claude` skill, the hooks, and the optional `claude-delegate` agent — ships separately as the [`codex-claude-agent` plugin](../../plugins/codex-claude-agent), listed in this repository's Codex marketplace (`.agents/plugins/marketplace.json`). The runner works standalone without it; the plugin is what makes `$claude` a thing you can type.

`setup` is idempotent. It checks SDK/version, auth, Git, and free disk, then enables `[features].hooks`, `[features].plugin_hooks`, and the repository's `.codex-claude` writable root in `~/.codex/config.toml`. Restart Codex after setup changes its config.

## Examples

Run in the current checkout:

```bash
codex-claude-agent run --read-only review the current diff
codex-claude-agent run --edit implement the requested fix
```

Use a registered worktree:

```bash
codex-claude-agent run --cwd /repo --worktree existing \
  --worktree-path /repo-worktrees/feature investigate the regression
```

Create a persistent worktree and branch:

```bash
codex-claude-agent run --cwd /repo --worktree create \
  --worktree-path /repo-worktrees/claude-fix --ref main \
  --branch codex-claude/claude-fix --edit implement the fix
```

Use an ephemeral worktree. Successful read-only runs remove it and safely delete its unchanged branch. Edit runs retain the worktree and branch so Claude's changes remain available, and emit `W_WORKTREE_RETAINED`:

```bash
codex-claude-agent run --cwd /repo --worktree ephemeral --edit fix the failing tests
```

Run and inspect background work:

```bash
codex-claude-agent run --background --worktree ephemeral --edit implement the migration
codex-claude-agent status
codex-claude-agent status --follow claude-abc123
codex-claude-agent result claude-abc123
codex-claude-agent cancel claude-abc123
```

Prompts resolve in this order: `--prompt`, free text, `--prompt-file`, stdin.

## Output

`--format markdown` emits `Result`/`Error`, optional `Warnings`, then `Run`. `--format text` writes only Claude's result to stdout and warnings/errors to stderr. `--json` emits exactly one `RunResult` JSON line and nothing else on stdout. `--stream` explicitly emits timestamped JSONL payloads to stderr for the caller. The retained job log stores status and tool metadata only; it never stores prompts, tool inputs/results, or response text deltas. Session-owned job state is stored outside the delegated workspace under the user's state directory (`$XDG_STATE_HOME/codex-claude-agent`, or `~/.local/state/codex-claude-agent`).

```ts
type RunResult = {
  ok: boolean;
  jobId: string;
  sessionId?: string;
  cwd: string;
  worktree?: {
    path: string;
    branch?: string;
    created: boolean;
    removed: boolean;
  };
  result?: string;
  structured?: unknown;
  usage: {
    turns: number;
    costUsd?: number;
    durationMs: number;
    model?: string;
  };
  warnings: { code: string; message: string; hint?: string }[];
  error?: {
    code: string;
    message: string;
    hint: string;
    retryable: boolean;
    attempts: number;
    cause?: string;
  };
  artifacts?: { resultPath: string; logPath: string };
};
```

The generated JSON Schema is at `schemas/run-result.schema.json`.

## Agents and structured output

Pass programmatic subagents inline through `runClaude()` or from a data-only JSON file. Executable JavaScript and TypeScript agent files are rejected because they would run in the host process outside the Claude permission boundary:

```json
{
  "reviewer": {
    "description": "Review security-sensitive TypeScript changes",
    "prompt": "Audit the requested code and report concrete findings.",
    "tools": ["Read", "Glob", "Grep"],
    "model": "sonnet"
  }
}
```

```bash
codex-claude-agent run --agents ./agents.json audit this feature
```

Read-only runs use SDK isolation by default (`settingSources: []`) and inject `CLAUDE.md` text as inert project instructions. Pass `--setting-source project` only for a repository whose `.claude/settings.json`, hooks, and permission rules you trust.

The standalone CLI activates OpenTelemetry when `OTEL_EXPORTER_OTLP_ENDPOINT` or `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` is set. It uses the standard OTLP HTTP exporter, honors `OTEL_SERVICE_NAME` (default `codex-claude-agent`), propagates W3C trace context to detached workers, and flushes spans before exit. Leave the endpoint unset or set `OTEL_SDK_DISABLED=true` to disable export.

For structured output, pass a JSON Schema file. The SDK constrains the result, the runner validates it again with Ajv, and one failed validation is repaired by resuming the same Claude session:

```bash
codex-claude-agent run --json --schema ./findings.schema.json review this diff
```

## Billing and authentication

Authentication determines billing. `ANTHROPIC_API_KEY` takes precedence and uses Claude Platform pay-as-you-go billing. When it is unset, an authenticated Claude login can use the Claude subscription path. As of 2026-08-22, Anthropic says Agent SDK and third-party Agent SDK usage still draw from subscription usage limits; previously announced separate credits were paused. For shared production automation, Anthropic recommends API-key billing. Recheck [Agent SDK plan terms](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan) and [API-key precedence](https://support.claude.com/en/articles/12304248-manage-api-key-environment-variables-in-claude-code) before deployment.

`maxBudgetUsd` is enforced by the SDK and reported in `usage.costUsd`; it is not a billing guarantee for already-started requests.

## Exit codes

| Code                   | Exit | Meaning                                   |
| ---------------------- | ---: | ----------------------------------------- |
| `E_AUTH`               |   10 | Claude authentication missing or rejected |
| `E_SDK_MISSING`        |   11 | Agent SDK unavailable                     |
| `E_SDK_VERSION`        |   12 | Agent SDK below the minimum               |
| `E_NOT_GIT_REPO`       |   20 | cwd is not a Git repository               |
| `E_WORKTREE_NOT_FOUND` |   21 | existing worktree is not registered       |
| `E_WORKTREE_EXISTS`    |   22 | worktree path conflict                    |
| `E_BRANCH_EXISTS`      |   23 | branch conflict                           |
| `E_DETACHED_HEAD`      |   24 | edit mode on detached HEAD                |
| `E_NESTED`             |   25 | nested delegate suppressed                |
| `E_TIMEOUT`            |   30 | timeout exhausted                         |
| `E_CANCELLED`          |   31 | run cancelled                             |
| `E_MAX_TURNS`          |   32 | turn budget exhausted                     |
| `E_MAX_BUDGET`         |   33 | USD budget exhausted                      |
| `E_STRUCTURED_OUTPUT`  |   34 | JSON Schema output failed                 |
| `E_TRANSIENT_API`      |   40 | transient retries exhausted               |
| `E_EXECUTION`          |   41 | Claude or Git execution failed            |
| `E_INVALID_REQUEST`    |   42 | invalid input or flags                    |
| `E_UNKNOWN`            |   70 | unclassified failure                      |

## Differences from sendbird/cc-plugin-codex

| Area              | sendbird/cc-plugin-codex     | codex-claude-agent                       |
| ----------------- | ---------------------------- | ---------------------------------------- |
| Runtime           | `claude -p` subprocess       | `query()` from Claude Agent SDK only     |
| Commands          | Fixed review/rescue commands | Arbitrary text prompt plus request flags |
| Output            | Workflow-specific payloads   | One zod-validated `RunResult`            |
| Worktrees         | Review isolation             | none, existing, create, or ephemeral     |
| Structured output | Review schema flow           | Caller-supplied JSON Schema with repair  |
| Retries           | Companion-command lifecycle  | Classified SDK/API retries with jitter   |
| Background work   | Session-owned tracked jobs   | Per-repo atomic jobs with PID identity   |

The shared patterns are native plugin layout, setup/verification, tracked jobs, session ownership, nested-session suppression, unread-result nudges, and large-diff degradation.
