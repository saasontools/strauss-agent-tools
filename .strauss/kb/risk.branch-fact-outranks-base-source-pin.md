---
type: risk
title: "A review:* fact written on the branch outranks the base's strauss-class=source"
description: >-
  A change can lower scrutiny on a file the repository pinned to source, which
  reading attributes at the base exists to prevent.
tags:
  - review
  - "review:security"
generated:
  by: "agent:security"
  at: "2026-09-15T16:11:24.829Z"
verified:
  - by: unknown
    at: "2026-09-15T16:22:50.982Z"
    note: "anchor-resolve: 2/2 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/classify.ts
    symbol: classifyFile
    hash: "sha256:29ba8b9893a3bdadc24ad544909a0adba224eeb79f938fc837a81a77ff311a9c"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:37.642Z"
    lines: 29
    resolver: tree-sitter
  - file: packages/strauss-kb/src/classify/classify.ts
    symbol: kbDeclared
    hash: "sha256:970a0146bf4f7d49ecec1d78702964c56ebdadad65dc7a8586dadbf96146205a"
    hash_kind: ast
    resolved_at: "2026-09-15T16:13:13.787Z"
    lines: 24
    resolver: tree-sitter
strauss_links:
  - target: requirement.classify-attributes-read-at-base
    rel: informs
strauss_status: open
strauss_materiality: important
strauss_confidence: high
---

## Risk

classifyFile takes `declared` before `attributes`, and kbDeclared admits any current review:generated|boilerplate|move fact, including one this diff adds. Reproduced on code-diff's dist: src/auth/login.ts with attribute strauss-class=source plus a file fact gives `generated (kb-override …)`; a hunk fact gives that hunk `rename`. classify.spec 'a declaration beats the attribute' pins the order, tested only against a lowering attribute.

## Why it matters

rules.ts says strauss-class=source raises scrutiny and never lowers it. The hook's attributeClass drops `source` (not in LOWERING), so the CLI's class stands, and generated and rename are in SKIPPED: a branch-written fact exempts a source-pinned file from `uncovered`, and the gate counts the fact as backing.

## Mitigation

The fact is a record in the diff that a reviewer reads. Suggested: a base strauss-class=source beats any declaration, or only facts present at the base lower a class.

## Verification

None. A classifyDiff case with attribute source and a lowering declaration should expect source.

Informs [requirement.classify-attributes-read-at-base](requirement.classify-attributes-read-at-base.md).
