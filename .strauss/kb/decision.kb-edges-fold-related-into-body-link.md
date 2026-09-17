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
strauss_anchors:
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: KB_EDGE_KINDS
    hash: "sha256:95950bbd40c908b0d60a2d9156b6a95cef48e6b384ca27d0b36b674fb5f893a6"
    hash_kind: raw
    resolved_at: "2026-09-17T21:35:06.654Z"
    lines: 6
    resolver: regex
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: edgeNeighbours
    hash: "sha256:1c2622d68ef5dddf5a64279db4791f922eed18f38cf5984c0cd5037d6402ffd1"
    hash_kind: ast
    resolved_at: "2026-09-17T21:35:06.659Z"
    lines: 70
    resolver: tree-sitter
strauss_verify:
  - >-
    a record written via composeRecord relatedConceptIds is reached by the
    body-link edge in kb-edges.spec.ts
strauss_status: superseded
strauss_superseded_by: decision.edge-consumers-read-body-and-frontmatter
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
