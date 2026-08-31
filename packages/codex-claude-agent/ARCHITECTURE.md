# codex-claude-agent design

The runner borrows cc-plugin-codex's plugin layout, per-repository job records, atomic state transitions, PID/start-time cancellation guard, unread-result hook, nested-session suppression, 15-minute gate, and large-diff fallback. It deliberately does not borrow the `claude -p` execution path: `sdk.ts` is the sole SDK import boundary.

## Verified SDK 0.3.220 surface

The installed lockfile version and the published `sdk.d.ts` were checked directly. `query({ prompt, options })` returns an async iterable `Query`. Verified `Options` keys used here: `cwd`, `additionalDirectories`, `agents`, `settingSources`, `permissionMode`, `tools`, `canUseTool`, `model`, `effort`, `maxTurns`, `maxBudgetUsd`, `abortController`, `resume`, `forkSession`, `env`, `systemPrompt`, `outputFormat`, `includePartialMessages`, and `allowDangerouslySkipPermissions`. Structured output is `{ type: 'json_schema', schema }`; a successful result exposes `structured_output`.

The stream begins with `{ type: 'system', subtype: 'init', session_id, agents?, model, cwd, tools }`. Assistant content arrives as `{ type: 'assistant', message: BetaMessage }`; partial deltas arrive as `{ type: 'stream_event', event }`; tool results arrive in user-message content. The terminal success shape is `{ type: 'result', subtype: 'success', result, structured_output?, num_turns, total_cost_usd, duration_ms, modelUsage, session_id }`. Terminal errors use subtypes `error_during_execution`, `error_max_turns`, `error_max_budget_usd`, or `error_max_structured_output_retries`, and include `errors`, usage, duration, cost, and session ID.

## Deliberate choices

- The Claude Code executable comes from the host, not from the SDK. The Agent
  SDK's per-platform binary is an optional dependency this package installs
  without; `claude-binary.ts` resolves the user's `claude` (or
  `CODEX_CLAUDE_AGENT_CLAUDE_PATH`) and passes it as
  `pathToClaudeCodeExecutable`. A delegated run therefore uses the same Claude
  Code build the user runs interactively, and a missing one is a diagnostics
  failure (`E_CLAUDE_MISSING`) rather than a spawn error from inside the SDK.
- `tools` limits the exposed built-ins while `canUseTool` enforces non-interactive approval. Read-only Bash commands are matched locally and rejected when they contain shell control syntax or write-capable Git flags.
- SDK isolation is the default. `CLAUDE.md` is injected as text, project settings require explicit opt-in, and the SDK subprocess receives a minimal runtime/Claude-auth environment rather than every host secret.
- Structured-output repair resumes the same session once. Transient retries stop after any tool use so a recovered stream cannot repeat mutations.
- Job JSON is authoritative, stored in a per-repository user-state directory outside Claude's workspace roots, and written atomically through no-follow file handles. Cancellation verifies both PID and process start time, while status reconciles dead workers into durable failure results.
- Successful read-only ephemeral runs are removed with an unchanged branch. Edit runs and failures retain their worktree and branch for inspection or continuation.
