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
verified:
  - by: "agent:author"
    at: "2026-09-15T16:48:01.514Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:49:46.779Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/read.ts
    symbol: classifyFiles
    hash: "sha256:8b44adb4e92bf9f4dc931dc4b8ef19a0d9130b99f19962a9b8189d19a1c5cf4a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:40.972Z"
    lines: 38
    resolver: tree-sitter
strauss_links:
  - target: flow.classify-a-range-at-base
    rel: informs
  - target: risk.branch-banner-lowers-its-own-file
    rel: related_to
strauss_status: resolved
strauss_answered:
  by: mcp
  at: "2026-09-15T16:46:35.814Z"
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

## Answer

Only the attributes are base-only. A generator banner and a review:* fact are the branch's own declarations, in the diff the reviewer reads, as SAA-810's precedence lists them; a base strauss-class=source outranks both, and a local attributes file turns both off. decision.branch-banner-is-a-declaration records the banner; flow.classify-reads-attributes-at-base supersedes the flow whose title said otherwise.
