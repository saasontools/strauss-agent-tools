---
type: risk
title: >-
  A banner the branch adds lowers its own file to generated; a `do not edit`
  comment is enough
description: "The gate skips uncovered for generated, so the change needs no why."
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-15T16:33:20.091Z"
verified:
  - by: "agent:author"
    at: "2026-09-15T16:47:31.028Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:48:02.322Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:49:47.627Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/classify.ts
    symbol: classifyFile
    hash: "sha256:29ba8b9893a3bdadc24ad544909a0adba224eeb79f938fc837a81a77ff311a9c"
    hash_kind: ast
    resolved_at: "2026-09-15T16:35:46.442Z"
    lines: 29
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/rules.ts
    symbol: generatedMarker
    hash: "sha256:75e4d77330f03bd6642689c28e0579acdd2210914eb02a5d564c959ddafa482a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:35:46.446Z"
    lines: 7
    resolver: tree-sitter
strauss_links:
  - target: requirement.classify-attributes-read-at-base
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

classifyFile takes banner(file) after the base attribute and before the table, and header() reads the working tree the branch writes. Without a base strauss-class=source pin, a comment matching GENERATED_MARKERS in the first 20 lines makes the file generated; the `do not edit` marker matches ordinary comments. Reproduced: base src/a.ts `export const a = 1;`, head prepends `// @generated do not edit` and adds a function; classifyFiles with base main~1 gives generated (generated-header @generated). Present before this range; code-diff carries it under requirement.classify-attributes-read-at-base, which says a change cannot reclassify its own files.

## Why it matters

In the hook, generated is in SKIPPED: the added function is exempt from uncovered.

## Mitigation

A base strauss-class=source pins the file. Suggested: a banner lowers only a new file or one whose base blob, read with showAtRev, carries the same banner.

## Verification

None.

Informs [requirement.classify-attributes-read-at-base](requirement.classify-attributes-read-at-base.md).
