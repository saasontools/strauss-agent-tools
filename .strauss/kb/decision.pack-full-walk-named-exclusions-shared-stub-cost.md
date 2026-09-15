---
type: decision
title: >-
  pack walks the whole component, names every exclusion, and reuses load's stub
  and token functions via a deliberate module cycle
description: >-
  The BFS does not stop at the hop bound: it walks the full reachable component
  (the bundle is already in memory) so the excluded list can name every record
  the hop and node limits cut — a named gap is knowable, a summarized one is
  not. The over-budget error carries that same list plus
  recordCount/approxTokens/budgetTokens and emits nothing, because a partial
  pack is indistinguishable from a complete one. stub(), estimateTokens(),
  estimateStubTokens(), DEFAULT_LOAD_BUDGET are exported from kb-store.ts and
  imported by pack.ts, creating an intentional kb-store <-> pack import cycle
  (all uses are call-time, so both ESM and the tsup CJS build resolve it; dist
  smoke suites prove it).
tags:
  - kb
  - pack
  - budget
  - determinism
generated:
  by: mcp
  at: "2026-08-26T05:51:11.669Z"
verified:
  - by: "agent:security-reviewer"
    at: "2026-09-14T17:04:22.071Z"
    note: >-
      Security review 2026-09-14 vs main@b0b88be: holds. pack()
      (src/pack.ts:88-170) BFS runs until frontier empty, no hop cutoff;
      excluded = within.slice(maxNodes) + reached beyond hops, ids only, sorted.
      Over budget throws KbPackBudgetExceededError(recordCount, tokensLoaded,
      budgetTokens, excluded) before any return. kb-store.ts:49 imports pack;
      pack.ts:18 imports
      stub/estimateTokens/estimateStubTokens/DEFAULT_LOAD_BUDGET from kb-store:
      cycle present, call-time only. KbPackResult carries no timestamp.
  - by: unknown
    at: "2026-09-15T07:46:42.567Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T07:48:16.382Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:23:45.321Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:24:11.507Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:33:10.902Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:34:52.686Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:37:42.963Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:38:14.265Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:45:16.214Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:48:11.031Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:49:21.862Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:01:44.116Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:38.857Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:29.902Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:28.844Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:13:11.692Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:27.125Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:48.743Z"
    note: "anchor-resolve: 3/3 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/strauss-kb/src/pack.ts
    symbol: pack
    hash: "sha256:8694c11513bd95d8c38ae4bea63249c338d12c5755577a46c041850d620ff929"
    hash_kind: ast
    resolved_at: "2026-09-15T07:43:48.577Z"
    lines: 83
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-store.ts
    symbol: estimateTokens
    hash: "sha256:d62b32a807d348a95b76af6622685f8870fbed70bcadcca4a79559044c49922c"
    hash_kind: ast
    resolved_at: "2026-09-15T07:43:48.590Z"
    lines: 5
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-errors.ts
    symbol: KbPackBudgetExceededError
    hash: "sha256:223dfe79550ea28ed8121c3f96b688739f4d64f20e27b406a01b633c9fc29e10"
    hash_kind: ast
    resolved_at: "2026-09-15T07:43:48.592Z"
    lines: 18
    resolver: tree-sitter
strauss_verify:
  - >-
    pack.spec.ts: over-budget throw carries every excluded id and two runs
    JSON.stringify byte-identical
  - >-
    pack.spec.ts: pack superseded stub deep-equals the kb_load stub for the same
    record
strauss_status: accepted
strauss_materiality: important
strauss_confidence: high
---

## Decision

pack walks the whole component, names every exclusion, and reuses load's stub and token functions via a deliberate module cycle

## Rationale

The BFS does not stop at the hop bound: it walks the full reachable component (the bundle is already in memory) so the excluded list can name every record the hop and node limits cut — a named gap is knowable, a summarized one is not. The over-budget error carries that same list plus recordCount/approxTokens/budgetTokens and emits nothing, because a partial pack is indistinguishable from a complete one. stub(), estimateTokens(), estimateStubTokens(), DEFAULT_LOAD_BUDGET are exported from kb-store.ts and imported by pack.ts, creating an intentional kb-store <-> pack import cycle (all uses are call-time, so both ESM and the tsup CJS build resolve it; dist smoke suites prove it).

## Rejected

Bounding the walk at hops+1 and reporting only counts beyond it — cheaper, but the acceptance criterion is ids, never summaries. And a third shared module (kb-tokens.ts) to break the kb-store/pack cycle — rejected because pack stubs and costs must be bit-identical to kb_load's, and a copy or a new module boundary is one more place for them to drift; the cycle is confined to call-time function imports.

## Impact

excluded can grow as large as the bundle's reachable component minus the pack — acceptable since it is ids only. Anyone refactoring kb-store.ts must keep stub/estimateTokens exported or pack's accounting drifts from load's. Ranking (depth, then decision/constraint/requirement before remaining KB_RECORD_TYPES order, then title, then conceptId) plus a timestamp-free result is what makes two runs byte-identical; adding any run-time timestamp to KbPackResult breaks the determinism contract — the command layer owns the header.

Relates to [decision.kb-edges-fold-related-into-body-link](decision.kb-edges-fold-related-into-body-link.md).
