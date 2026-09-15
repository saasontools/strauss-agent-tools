---
type: open-question
title: >-
  Does classify --git lower a class only on evidence read at the base, as
  flow.classify-a-range-at-base says?
description: The flow's title is the guarantee a reviewer relies on.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-15T16:33:20.241Z"
verified: []
strauss_anchors:
  - file: packages/code-diff/src/classify/read.ts
    symbol: classifyFiles
    hash: "sha256:8f3ec93d579719f3cec76bbc91a2ed9a95649f6145ef9d31f762cb2b78fc6377"
    hash_kind: ast
    resolved_at: "2026-09-15T16:35:45.823Z"
    lines: 27
    resolver: tree-sitter
strauss_links:
  - target: flow.classify-a-range-at-base
    rel: informs
  - target: risk.branch-banner-lowers-its-own-file
    rel: related_to
strauss_status: open
strauss_owner: "agent:author"
---

## Question

The title says base only, but the steps read banners from the working tree, and kbDeclared admits review:* facts the branch adds. Both lower: a head banner gives generated with base main~1 pinned. Which evidence is meant to be base-only?

## Why it matters

SAA-813 moves the gate onto this classifier; a reader of the flow expects no branch-side lowering.

## Default assumption

Only attributes are read at the base; banners and review:* facts come from the branch, and the title overstates the guarantee.

Informs [flow.classify-a-range-at-base](flow.classify-a-range-at-base.md).

Relates to [risk.branch-banner-lowers-its-own-file](risk.branch-banner-lowers-its-own-file.md).
