---
type: flow
title: >-
  classify reads attributes at the range's base; banners and review:* facts are
  the branch's declarations
description: Where each input is read from decides what the change it classifies can reach.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:46:49.053Z"
strauss_anchors:
  - file: packages/code-diff/src/classify/read.ts
    symbol: classifyFiles
    hash: "sha256:8b44adb4e92bf9f4dc931dc4b8ef19a0d9130b99f19962a9b8189d19a1c5cf4a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:29.373Z"
    lines: 38
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/classify.ts
    symbol: classifyDiff
    hash: "sha256:1bc230be8ea484a13f11d3efac1bdcab10904795605392b88af821958185b23c"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:29.375Z"
    lines: 6
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/classify.ts
    symbol: renderClassify
    hash: "sha256:719e6410684462020db31bd58f2521e4f011afb0f982c95eb03683df05d94367"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:29.378Z"
    lines: 13
    resolver: tree-sitter
  - file: packages/strauss-kb/src/classify/classify.ts
    symbol: classifyDiff
    hash: "sha256:73bc01a95b3ccb7748c4e657df4812c87095671e15778b5bc92784a4f9415587"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:29.379Z"
    lines: 16
    resolver: tree-sitter
strauss_links:
  - target: requirement.classify-attributes-read-at-base
    rel: satisfies
strauss_status: accepted
strauss_supersedes:
  - flow.classify-a-range-at-base
---

## Flow

A range becomes one class per file, with what declared it.

## Trigger

strauss-kb classify --git <base>..<head> (or --stdin with --base), kb_classify with base.

## Steps

readRangeDiff → parseUnifiedDiff(keepEmpty, withLines) → base is --base or the range's left half → resolveSymbolRanges for the review:* facts → classifyFiles: toplevel, then in parallel the bounded banner reads (no symlink followed, regular files only) and readAttributes: the clone's info/attributes checked first, then one check-attr --source=<base> with no global or system file, and one cat-file --batch over the root's .gitattributes and those above changed files → a base strauss-class=source, then kbDeclared, then the other attributes, the banner, the table → render, notes last.

## Failure modes

An attribute in info/attributes: every file source, check-attr not spawned. No base, a rev git cannot read, or git before 2.40: only strauss-class=source applies and the table is off. A failed probe: the table is off. A symlinked or non-regular file: the diff's added lines stand in for its banner. Each case adds a note; an unsafe base is never echoed.

Satisfies [requirement.classify-attributes-read-at-base](requirement.classify-attributes-read-at-base.md).
