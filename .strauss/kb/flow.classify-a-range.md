---
type: flow
title: >-
  classify --git reads attributes at the range's base, banners at head, and
  review:* facts from the base
description: >-
  Where each input is read from is what makes a class unforgeable by the change
  it classifies.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T15:32:01.766Z"
verified:
  - by: "agent:security"
    at: "2026-09-15T15:44:55.506Z"
    note: >-
      Read commands/classify.ts (base is --base or parseRange's left half),
      code-diff classify/read.ts classifyFiles and attributes.ts
      readAttributes/declaresClasses; failure modes match the code, including
      the working-tree fallback with a note.
  - by: "agent:correctness"
    at: "2026-09-15T15:46:26.028Z"
    note: >-
      read.ts: toplevel, then check-attr, git grep and bounded header reads in
      parallel, with notes when unpinned; commands/classify.ts defaults base to
      the range's left half.
  - by: "agent:performance"
    at: "2026-09-15T15:47:10.553Z"
    note: >-
      Read classifyFiles and readAttributes: toplevel, then Promise.all of
      16-wide header reads and readAttributes, which runs checkAttr (one stdin
      batch) and declaresClasses concurrently. Failure modes omit a timed-out
      grep: risk.classify-base-grep-walks-whole-tree.
strauss_anchors:
  - file: packages/code-diff/src/classify/read.ts
    symbol: classifyFiles
    hash: "sha256:8b44adb4e92bf9f4dc931dc4b8ef19a0d9130b99f19962a9b8189d19a1c5cf4a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:40.754Z"
    lines: 38
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/classify.ts
    symbol: classifyDiff
    hash: "sha256:1bc230be8ea484a13f11d3efac1bdcab10904795605392b88af821958185b23c"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:38.807Z"
    lines: 6
    resolver: tree-sitter
  - file: packages/strauss-kb/src/commands/classify.ts
    symbol: renderClassify
    hash: "sha256:719e6410684462020db31bd58f2521e4f011afb0f982c95eb03683df05d94367"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:38.810Z"
    lines: 13
    resolver: tree-sitter
  - file: packages/strauss-kb/src/classify/classify.ts
    symbol: classifyDiff
    hash: "sha256:73bc01a95b3ccb7748c4e657df4812c87095671e15778b5bc92784a4f9415587"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:38.813Z"
    lines: 16
    resolver: tree-sitter
strauss_links:
  - target: requirement.classify-attributes-read-at-base
    rel: satisfies
strauss_status: superseded
strauss_superseded_by: flow.classify-a-range-at-base
---

## Flow

A range becomes one class per file, with what declared it.

## Trigger

strauss-kb classify --git <base>..<head> (or --stdin with --base), kb_classify with base.

## Steps

readRangeDiff → parseUnifiedDiff(keepEmpty, withLines) → base is --base or the range's left half → resolveSymbolRanges for the review:* facts → classifyFiles: toplevel, then in parallel one check-attr --source=<base> over every path, one git grep over .gitattributes at the base, bounded banner reads from the working tree → kbDeclared → code-diff's classifyDiff → render, notes last.

## Failure modes

git before 2.40 or a base check-attr cannot read: the working tree answers and a note says so. An unsafe base: no attribute is read and nothing is declared. Not a repository: the default table applies. An unreadable file: the diff's added lines stand in for its banner.

Satisfies [requirement.classify-attributes-read-at-base](requirement.classify-attributes-read-at-base.md).
