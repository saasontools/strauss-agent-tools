---
type: risk
title: Per-request options can redirect an API-key-bearing request to another host
description: >-
  requestOptions() feeds the same channel that accepts server_url and headers,
  and the key is attached to whatever host the request ends up targeting.
generated:
  by: mcp
  at: "2026-09-16T05:36:31.500Z"
verified:
  - by: unknown
    at: "2026-09-16T05:37:08.695Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/gemini-deep-research-mcp/src/gemini.ts
    symbol: requestOptions
    hash: "sha256:9399de05001dc172327157881b62ba1f3a07828cddb2b3f06502c766895c6f39"
    hash_kind: ast
    resolved_at: "2026-09-16T05:36:57.053Z"
    lines: 12
    resolver: tree-sitter
  - file: packages/gemini-deep-research-mcp/src/gemini.ts
    symbol: getClient
    hash: "sha256:e40603b8a02cc680754f2d2c0170b0d4a4a444c60f4f9d3f3a5efb9e7d5409a6"
    hash_kind: ast
    resolved_at: "2026-09-16T05:36:57.059Z"
    lines: 14
    resolver: tree-sitter
  - file: packages/gemini-deep-research-mcp/src/config.ts
    symbol: getBaseUrl
    hash: "sha256:8346a240a3f41e8feb4e7e82bb67127ef5b1146370c6de45211e15f577a14a76"
    hash_kind: ast
    resolved_at: "2026-09-16T05:36:57.060Z"
    lines: 3
    resolver: tree-sitter
strauss_verify:
  - >-
    grep -n 'server_url\|headers'
    packages/gemini-deep-research-mcp/src/gemini.ts — no hits in requestOptions
strauss_links:
  - target: decision.gemini-transport-per-request
    rel: related_to
strauss_status: open
strauss_materiality: important
strauss_confidence: medium
---

## Risk

buildGoogleGenAIClient installs a GoogleGenAISecurityProvider whose getAuthHeaders(url) supplies the GEMINI_API_KEY for each interactions request. GoogleGenAIRequestOptions also carries server_url and headers, and toGoogleGenAIRequestOptions passes both through per call. A server_url added to requestOptions() — or taken from a tool argument — would send the key to that host.

## Why it matters

The key is the one secret this server holds; logger.ts redaction protects the logs, not the wire.

## Mitigation

requestOptions() sets only timeout_ms, retries and retry_codes, and takes no arguments, so no caller can steer it. The endpoint stays a single operator-controlled env var, GEMINI_DEEP_RESEARCH_BASE_URL, read once in getClient and passed as httpOptions.baseUrl; it is documented as a testing/enterprise override and is never derived from tool input.

## Verification

requestOptions() has no parameters and names no server_url or headers key; getBaseUrl() has exactly one caller, getClient.

Relates to [decision.gemini-transport-per-request](decision.gemini-transport-per-request.md).
