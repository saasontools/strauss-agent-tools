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
strauss_anchors:
  - file: packages/git-guard/src/check-attr.ts
    symbol: checkAttr
    hash: "sha256:90d32e75ed62fa67a38019b3f391e0878e9f1aad4cce4a04654bf5499d8042fb"
    hash_kind: ast
    resolved_at: "2026-09-15T16:02:27.138Z"
    lines: 48
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/read.ts
    symbol: classifyFiles
    hash: "sha256:8f3ec93d579719f3cec76bbc91a2ed9a95649f6145ef9d31f762cb2b78fc6377"
    hash_kind: ast
    resolved_at: "2026-09-15T16:02:27.148Z"
    lines: 27
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
