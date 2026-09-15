---
type: decision
title: Edge model has no distinct related kind — related edges are body links
description: >-
  compose.ts stores relatedConceptIds as 'Relates to `[<id>](<id>.md)`.' in the
  body, so in stored form a related edge IS a markdown link; a separate
  'related' kind would count the same markdown twice and force every consumer
  (pack, kb_doctor) to dedupe. KbEdgeKind is therefore body-link | supersession
  | anchor | source, and the acceptance criterion 'relatedConceptIds edges are
  reached' is proven by tests that write through composeRecord and reach the
  target via body-link.
tags:
  - kb
  - edges
  - pack
generated:
  by: mcp
  at: "2026-08-26T05:50:55.657Z"
verified:
  - by: "agent:security-reviewer"
    at: "2026-09-14T17:04:22.420Z"
    note: >-
      Security review 2026-09-14 vs main@b0b88be: core claim holds, rationale
      partly stale. No related kind exists; compose.ts:170 still renders
      relatedConceptIds as 'Relates to `[<id>](<id>.md)`.'; body-link case in
      edgeNeighbours unchanged. DISPUTE: rationale says KbEdgeKind is
      body-link|supersession|anchor|source, but KB_EDGE_KINDS
      (kb-edges.ts:30-36) now has five members including typed-link; anchor
      drifted 63->84 lines from the typed-link case. See
      risk.edge-kind-enumeration-stale.
  - by: "agent:author"
    at: "2026-09-15T07:45:34.779Z"
    note: >-
      Re-read kb-edges.ts at 8e0a409: KbEdgeKind gained typed-link (54ee155) but
      still has no related kind; compose.ts still renders relatedConceptIds as
      body links. Decision holds; rationale's member count is stale.
  - by: "agent:author"
    at: "2026-09-15T07:45:57.380Z"
    note: "anchor-resolve: 2/2 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T07:46:41.932Z"
    note: "anchor-resolve: 2/2 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T07:48:15.814Z"
    note: "anchor-resolve: 2/2 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:23:44.602Z"
    note: "anchor-resolve: 2/2 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:24:10.278Z"
    note: "anchor-resolve: 2/2 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:33:09.998Z"
    note: "anchor-resolve: 2/2 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:34:51.624Z"
    note: "anchor-resolve: 2/2 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:37:42.071Z"
    note: "anchor-resolve: 2/2 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:38:13.366Z"
    note: "anchor-resolve: 2/2 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:45:15.350Z"
    note: "anchor-resolve: 2/2 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:48:10.232Z"
    note: "anchor-resolve: 2/2 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:49:20.909Z"
    note: "anchor-resolve: 2/2 anchors match (regex + tree-sitter resolver)"
strauss_anchors:
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: KB_EDGE_KINDS
    hash: "sha256:0648248fcc514e5b045b23b469c35de373e01569dcba06453f52b1d99505a63c"
    hash_kind: raw
    resolved_at: "2026-09-15T07:43:48.074Z"
    lines: 7
    resolver: regex
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: edgeNeighbours
    hash: "sha256:c4e1f59e2d0ae58bff9fd5b79be75053975708ccc840709ab930594fbe33fa94"
    hash_kind: ast
    resolved_at: "2026-09-15T07:45:34.620Z"
    lines: 84
    resolver: tree-sitter
strauss_verify:
  - >-
    a record written via composeRecord relatedConceptIds is reached by the
    body-link edge in kb-edges.spec.ts
strauss_status: accepted
strauss_materiality: important
strauss_confidence: high
---

## Decision

Edge model has no distinct related kind — related edges are body links

## Rationale

compose.ts stores relatedConceptIds as 'Relates to `[<id>](<id>.md)`.' in the body, so in stored form a related edge IS a markdown link; a separate 'related' kind would count the same markdown twice and force every consumer (pack, kb_doctor) to dedupe. KbEdgeKind is therefore body-link | supersession | anchor | source, and the acceptance criterion 'relatedConceptIds edges are reached' is proven by tests that write through composeRecord and reach the target via body-link.

## Rejected

A five-member enum with 'related' parsed from the 'Relates to' prose prefix. Rejected: the prefix is a rendering detail of one composer, foreign producers are legal per OKF, and any hand-written link to the same id would then be classified differently from a composed one with no behavioural difference.

## Impact

Anyone adding an edge consumer (SAA-587 kb_doctor) gets related-links for free through body-link and must not re-add a related kind. Body-link edges are outbound-only and skip missing targets silently — broken links are legal per compose.ts doctrine, never an error.
