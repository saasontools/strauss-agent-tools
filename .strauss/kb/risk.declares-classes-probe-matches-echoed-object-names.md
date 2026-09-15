---
type: risk
title: >-
  declaresClasses searches cat-file's whole stdout, so a base or directory named
  like a class attribute turns the table off
description: >-
  cat-file --batch echoes a missing object's name, and the probe
  substring-matches that echo as if it were .gitattributes text.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-15T16:12:09.670Z"
verified:
  - by: unknown
    at: "2026-09-15T16:22:52.881Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:38.609Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:48.353Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: declaresClasses
    hash: "sha256:bbb45d4fdc66deaf5533bb02bff348b0d0c9a28d114683c4f17e2f7d3a07b5ff"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:38.936Z"
    lines: 37
    resolver: tree-sitter
strauss_links:
  - target: decision.default-table-only-on-a-read-undeclared-base
    rel: informs
  - target: test-obligation.declared-classes-probe-bounded-and-safe
    rel: informs
strauss_status: open
strauss_materiality: non-blocking
strauss_confidence: high
---

## Risk

cat-file --batch prints `<base>:<dir>/.gitattributes missing` for every absent file, and declaresClasses runs CLASS_ATTRIBUTES.some(name => stdout.includes(name)) over all of stdout. A changed path under strauss-classify/ echoes `strauss-class`. So does any base whose name contains it, such as the branch strauss-class-work, or one containing linguist-generated. Reproduced in a repo with no attributes: classifyFiles over src/b.spec.ts alone gives test (test-path). Add strauss-classify/a.spec.ts to the diff and both files become source (default). With base strauss-class-work, src/b.spec.ts is source. None of these runs gives a note.

## Why it matters

decision.default-table-only-on-a-read-undeclared-base keeps the table for repositories that declare nothing. One file in the diff under such a directory, or a base branch with such a name, silently turns the table off for every file. The direction is more review, never less, so the defect is a wrong answer rather than a bypass.

## Mitigation

None in the diff. Parse the batch output per object: skip `<name> missing` lines, and read only the <size> bytes after each `<sha> blob <size>` header. Or run --batch-check first and cat only the blobs that exist.

## Verification

A repoDeclares case where the changed path is under a directory named strauss-classify and the base has no .gitattributes expects false.

Informs [decision.default-table-only-on-a-read-undeclared-base](decision.default-table-only-on-a-read-undeclared-base.md).

Informs [test-obligation.declared-classes-probe-bounded-and-safe](test-obligation.declared-classes-probe-bounded-and-safe.md).
