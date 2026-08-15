# Architecture

What this server is: a stdio MCP server that drives Google's Gemini Deep
Research agents through the Interactions API and hands the calling agent job
handles instead of blocking calls.

## Module map

```
src/
├── index.ts      # entry: connect createServer() over stdio (no logic)
├── server.ts     # wires tools + resources, emits resources/list_changed
├── tools.ts      # the seven MCP tools; isError convention; previews
├── resources.ts  # research://jobs, research://job/{job_id} (+completion)
├── jobs.ts       # refreshJob: remote interaction -> local record sync
├── gemini.ts     # SDK wrapper: lazy client, error mapping; no MCP concepts
├── extract.ts    # pure helpers: report text, thoughts, citations, usage
├── jobstore.ts   # atomic JSON persistence, 0700/0600, schemaVersion
├── config.ts     # lazy env reads (server must boot with no key)
├── logger.ts     # stderr-only JSON logger + key redaction
└── types.ts      # structural subset of the SDK Interaction + status sets
```

Layering rule: `gemini.ts`/`extract.ts` know nothing about MCP;
`tools.ts`/`resources.ts` know nothing about HTTP. `jobs.ts` is the only
module that touches both sides.

## Key decisions

- **Async job handles as the primary surface.** Runs take 5–60 minutes;
  Codex caps tool calls at ~60s. The blocking `deep_research` wrapper exists
  for convenience but degrades to a job id at its wait ceiling — returning an
  error there would throw away a run the user already paid for.
- **Status handling.** `queued | in_progress | requires_action` are live;
  `completed | failed | cancelled | incomplete | budget_exceeded` are
  terminal. `incomplete` and `budget_exceeded` are terminal-but-partial: a
  report may exist and `deep_research_fetch` serves it with a PARTIAL
  warning.
- **Reports are files, not payloads.** 10k–40k tokens inline would wreck the
  calling agent's context; fetch returns path + ~4k-char preview by default.
  Citations and usage are captured onto the job record at the terminal
  transition so fetches never need a second network call.
- **Collaborative planning.** A `requires_action` job holds a plan.
  `deep_research_reply` sets `collaborative_planning: false` on the follow-up
  turn by default because that is what actually starts the research — a bare
  "go ahead" leaves the run in planning forever.
- **Persistence is JSON files** (`job_id → interaction_id` + metadata),
  atomic tmp+rename writes, `0700` home / `0600` files, `schemaVersion` with
  defensive reads. Jobs live on Google's side; there is nothing a database
  would add. The API key is never persisted or logged (redaction is tested).
- **stdout is sacred.** It carries JSON-RPC; all diagnostics go to stderr via
  `logger.ts`, enforced by a package-level ESLint `no-console` rule.

## SDK notes (@google/genai 2.17.1, verified empirically)

- Endpoints used: `POST /v1beta/interactions`, `GET /v1beta/interactions/:id`,
  `POST /v1beta/interactions/:id/cancel`.
- `httpOptions.baseUrl` redirects the client — the entire test suite runs
  against a local mock HTTP server this way (no key, no network).
- The next-gen interactions client **throws its own error classes**
  (`RateLimitError`, …), not `ApiError`; `gemini.ts` duck-types the HTTP
  status. It also **retries 429/5xx internally regardless of
  `httpOptions.retryOptions`**.
- The SDK **recomputes `output_text` from `model_output` steps**; a
  server-sent `output_text` is ignored, so extraction reads steps as the
  source of truth (with `output_text` as the preferred fast path when the SDK
  provides it).
- The fully-inlined MCPB bundle needs the `createRequire` banner in
  `tsup.bundle.config.ts`: `google-auth-library` (CJS) does dynamic
  `require()` of node builtins. The integration suite re-runs against
  `bundle/server/index.js` (`INTEGRATION_ENTRY`) to keep this honest.

## Testing model

- Unit: job store (atomicity, permissions, traversal, schema tolerance),
  logger redaction, extraction helpers, error mapping.
- Integration: real `http.Server` mock of the Interactions API driven through
  a real MCP client — every lifecycle including failures, planning,
  partial-output, rate limits, progress notifications, and resources.
- The same integration + smoke suites run against the built npm entry and the
  MCPB bundle.
- One guarded live E2E (`RUN_LIVE_E2E=1` + key) — costs real money, excluded
  from CI.
- Coverage thresholds enforced in `vitest.config.ts`.
