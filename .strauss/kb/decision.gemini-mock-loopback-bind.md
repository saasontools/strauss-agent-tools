---
type: decision
title: "The Gemini mock server binds 127.0.0.1, never the wildcard"
description: >-
  On macOS a wildcard listen(0) can be handed a port another process already
  holds on 127.0.0.1; requests to the mock's 127.0.0.1 URL then reach that
  process, which answers 4xx, and integration cases fail in milliseconds under
  parallel load.
generated:
  by: mcp
  at: "2026-09-15T18:12:44.445Z"
strauss_anchors:
  - file: packages/gemini-deep-research-mcp/test/mock-gemini.ts
    symbol: MockGemini.start
    hash: "sha256:f81dfb18fa69c725d872934f921403c3be8edec9a48a15beb37accba8d2a06eb"
    hash_kind: ast
    resolved_at: "2026-09-15T18:12:56.133Z"
    lines: 85
    resolver: tree-sitter
strauss_verify:
  - >-
    cd packages/gemini-deep-research-mcp; run test/integration.spec.ts in 6
    parallel loops x 10: 0 failures (wildcard bind: 2 of 48 failed, happy-path
    start and collaborative-planning start, 'Gemini API error (HTTP ...) during
    start')
strauss_status: accepted
strauss_materiality: non-blocking
strauss_confidence: high
---

## Decision

The Gemini mock server binds 127.0.0.1, never the wildcard

## Rationale

On macOS a wildcard listen(0) can be handed a port another process already holds on 127.0.0.1; requests to the mock's 127.0.0.1 URL then reach that process, which answers 4xx, and integration cases fail in milliseconds under parallel load.

## Rejected

The wildcard listen(0) that stood before: the IPv6 dual-stack allocator ignores IPv4-specific binds (holding 200 listeners on 127.0.0.1, 17,000 wildcard allocations collided with all 200; 127.0.0.1 allocations collided with none), and a 127.0.0.1 bind beats [::] for the same port. Retrying or asserting around the failure was rejected: the 4xx is not retried by the SDK and the wrong server answered, so no retry reaches the mock.

## Impact

Any new test server in this package must bind the host its URL names. The added isError assertions print the tool's response text, so a recurrence names the HTTP status instead of an opaque TypeError.
