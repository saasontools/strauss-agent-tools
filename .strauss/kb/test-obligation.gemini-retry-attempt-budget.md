---
type: test-obligation
title: The configured retry attempt budget must bound interactions calls
description: >-
  GEMINI_DEEP_RESEARCH_RETRY_ATTEMPTS was inert for a full release; only an
  attempt count observed at the wire proves it is honoured.
generated:
  by: mcp
  at: "2026-09-16T05:36:15.370Z"
verified:
  - by: unknown
    at: "2026-09-16T05:37:09.271Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/gemini-deep-research-mcp/src/gemini.ts
    symbol: requestOptions
    hash: "sha256:9399de05001dc172327157881b62ba1f3a07828cddb2b3f06502c766895c6f39"
    hash_kind: ast
    resolved_at: "2026-09-16T05:36:57.375Z"
    lines: 12
    resolver: tree-sitter
strauss_links:
  - target: decision.gemini-transport-per-request
    rel: related_to
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Obligation

With GEMINI_DEEP_RESEARCH_RETRY_ATTEMPTS=1, a 429 from the interactions endpoint produces exactly one create request and returns promptly.

## Why it matters

Asserting only the mapped error message passes whether the SDK retried once or five times — that is how the inert config survived. The attempt count is the only assertion that distinguishes them, and the elapsed bound catches a backoff that is honoured but unbounded.

## How to verify

test/integration.spec.ts, "does not retry a 429 when the attempt budget is 1": mock.createBodies() has length 1 and the call returns in under 2s. Confirmed to fail without the fix — it observes 5 create requests, the SDK's own maxRetries 4 default.

Relates to [decision.gemini-transport-per-request](decision.gemini-transport-per-request.md).
