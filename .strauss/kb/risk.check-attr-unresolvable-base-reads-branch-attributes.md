---
type: risk
title: >-
  An explicit base git cannot resolve lets the branch's own .gitattributes
  classify its files
description: >-
  Breaks the read-at-base guarantee for classify --stdin --base and kb_classify
  base.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-15T15:46:22.995Z"
verified:
  - by: unknown
    at: "2026-09-15T15:49:24.895Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:41.543Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:33.116Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:31.105Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:13:14.022Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:51.358Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:37.347Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:46.881Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:48:02.951Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/git-guard/src/check-attr.ts
    symbol: checkAttr
    hash: "sha256:4fe0d8345781772daaaa95bf1248cee1cd5c7f0382d498c45c3536ac85ee0b3b"
    hash_kind: ast
    resolved_at: "2026-09-15T16:49:57.793Z"
    lines: 66
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/read.ts
    symbol: classifyFiles
    hash: "sha256:8b44adb4e92bf9f4dc931dc4b8ef19a0d9130b99f19962a9b8189d19a1c5cf4a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:47:41.188Z"
    lines: 38
    resolver: tree-sitter
strauss_links:
  - target: requirement.classify-attributes-read-at-base
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

checkAttr falls back to the working tree on any `failed` run of `check-attr --source=<base>`, not only on git before 2.40: git 2.50 exits 128 for `--source=nosuchrev` (not a valid tree-ish). Through classifyFiles, on a repo whose head commit adds `src/a.ts linguist-generated`: base=<real sha> gives `source`, base=nosuchrev gives `generated (attribute linguist-generated)`, and the note blames the git version.

## Why it matters

`classify --stdin --base <rev>` and `kb_classify` with a base a shallow clone lacks, or a typo, classify with the branch's own attributes: a change marks its own file generated and routes it to skim. `--git` is not affected, because readRangeDiff refuses a base it cannot read first.

## Mitigation

None in the diff. Fall back only when git rejects the `--source` option, or check `<base>^{tree}` first and read no attributes when it does not resolve.

## Verification

A classifyFiles or attributes.spec case with an unresolvable base expects no working-tree attribute and a note naming the base.

Informs [requirement.classify-attributes-read-at-base](requirement.classify-attributes-read-at-base.md).
