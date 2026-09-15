---
type: risk
title: >-
  decision.kb-edges-fold-related-into-body-link enumerates four edge kinds; code
  has five
description: >-
  A reader trusting the record's list will not know typed-link edges exist and
  may build an edge consumer that walks body links only.
tags:
  - review
  - kb-drift
generated:
  by: "agent:security-reviewer"
  at: "2026-09-14T17:04:22.580Z"
verified:
  - by: unknown
    at: "2026-09-15T07:46:42.929Z"
    note: "anchor-resolve: 1/1 anchors match (regex resolver)"
  - by: unknown
    at: "2026-09-15T07:48:16.804Z"
    note: "anchor-resolve: 1/1 anchors match (regex resolver)"
  - by: unknown
    at: "2026-09-15T15:23:45.818Z"
    note: "anchor-resolve: 1/1 anchors match (regex resolver)"
  - by: unknown
    at: "2026-09-15T15:24:12.193Z"
    note: "anchor-resolve: 1/1 anchors match (regex resolver)"
  - by: unknown
    at: "2026-09-15T15:33:12.982Z"
    note: "anchor-resolve: 1/1 anchors match (regex resolver)"
strauss_anchors:
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: KB_EDGE_KINDS
    hash: "sha256:0648248fcc514e5b045b23b469c35de373e01569dcba06453f52b1d99505a63c"
    hash_kind: raw
    resolved_at: "2026-09-15T07:43:48.885Z"
    lines: 7
    resolver: regex
strauss_links:
  - target: decision.kb-edges-fold-related-into-body-link
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

The decision's Rationale states KbEdgeKind is body-link | supersession | anchor | source. KB_EDGE_KINDS in packages/strauss-kb/src/kb-edges.ts now also contains typed-link, added after the record was written, and edgeNeighbours has a typed-link case; the record's anchor on edgeNeighbours is drifted (63 to 84 lines).

## Why it matters

The decision's Impact tells consumers they get related links for free through body-link. That still holds, but a consumer written from the record's enumeration would omit typed-link traversal and silently miss depends_on/constrains/blocks edges.

## Mitigation

Author supersedes the decision with one that lists the five kinds and restates that related edges are body links, then rebaselines the edgeNeighbours anchor.

## Verification

kb_doctor reports no drift on the superseding record; KB_EDGE_KINDS length equals the kinds the record names.

Relates to [decision.kb-edges-fold-related-into-body-link](decision.kb-edges-fold-related-into-body-link.md).

Informs [decision.kb-edges-fold-related-into-body-link](decision.kb-edges-fold-related-into-body-link.md).
