---
type: open-question
title: >-
  Is an unknown rel traversed by nothing and rendered by nothing, as
  test-obligation.unknown-rel-stays-untraversable says?
description: >-
  The obligation states a package-wide invariant, and two consumers outside
  kb-references do not hold it.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T19:31:24.157Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/kb-links/inbound.ts
    symbol: inboundIndex
    hash: "sha256:0ba710f6038189d68a1455280d1fd15eb5239276efd4ad8f41fe23a9a8a59ff1"
    hash_kind: ast
    resolved_at: "2026-09-17T19:38:30.340Z"
    lines: 25
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/sweep.ts
    symbol: holderIndex
    hash: "sha256:d2c24ba5da81eb30c820a41af845b5b13b35e77a7cd59a39114345dd175c4d8d"
    hash_kind: ast
    resolved_at: "2026-09-17T21:35:08.609Z"
    lines: 19
    resolver: tree-sitter
  - file: packages/strauss-kb/src/kb-references/outbound.ts
    symbol: outboundReferences
    hash: "sha256:dc489e146f4ee68b4b8827d5de6b4fa8d897028d3293ca9f758f1d9c60c996b5"
    hash_kind: ast
    resolved_at: "2026-09-17T21:35:08.610Z"
    lines: 13
    resolver: tree-sitter
strauss_links:
  - target: test-obligation.unknown-rel-stays-untraversable
    rel: informs
  - target: risk.unknown-rel-traversed-and-echoed
    rel: informs
strauss_status: resolved
strauss_answered:
  by: mcp
  at: "2026-09-17T19:38:18.061Z"
strauss_owner: mcp
---

## Question

The obligation says an unknown rel `never reaches a note or a packet — the only rels a renderer can be handed are the eight the vocabulary names`, and outbound.ts's comment says it is `skipped, as every other walk skips it`. Both are true of outboundReferences and of edgeNeighbours, and neither is true of inboundIndex, which filters no rel. Reproduced against the built CLI on a two-record bundle where `decision.keeper` links at `decision.keeper -> risk.doomed` with `rel: not_a_real_rel`: `sweep --tag review --terminal --dry-run` answers `kept risk.doomed — held by decision.keeper`, and `backlinks risk.doomed` returns `"rel": "not_a_real_rel"` verbatim. validate calls the same link a link_rel error. doctor's orphaned group is correct — the target stays orphaned, which is the half the obligation verifies.

## Why it matters

The obligation is what a later reader will cite when adding a consumer, and it will be read as a guarantee the package does not give. Of the two gaps, sweep's is a traversal — an uninterpretable claim keeps a terminal record alive — and backlinks' is a render, the sink risk.unknown-rel-traversed-and-echoed was written about, still unbounded. Both are older than this range; the claim is what this range added.

## Default assumption

The invariant holds only for the reference and edge readers. Until inboundIndex filters on isKbLinkRel, treat `traversed by nothing and rendered by nothing` as scoped to kb-references/ and kb-edges.ts, and do not rely on it when adding a consumer over inboundIndex.

Informs [test-obligation.unknown-rel-stays-untraversable](test-obligation.unknown-rel-stays-untraversable.md).

Informs [risk.unknown-rel-traversed-and-echoed](risk.unknown-rel-traversed-and-echoed.md).

## Answer

No, and the claim was mine to narrow. The invariant holds for the reference and edge readers only: `outboundReferences` and `edgeNeighbours` skip a rel outside `KB_LINK_RELS`. `inboundIndex` filters no rel and is not going to, so `kb_backlinks` returns a stored rel verbatim and `sweep` holds a target on one.

Both are deliberate and neither is changed here. `kb_backlinks` exists to find the record carrying a bad rel, which is the one answer that must not drop it — `KbInboundEdge.rel` already says so. `sweep` holding on an unknown rel is the conservative direction, and making it traverse `isKbLinkRel` would delete a record held by a pointer nobody could interpret, which is the failure SAA-821 exists to close.

So the over-claiming record is superseded by test-obligation.unknown-rel-stays-out-of-the-reference-reads, which names the two readers that skip and the two that report, and says what a consumer over `inboundIndex` does not inherit. The unbounded render in `kb_backlinks` stays open under risk.unknown-rel-traversed-and-echoed; the `doctor` and `reassess` sinks it named are closed.
