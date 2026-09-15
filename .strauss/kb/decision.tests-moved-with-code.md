---
type: decision
title: "Tests for the moved code moved with it, rather than staying in strauss-kb"
description: >-
  strauss-kb's drift/git.spec.ts and half of classify/classify.spec.ts tested
  code that now lives in code-diff.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T15:31:53.771Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/classify/classify.spec.ts
    hash: "sha256:5d0ec84adb7d903e92d618703e3119d319560cd1603d6d23b77a0526be675632"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:38.484Z"
    lines: 191
  - file: packages/strauss-kb/src/drift/git.spec.ts
strauss_links:
  - target: fact.diff-reader-moved-to-code-diff
    rel: related_to
strauss_status: accepted
---

## Decision

Tests for the moved code moved with it, rather than staying in strauss-kb

## Rationale

strauss-kb's drift/git.spec.ts and half of classify/classify.spec.ts tested code that now lives in code-diff.

## Rejected

Keeping them in strauss-kb as well: the same code tested twice across packages, and the copy in strauss-kb testing it only through a re-export.

## Impact

readRangeDiff's refusal tests are code-diff/src/repo/diff.spec.ts, unchanged. The path-table, rename and boilerplate cases are code-diff/src/classify/classify.spec.ts, rewritten for the new rules — the dropped rows now assert `source`. strauss-kb keeps the review:* override cases and adds one for an override beating an attribute.

Relates to [fact.diff-reader-moved-to-code-diff](fact.diff-reader-moved-to-code-diff.md).
