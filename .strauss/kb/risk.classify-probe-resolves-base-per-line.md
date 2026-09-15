---
type: risk
title: >-
  The declared-classes probe resolves the base once per directory: 1.1 s at 10k
  directories, 4x a tree sha
description: >-
  classify --git runs on every Stop under the hook's 10 s per-call timeout, and
  on a wide change the probe is the slowest leg of classifyFiles' parallel
  reads.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-15T16:12:49.323Z"
verified:
  - by: unknown
    at: "2026-09-15T16:22:52.188Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:37.945Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:47.720Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:47:32.602Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:48:03.790Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:49:49.152Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: declaresClasses
    hash: "sha256:bbb45d4fdc66deaf5533bb02bff348b0d0c9a28d114683c4f17e2f7d3a07b5ff"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:38.305Z"
    lines: 37
    resolver: tree-sitter
strauss_links:
  - target: decision.default-table-only-on-a-read-undeclared-base
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

declaresClasses writes `${base}:${dir}/.gitattributes` per line to one `cat-file --batch`, so git resolves `base` again on every line. Measured (Apple git 2.50.1): a synthetic 10k-file change over 10 101 directories, probe 1 143 ms by rev and 268 ms by `<base>^{tree}` resolved once; check-attr over the same paths 327 ms; `classify --git` end to end 1.7–2.3 s. In this repository's store, 50k lines: 8.8 s by rev, 4.7 s by commit sha, 2.4 s by tree sha. This range's 42 lines cost 28.5 ms.

## Why it matters

readRangeDiff's 8 MB cap admits roughly 40k one-line files (10k were 1.9 MB), where the probe alone nears the hook's 10 s classify timeout and the hook falls back to builtin. Past runGit's 10 s it degrades to probeFailed and a note, not a hang.

## Mitigation

None in the diff. Resolve `rev-parse --verify <base>^{tree}` once, beside toplevel, and prefix each batch line with the tree id.

## Verification

The 10k-directory timing above, repeated after the change.

Informs [decision.default-table-only-on-a-read-undeclared-base](decision.default-table-only-on-a-read-undeclared-base.md).
