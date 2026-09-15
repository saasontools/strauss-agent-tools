---
type: risk
title: >-
  declaresClasses greps the whole base tree: seconds at 200k files, killed at
  1M, and the default table then applies silently
description: >-
  classify runs on every Stop through the review hook; its cost now grows with
  the repository and its timeout flips the class table.
tags:
  - review
  - "review:performance"
generated:
  by: "agent:performance"
  at: "2026-09-15T15:47:10.304Z"
verified:
  - by: unknown
    at: "2026-09-15T15:49:25.227Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: declaresClasses
    hash: "sha256:356820949270ab63bc22d912c752abcc1157326650168d82535105ac2eab8022"
    hash_kind: ast
    resolved_at: "2026-09-15T15:48:13.591Z"
    lines: 22
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/read.ts
    symbol: classifyFiles
    hash: "sha256:4702d9288510f371e929013864abd6f24c4a77b1f113d623a9aa8181da351b74"
    hash_kind: ast
    resolved_at: "2026-09-15T15:48:13.597Z"
    lines: 34
    resolver: tree-sitter
strauss_links:
  - target: decision.default-table-only-without-declared-classes
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

`git grep -q … <base> -- ':(top,glob)**/.gitattributes'` walks every path in the base tree, and a root `.gitattributes` that declares does not cut it short. Measured (Apple git 2.50.1, synthetic repos, one blob): 653 files 34.5 ms; 200k files 1.7–2.2 s, with or without a declaring root file; 1M files 8.4–9.5 s, and under runGit's 10 s timeout it was SIGTERMed at 10 001 ms. `ls-tree -r --name-only <base> | grep` over the same trees: 107 ms at 200k, 392 ms at 1M. declaresClasses returns `result.ok`, so a timeout, an unreadable base and no match all answer false, and classifyFiles adds no note.

## Why it matters

The hook spawns `classify --git` on every Stop with a 10 s per-call timeout inside a 45 s wall: at 1M files the grep alone spends the call and the hook falls back to builtin. Called directly (CLI, kb_classify), a timed-out grep turns the default table on in a repo that declares classes, lowering test, docs, lockfile and ci paths.

## Mitigation

None in the diff. List `.gitattributes` paths with `ls-tree -r --name-only <base>` and grep only those; treat a timeout or failure, unlike exit 1, as declared, with a note.

## Verification

A code-diff spec where the grep times out asserts repoDeclares true and a note; a timing on a 200k-file fixture recorded beside this risk.

Informs [decision.default-table-only-without-declared-classes](decision.default-table-only-without-declared-classes.md).
