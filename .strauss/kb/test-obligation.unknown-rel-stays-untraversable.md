---
type: test-obligation
title: >-
  A rel outside the closed vocabulary is traversed by nothing and rendered by
  nothing
description: >-
  An uninterpretable claim was moving a target out of doctor's orphaned group,
  and reaching a rendered note as the record spelled it.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-17T19:19:44.949Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-references/outbound.ts
    symbol: outboundReferences
    hash: "sha256:3adae82cd75f5612c9a9826479dcb47361d4231822bdb7f20c41591346664ba2"
    hash_kind: ast
    resolved_at: "2026-09-17T19:20:08.999Z"
    lines: 30
    resolver: tree-sitter
strauss_links:
  - target: risk.unknown-rel-traversed-and-echoed
    rel: satisfies
strauss_status: open
---

## Obligation

`outboundReferences` skips a link whose rel is not in `KB_LINK_RELS`, as `edgeNeighbours`' `typed-link` case already does. So an unknown rel does not rescue a target from `orphaned`, does not raise a stale-reference finding, and never reaches a note or a packet — the only rels a renderer can be handed are the eight the vocabulary names. `kb_validate` is what reports the rel itself, as an error.

## Why it matters

A record can carry any rel a hand-edit or a foreign producer writes. Traversing one acts on a claim no walk can interpret; rendering one puts record-controlled bytes — escapes, newlines — into `doctor`'s output.

## How to verify

`references.spec.ts` — a record whose links carry one unknown rel and one known one yields only the known reference; the unknown rel's target stays in `orphaned`; `validateBundle` reports exactly `link_rel`; and a superseded target reached only by an unknown rel raises no stale-reference finding.

Satisfies [risk.unknown-rel-traversed-and-echoed](risk.unknown-rel-traversed-and-echoed.md).
