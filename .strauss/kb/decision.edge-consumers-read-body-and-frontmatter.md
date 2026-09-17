---
type: decision
title: >-
  Five edge kinds; every edge consumer reads both body citations and
  strauss_links
description: >-
  doctor, reassess, sweep and validate each read one half of the edge graph, so
  a frontmatter-only citation escapes a staleness warning and a body-only
  citation gets its target deleted.
sources:
  - id: SAA-821
    resource: >-
      https://linear.app/saason/issue/SAA-821/every-edge-consumer-reads-both-body-citations-and-frontmatter-links
    title: Every edge consumer reads both body citations and frontmatter links
generated:
  by: mcp
  at: "2026-09-17T18:32:23.034Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: KB_EDGE_KINDS
    hash: "sha256:0648248fcc514e5b045b23b469c35de373e01569dcba06453f52b1d99505a63c"
    hash_kind: raw
    resolved_at: "2026-09-17T18:53:51.266Z"
    lines: 7
    resolver: regex
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: bodyLinkTargets
    hash: "sha256:718597d02716b5d78485eec3a44c51a3bb6d1edd0d91280184a9fc8ca331d6cd"
    hash_kind: ast
    resolved_at: "2026-09-17T18:53:51.266Z"
    lines: 8
    resolver: tree-sitter
strauss_links:
  - target: risk.edge-kind-enumeration-stale
    rel: informs
strauss_status: accepted
strauss_supersedes:
  - decision.kb-edges-fold-related-into-body-link
---

## Decision

KbEdgeKind is body-link | typed-link | supersession | anchor | source — five kinds. Related edges remain body links: compose.ts renders relatedConceptIds as `Relates to [id](id.md).`, so in stored form a related edge IS a body link and a sixth `related` kind would count the same markdown twice.

Every consumer of the edge graph reads both halves — a record's markdown body citations and its `strauss_links` frontmatter. That is doctor's `superseded-but-cited`, single-record `reassess`, `sweep`'s hold guard, and `validate`. One body-citation parser, exported from kb-edges.ts, serves all of them.

A missing target is still not an error. It is a warning in `validate` and a reason to keep in `sweep`; nothing refuses a write or fails a build over it.

## Rationale

The superseded decision said broken body links are legal per compose.ts doctrine, never an error, and that outbound walks skip missing targets silently. That reading is what let `sweep` delete a record cited only from a surviving record's body: measured on the SAA-810 PR base, 27 deletions left 5 dangling body links across 3 surviving decisions, and `validate` returned []. `--dry-run` gave no protection — same index, same answer. Silence about a missing target is right for a walk, which has nothing to say about a record it cannot reach; it is wrong for a consumer that is about to delete one or to certify that nothing is broken.

The two directions are asymmetric on purpose. Reading both halves makes `sweep` keep more and `validate` and `doctor` say more; neither makes anything fail that passed before.

The superseded record also enumerated four kinds; `typed-link` was added afterwards, which is risk.edge-kind-enumeration-stale.

## Rejected

Leaving `sweep` as the doctrine's correct consumer and treating the review plugin's `store.dangling-link` as the defect. Rejected: the check is the only thing that caught real data loss, and a doctrine whose consequence is deleting cited records is the thing to replace.

Also rejected: making a dangling body link a `validate` error. A record is routinely written before the one it points at, so an error would fail bases that are merely mid-write.

## Impact

Anyone adding an edge consumer reads both halves or states why one is enough. `bodyLinkTargets` in kb-edges.ts is the single body-citation parser — a second regex over the same markdown is the defect this decision exists to prevent. `impact` semantics are untouched: contextual `related_to` stays out of causal traversal.

Informs [risk.edge-kind-enumeration-stale](risk.edge-kind-enumeration-stale.md).

[^SAA-821]: Every edge consumer reads both body citations and frontmatter links
