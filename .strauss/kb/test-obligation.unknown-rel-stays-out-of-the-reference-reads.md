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
verified:
  - by: "agent:security"
    at: "2026-09-17T21:53:21.594Z"
    note: >-
      Holds at HEAD, and it closes the half of my earlier finding that was live:
      outbound.ts skips a link whose rel fails isKbLinkRel, so an unvalidated
      rel no longer moves a target out of doctor's orphaned group and no longer
      reaches supersededButCited's note or reassess's where(), where it printed
      verbatim. Re-ran the crafted bundle from that finding - rel
      not_a_real_rel, and a rel carrying ESC bytes and a newline - through the
      dist built at HEAD: the target stays in orphaned and nothing of the rel is
      echoed. references.spec.ts and sweep.spec.ts pass, 56 tests.
strauss_anchors:
  - file: packages/strauss-kb/src/kb-references/outbound.ts
    symbol: outboundReferences
    hash: "sha256:dc489e146f4ee68b4b8827d5de6b4fa8d897028d3293ca9f758f1d9c60c996b5"
    hash_kind: ast
    resolved_at: "2026-09-17T21:32:23.302Z"
    lines: 13
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
