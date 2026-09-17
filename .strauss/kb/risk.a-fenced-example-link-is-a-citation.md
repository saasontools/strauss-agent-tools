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
  - file: packages/strauss-kb/src/kb-edges.ts
    symbol: bodyLinkTargets
    hash: "sha256:fb2fe27fae159f26a5412004050446bf10f0cd24e6f0930bbb5aa2688848adff"
    hash_kind: ast
    resolved_at: "2026-09-17T19:38:27.942Z"
    lines: 8
    resolver: tree-sitter
  - file: packages/strauss-kb/src/validate.ts
    symbol: validateBundle
    hash: "sha256:63c69212ed7ce08687eadb436901301870ba4ffbada9656be72a1fb008d7d8e4"
    hash_kind: ast
    resolved_at: "2026-09-17T19:38:27.951Z"
    lines: 165
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/sweep.ts
    symbol: holderIndex
    hash: "sha256:c460bf5de2dcf824331c6de809cdd860e6fa8d054adaf7303d3174d7cb1de54f"
    hash_kind: ast
    resolved_at: "2026-09-17T19:38:27.953Z"
    lines: 21
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
