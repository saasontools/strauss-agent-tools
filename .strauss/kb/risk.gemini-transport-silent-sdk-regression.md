---
type: risk
title: An @google/genai bump can silently un-wire the interactions transport policy
description: >-
  The retry and timeout wiring rests on SDK internals, not on a public contract,
  and it fails open rather than loud.
generated:
  by: mcp
  at: "2026-09-16T05:36:05.754Z"
verified:
  - by: unknown
    at: "2026-09-16T05:37:08.942Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/gemini-deep-research-mcp/src/gemini.ts
    symbol: requestOptions
    hash: "sha256:9399de05001dc172327157881b62ba1f3a07828cddb2b3f06502c766895c6f39"
    hash_kind: ast
    resolved_at: "2026-09-16T05:36:56.679Z"
    lines: 12
    resolver: tree-sitter
  - file: packages/gemini-deep-research-mcp/package.json
    hash: "sha256:5a9a8eb23e02f422c711ee9bd8db4b1d3acffec12841b28cefef91005a6500fa"
    hash_kind: raw
    resolved_at: "2026-09-16T05:36:56.692Z"
    lines: 41
strauss_verify:
  - pnpm vitest run test/integration.spec.ts -t 429
strauss_links:
  - target: decision.gemini-transport-per-request
    rel: related_to
strauss_status: open
strauss_materiality: important
strauss_confidence: medium
---

## Risk

requestOptions() targets toGoogleGenAIRequestOptions' pass-through of timeout_ms, retries and retry_codes, confirmed by reading @google/genai 2.20.0's dist. GoogleGenAIRequestOptions is declared but not exported, so nothing in the type system pins this shape. An SDK upgrade that renames a field, stops forwarding rest, or reinstates client-level httpOptions leaves the code compiling and the policy inert.

## Why it matters

The failure is invisible: requests fall back to maxRetries 4 and no timeout — exactly the state this change fixed. A 429 storm costs five API calls per user action, and a hung request pins a job forever.

## Mitigation

The 429 attempt-count assertion fails if retries stop being honoured. Nothing currently guards the timeout — it was confirmed once by hand (timeout_ms lowered to 300 against a non-responding server, aborted at 308ms) and that check was not kept.

## Verification

On any @google/genai bump, re-read toGoogleGenAIRequestOptions and buildGoogleGenAIClient in dist/node/index.mjs, and run the 429 test.

Relates to [decision.gemini-transport-per-request](decision.gemini-transport-per-request.md).
