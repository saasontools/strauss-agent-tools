# AGENTS.md

Guidance for AI coding agents working on `@saasontools/gemini-deep-research-mcp`.
Repo-wide rules live in the root [AGENTS.md](../../AGENTS.md); design detail in
[ARCHITECTURE.md](ARCHITECTURE.md).

## Commands (no Nx knowledge needed)

- `pnpm build && pnpm test` — build + 50+ tests, no API key, no network
- `pnpm vitest run test/integration.spec.ts` — one suite
- `pnpm build:bundle && SMOKE_ENTRY=bundle/server/index.js INTEGRATION_ENTRY=bundle/server/index.js pnpm test`
  — the MCPB bundle must stay green too; bundling is where servers break
- `pnpm typecheck && pnpm lint`

## Rules that are load-bearing

- **stdout is the JSON-RPC transport.** Never `console.log`; all diagnostics
  go through `src/logger.ts` (stderr). ESLint enforces this.
- **The API key must never be persisted or logged** — the logger redacts, and
  `logger.spec.ts` asserts it. Keep that test honest.
- **Startup must succeed without a key** so `tools/list` works before the user
  configures anything. Config is read lazily (`src/config.ts`); keep it that way.
- **Async job handles are the primary surface** — runs take 5–60 minutes and
  clients cap tool calls (~60s). The blocking wrapper degrades to a job id on
  timeout; never turn that into an error.
- **User-facing failures return `isError: true`** with actionable text; throw
  only for genuine protocol bugs.
- The `createRequire` banner in `tsup.bundle.config.ts` keeps the inlined
  bundle bootable (google-auth-library does dynamic `require()`). Don't remove it.
- The mock Gemini server (`test/mock-gemini.ts`) is the test backbone; the SDK
  recomputes `output_text` from `model_output` steps, so fixtures must carry
  report text in steps.
- The smoke test asserts the exact tool list — update it when tools change.
