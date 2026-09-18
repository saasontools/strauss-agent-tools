---
type: risk
title: A markdown link inside a fenced code block counts as a citation
description: >-
  A record that documents the citation format pins records and raises warnings
  about ids that were never meant to exist.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-17T19:30:55.246Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/body-citations.ts
    symbol: bodyCitations
    hash: "sha256:bee7a9a3e82dd3b568f239f5d1e121202ff79b08a8158810cab3c054687927a6"
    hash_kind: ast
    resolved_at: "2026-09-18T15:52:58.610Z"
    lines: 36
    resolver: tree-sitter
  - file: packages/strauss-kb/src/validate.ts
    symbol: validateBundle
    hash: "sha256:955d07097dda170872a1d2f9656741a7de100867b0077b904f9ea154f4c2a3fd"
    hash_kind: ast
    resolved_at: "2026-09-18T15:52:58.621Z"
    lines: 176
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/sweep.ts
    symbol: holderIndex
    hash: "sha256:d2c24ba5da81eb30c820a41af845b5b13b35e77a7cd59a39114345dd175c4d8d"
    hash_kind: ast
    resolved_at: "2026-09-17T21:35:08.828Z"
    lines: 19
    resolver: tree-sitter
strauss_links:
  - target: decision.edge-consumers-read-body-and-frontmatter
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

bodyLinkTargets runs one regex over record.body with no fence, inline-code or image awareness, so `](<concept-id>.md)` inside a ```markdown block is a reference. Harmless while only edgeNeighbours read it; this change gives it two new consumers that act on it. Reproduced against the built CLI: a record whose only link is the example `Relates to [decision.example-target](decision.example-target.md).` inside a fenced block makes validate report `body_link: body cites decision.example-target, which is not in the bundle`; and a resolved, review-tagged risk quoted only inside a fenced block in a surviving decision comes back from `sweep --tag review --terminal --dry-run` as `kept risk.spent — held by decision.quoter`.

## Why it matters

Both new consumers exist to be believed. validate's warning names an id no one can add, so the only repair is to stop writing the example; sweep's hold is permanent and invisible to the fixpoint, which is risk.sweep-pinned-by-a-prose-citation reached by a route no author intended. A base whose own house-style record explains how to cite will warn about itself.

## Mitigation

None in the diff, and no record states the case: decision.edge-consumers-read-body-and-frontmatter says the body half is one regex and says nothing about fenced code. The repair is to strip fenced and inline code from the body before matching, in bodyLinkTargets, where every consumer inherits it.

## Verification

A record whose only `](id.md)` sits inside a fenced block: validate reports no body_link, and sweep does not list the quoted record under skipped.

Informs [decision.edge-consumers-read-body-and-frontmatter](decision.edge-consumers-read-body-and-frontmatter.md).
