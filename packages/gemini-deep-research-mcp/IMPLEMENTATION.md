# Implementation brief — Gemini Deep Research MCP server

**Status: deliberate stub.** This package currently serves the generated
placeholder `ping` tool. It exists to prove the full pipeline (build, tests,
CI, release, MCPB packaging, marketplace registration). The real
implementation lands in a follow-up session and must satisfy the constraints
below — they are design inputs, not suggestions.

## API surface (Google side)

- Deep Research is driven through the **Interactions API**, not
  `generateContent`. Requests must set `background: true` and `store: true`.
- Agents: `deep-research-preview-04-2026` and
  `deep-research-max-preview-04-2026`.
- Runs take **5–60 minutes**. Jobs run on Google's infrastructure and survive
  local process death.
- SDK: `@google/genai` (pinned ground truth: 2.17.1). Note the MCPB bundle
  implication below.

## Tool surface (MCP side)

- **Async job handles are the primary surface**: `start`, `status`, `fetch`,
  `list`, `cancel`. Never a blocking research call as the main path —
  **Codex's default tool timeout is 60 seconds** and a Deep Research run is
  5–60 minutes.
- Any blocking convenience wrapper must degrade to returning the job id when
  its wait budget expires — degrade, never error.
- `fetch` must return a **file path plus a truncated preview** by default.
  Reports run 10k–40k tokens; inlining one wrecks the calling agent's
  context. Full inline content only behind an explicit opt-in parameter.

## Persistence

- Just `job_id -> interaction_id` in JSON files (jobs live on Google's side).
  No database. Store under an OS-appropriate data dir, keyed per API key hash
  if that proves necessary.

## Packaging constraints (already wired by the generator)

- `GEMINI_API_KEY` is read lazily; startup must succeed without it so
  `tools/list` works before configuration. Keep it that way.
- The MCPB bundle inlines everything (`noExternal: [/.*/]`).
  `@google/genai` pulls in `google-auth-library` (CJS, dynamic `require()` of
  node builtins) — the `createRequire` banner in `tsup.bundle.config.ts` is
  what keeps the bundle bootable. Do not remove it, and keep
  `SMOKE_ENTRY=bundle/server/index.js pnpm test` green.
- The smoke test asserts the exact tool list; update it as tools are added.
