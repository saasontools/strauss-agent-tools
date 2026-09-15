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
  - by: unknown
    at: "2026-09-15T16:02:40.279Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:31.569Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:29.984Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
  - by: "agent:security"
    at: "2026-09-15T16:11:25.526Z"
    note: >-
      Read read.ts classifyFiles, attributes.ts, check-attr.ts at 8f85584: steps
      and failure modes match; every git call is argv via runGit with the rev
      shape-checked.
  - by: "agent:correctness"
    at: "2026-09-15T16:12:10.938Z"
    note: >-
      At 8f85584: read commands/classify.ts, which pins --base or parseRange's
      left half. classifyFiles calls toplevel, then Promise.all over
      mapLimit(header) and readAttributes, which runs checkAttr and
      declaresClasses in parallel. Then kbDeclared, classifyDiff, and
      renderClassify with notes last.
  - by: "agent:performance"
    at: "2026-09-15T16:12:50.122Z"
    note: >-
      Order at 8f85584: store.list, resolveSymbolRanges, then classifyFiles:
      toplevel, then banner reads (16 at once), check-attr and cat-file --batch
      under one Promise.all. Warm classify --git c5e9a66..HEAD: 357-376 ms.
  - by: unknown
    at: "2026-09-15T16:13:12.775Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:28.249Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:49.947Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:36.113Z"
    note: "anchor-resolve: 4/4 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:45.188Z"
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
