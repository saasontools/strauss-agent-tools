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
    hash: "sha256:42158e6629ec8b9d5cc820f350337340a2e016d17e9df9ae67ff568fe234351b"
    hash_kind: ast
    resolved_at: "2026-09-17T21:35:08.816Z"
    lines: 8
    resolver: tree-sitter
  - file: packages/strauss-kb/src/validate.ts
    symbol: validateBundle
    hash: "sha256:37fcb846d49f6a7290d64f4327669afd3e50ff59a91b825c34dc6b3cf71cb19c"
    hash_kind: ast
    resolved_at: "2026-09-17T21:35:08.824Z"
    lines: 167
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
