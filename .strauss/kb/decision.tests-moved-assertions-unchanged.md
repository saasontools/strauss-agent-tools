---
type: decision
title: "Tests for the moved code moved with it: same assertions, the package's setup"
description: >-
  strauss-kb's drift/git.spec.ts and half of classify/classify.spec.ts tested
  code that now lives in code-diff.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:01:09.217Z"
verified: []
strauss_anchors:
  - file: packages/strauss-kb/src/classify/classify.spec.ts
    hash: "sha256:5d0ec84adb7d903e92d618703e3119d319560cd1603d6d23b77a0526be675632"
    hash_kind: raw
    resolved_at: "2026-09-15T16:01:32.636Z"
    lines: 191
  - file: packages/strauss-kb/src/drift/git.spec.ts
strauss_status: accepted
strauss_supersedes:
  - decision.tests-moved-with-code
---

## Decision

Tests for the moved code moved with it: same assertions, the package's setup

## Rationale

strauss-kb's drift/git.spec.ts and half of classify/classify.spec.ts tested code that now lives in code-diff.

## Rejected

Keeping them in strauss-kb as well: the same code tested twice across packages, the strauss-kb copy only through a re-export.

## Impact

readRangeDiff's refusal tests are code-diff/src/repo/diff.spec.ts with the same assertions and the same PATH="" for the no-git case; their setup uses the package's tempRepo, which keeps the host's git config out. The path-table, rename and boilerplate cases are code-diff/src/classify/classify.spec.ts, rewritten for the new rules — the dropped rows now assert `source`. strauss-kb keeps the review:* override cases and adds one for an override beating an attribute.

Relates to [fact.diff-reader-moved-to-code-diff](fact.diff-reader-moved-to-code-diff.md).
