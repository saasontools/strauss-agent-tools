---
type: test-obligation
title: >-
  An unknown rel is skipped by the reference and edge reads, and reported by the
  inbound ones
description: >-
  The superseded obligation claimed the whole package; a later reader would have
  cited it when adding a consumer over inboundIndex, which gives no such
  guarantee.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-17T19:36:19.284Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-references/outbound.ts
    symbol: outboundReferences
    hash: "sha256:3adae82cd75f5612c9a9826479dcb47361d4231822bdb7f20c41591346664ba2"
    hash_kind: ast
    resolved_at: "2026-09-17T19:38:26.651Z"
    lines: 30
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-links/inbound.ts
    symbol: inboundIndex
    hash: "sha256:0ba710f6038189d68a1455280d1fd15eb5239276efd4ad8f41fe23a9a8a59ff1"
    hash_kind: ast
    resolved_at: "2026-09-17T19:38:26.654Z"
    lines: 25
    resolver: tree-sitter
strauss_links:
  - target: risk.unknown-rel-traversed-and-echoed
    rel: satisfies
  - target: open-question.is-an-unknown-rel-really-untraversable-everywhere
    rel: related_to
strauss_status: open
strauss_supersedes:
  - test-obligation.unknown-rel-stays-untraversable
---

## Obligation

`outboundReferences` and `edgeNeighbours`' `typed-link` case skip a link whose rel is not in `KB_LINK_RELS`. So an unknown rel does not rescue a target from `doctor`'s `orphaned`, raises no stale-reference finding, and never reaches a `doctor` note or a `reassess` packet.

`inboundIndex` filters no rel, deliberately: `kb_backlinks` returns a stored rel as written so the record carrying it can be found, and `sweep` holds a target on one because holding is the conservative direction. `kb_validate` reports the rel itself, as an error.

## Why it matters

Traversing an uninterpretable claim acts on something no walk can read. Rendering one puts record-controlled bytes into output. The two readers that skip and the two that report are a scope, not an accident, and a consumer added over the wrong one inherits neither guarantee.

## How to verify

`references.spec.ts` — a record whose links carry one unknown rel and one known one yields only the known reference; the unknown rel's target stays in `orphaned`; `validateBundle` reports exactly `link_rel`; a superseded target reached only by an unknown rel raises no stale-reference finding. For the other half, `backlinks <target>` on such a link still returns the rel verbatim and `sweep --dry-run` still reports the target as held — both intended, neither covered by the claim above.

Satisfies [risk.unknown-rel-traversed-and-echoed](risk.unknown-rel-traversed-and-echoed.md).

Relates to [open-question.is-an-unknown-rel-really-untraversable-everywhere](open-question.is-an-unknown-rel-really-untraversable-everywhere.md).
