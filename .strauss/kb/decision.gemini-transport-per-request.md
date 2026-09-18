---
type: decision
title: "Gemini interactions carry retry and timeout per request, not on the client"
description: >-
  startResearch, replyResearch, getInteraction and cancelInteraction each pass
  requestOptions() — timeout_ms, retries, retry_codes — to
  interactions.create/get/cancel; getClient's httpOptions keeps only baseUrl.


  GeminiNextGenInteractions.getClient() calls
  buildGoogleGenAIClient(parentClient) with no options: it forwards the parent's
  base URL and auth and nothing else. Client-level timeout and retryOptions
  never reach the transport, so each operation fell back to its own defaults
  (maxRetries 4, timeout_ms -1). GEMINI_DEEP_RESEARCH_RETRY_ATTEMPTS did nothing
  in production and a hung request never timed out.


  maxRetries counts retries after the first attempt — retryAttemptCountBackoff
  gives up at attempt >= maxRetries with attempt starting at 0 — hence
  getRetryAttempts() - 1.
generated:
  by: mcp
  at: "2026-09-16T05:35:51.450Z"
verified:
  - by: unknown
    at: "2026-09-16T05:37:07.195Z"
    note: "anchor-resolve: 6/6 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/gemini-deep-research-mcp/src/gemini.ts
    symbol: requestOptions
    hash: "sha256:9399de05001dc172327157881b62ba1f3a07828cddb2b3f06502c766895c6f39"
    hash_kind: ast
    resolved_at: "2026-09-16T05:36:56.260Z"
    lines: 12
    resolver: tree-sitter
  - file: packages/gemini-deep-research-mcp/src/gemini.ts
    symbol: getClient
    hash: "sha256:e40603b8a02cc680754f2d2c0170b0d4a4a444c60f4f9d3f3a5efb9e7d5409a6"
    hash_kind: ast
    resolved_at: "2026-09-16T05:36:56.265Z"
    lines: 14
    resolver: tree-sitter
  - file: packages/gemini-deep-research-mcp/src/gemini.ts
    symbol: startResearch
    hash: "sha256:6cb74cb683b8e6c2d5b1da4b610a728fd8c638bd42e7ae885774095e3ba00c5b"
    hash_kind: ast
    resolved_at: "2026-09-16T05:36:56.267Z"
    lines: 28
    resolver: tree-sitter
  - file: packages/gemini-deep-research-mcp/src/gemini.ts
    symbol: replyResearch
    hash: "sha256:257aa69f5bef956f5dee9fb859fab89f981dcb1327ce66012fc326a3a5097366"
    hash_kind: ast
    resolved_at: "2026-09-16T05:36:56.268Z"
    lines: 24
    resolver: tree-sitter
  - file: packages/gemini-deep-research-mcp/src/gemini.ts
    symbol: getInteraction
    hash: "sha256:ab7ea3368b8a6c291e4c406f709c76aff0e25094570d7b366abe19c22387ce6c"
    hash_kind: ast
    resolved_at: "2026-09-16T05:36:56.269Z"
    lines: 12
    resolver: tree-sitter
  - file: packages/gemini-deep-research-mcp/src/gemini.ts
    symbol: cancelInteraction
    hash: "sha256:5dd2732e233f9a8698a74a6a6a16c2ff27bd4c9a0c9fb91e47eb1d6092138da4"
    hash_kind: ast
    resolved_at: "2026-09-16T05:36:56.269Z"
    lines: 12
    resolver: tree-sitter
strauss_verify:
  - >-
    pnpm vitest run test/integration.spec.ts -t 429 — one create attempt, under
    2s
  - >-
    buildGoogleGenAIClient in @google/genai dist/node/index.mjs — still called
    with no options
strauss_status: accepted
strauss_materiality: important
strauss_confidence: high
---

## Decision

Gemini interactions carry retry and timeout per request, not on the client

## Rationale

startResearch, replyResearch, getInteraction and cancelInteraction each pass requestOptions() — timeout_ms, retries, retry_codes — to interactions.create/get/cancel; getClient's httpOptions keeps only baseUrl.

GeminiNextGenInteractions.getClient() calls buildGoogleGenAIClient(parentClient) with no options: it forwards the parent's base URL and auth and nothing else. Client-level timeout and retryOptions never reach the transport, so each operation fell back to its own defaults (maxRetries 4, timeout_ms -1). GEMINI_DEEP_RESEARCH_RETRY_ATTEMPTS did nothing in production and a hung request never timed out.

maxRetries counts retries after the first attempt — retryAttemptCountBackoff gives up at attempt >= maxRetries with attempt starting at 0 — hence getRetryAttempts() - 1.

## Rejected

Leaving timeout and retryOptions on httpOptions as documentation of intent: two homes for one policy, one of them inert, is how this went unnoticed. Hand-rolling a retry loop above the SDK: it would stack on the per-operation defaults rather than replace them.

## Impact

Any new interactions call must pass requestOptions() or it silently inherits maxRetries 4 and no timeout. Moving these values back to httpOptions would re-break it with no type error and no test failure outside the 429 attempt-count assertion.
