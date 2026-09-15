---
type: test-obligation
title: A class is lowered only by attributes read at the base
description: >-
  An unresolvable base and an unpinned read both let a branch's own attributes
  decide.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:00:26.256Z"
verified:
  - by: unknown
    at: "2026-09-15T16:01:51.130Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.spec.ts
    hash: "sha256:020f86b7c41c5f5436c0a8f844eb3bf166930e6befb6d8ed9742b62456f6501c"
    hash_kind: raw
    resolved_at: "2026-09-15T16:01:30.455Z"
    lines: 269
  - file: packages/git-guard/src/check-attr.spec.ts
    hash: "sha256:15abe6e4361ebeacc5fab8438a6544f89f44f0f4ec77c81663d2271adb28e0e9"
    hash_kind: raw
    resolved_at: "2026-09-15T16:01:30.459Z"
    lines: 94
strauss_links:
  - target: risk.check-attr-unresolvable-base-reads-branch-attributes
    rel: satisfies
  - target: risk.classify-unpinned-attributes-lower-classes
    rel: satisfies
strauss_status: open
---

## Obligation

checkAttr reads nothing for a source git cannot resolve, and falls back to the working tree only when git rejects --source; readAttributes keeps only strauss-class=source and turns the table off when the read is unpinned; classifyFiles names the reason in a note.

## Why it matters

Otherwise `src/** linguist-generated` added on the branch classifies its own change `generated`.

## How to verify

cd packages/git-guard && pnpm vitest run src/check-attr.spec.ts; cd packages/code-diff && pnpm vitest run src/classify/attributes.spec.ts

Satisfies [risk.check-attr-unresolvable-base-reads-branch-attributes](risk.check-attr-unresolvable-base-reads-branch-attributes.md).

Satisfies [risk.classify-unpinned-attributes-lower-classes](risk.classify-unpinned-attributes-lower-classes.md).
