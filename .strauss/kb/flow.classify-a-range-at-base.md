---
type: flow
title: classify --git lowers a class only on evidence read at the range's base
description: >-
  Where each input is read from is what keeps a class out of reach of the change
  it classifies.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:00:56.010Z"
verified:
  - by: unknown
    at: "2026-09-15T16:01:45.832Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/read.ts
    symbol: classifyFiles
    hash: "sha256:8f3ec93d579719f3cec76bbc91a2ed9a95649f6145ef9d31f762cb2b78fc6377"
    hash_kind: ast
    resolved_at: "2026-09-15T16:01:31.963Z"
    lines: 27
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/classify.ts
    symbol: classifyDiff
    hash: "sha256:1bc230be8ea484a13f11d3efac1bdcab10904795605392b88af821958185b23c"
    hash_kind: ast
    resolved_at: "2026-09-15T16:01:31.969Z"
    lines: 6
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/classify.ts
    symbol: renderClassify
    hash: "sha256:719e6410684462020db31bd58f2521e4f011afb0f982c95eb03683df05d94367"
    hash_kind: ast
    resolved_at: "2026-09-15T16:01:31.974Z"
    lines: 13
    resolver: tree-sitter
  - file: packages/strauss-kb/src/classify/classify.ts
    symbol: classifyDiff
    hash: "sha256:73bc01a95b3ccb7748c4e657df4812c87095671e15778b5bc92784a4f9415587"
    hash_kind: ast
    resolved_at: "2026-09-15T16:01:31.977Z"
    lines: 16
    resolver: tree-sitter
strauss_links:
  - target: requirement.classify-attributes-read-at-base
    rel: satisfies
strauss_status: accepted
strauss_supersedes:
  - flow.classify-a-range
---

## Flow

A range becomes one class per file, with what declared it.

## Trigger

strauss-kb classify --git <base>..<head> (or --stdin with --base), kb_classify with base.

## Steps

readRangeDiff → parseUnifiedDiff(keepEmpty, withLines) → base is --base or the range's left half → resolveSymbolRanges for the review:* facts → classifyFiles: toplevel, then in parallel the bounded banner reads (no symlink followed, regular files only), one check-attr --source=<base> over every path, and one cat-file --batch over the root's .gitattributes and those above changed files → kbDeclared → code-diff's classifyDiff → render, notes last.

## Failure modes

No base, a rev git cannot read, or git before 2.40: only strauss-class=source applies, the default table is off, and a note names why. A failed declared-classes probe: the table is off, with a note. Not a repository: as no base. A symlinked or non-regular file: the diff's added lines stand in for its banner.

Satisfies [requirement.classify-attributes-read-at-base](requirement.classify-attributes-read-at-base.md).
