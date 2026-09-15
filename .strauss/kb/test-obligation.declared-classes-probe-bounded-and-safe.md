---
type: test-obligation
title: >-
  The declared-classes probe reads only the .gitattributes that can govern the
  diff, and a failure keeps the table off
description: >-
  A whole-tree git grep timed out at 1M files, and any failure turned the
  default table on.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:00:31.661Z"
verified: []
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.spec.ts
    hash: "sha256:020f86b7c41c5f5436c0a8f844eb3bf166930e6befb6d8ed9742b62456f6501c"
    hash_kind: raw
    resolved_at: "2026-09-15T16:01:30.791Z"
    lines: 269
strauss_links:
  - target: risk.declares-classes-failure-turns-path-table-on
    rel: satisfies
  - target: risk.classify-base-grep-walks-whole-tree
    rel: satisfies
strauss_status: open
---

## Obligation

attributeFiles lists the root's .gitattributes and one per directory above a changed path; a class above a changed file declares, one in an unrelated directory does not; a failing cat-file leaves repoDeclares true with probeFailed set and a note.

## Why it matters

The probe decides whether the default table may lower classes at all.

## How to verify

cd packages/code-diff && pnpm vitest run src/classify/attributes.spec.ts -t 'repoDeclares|attributeFiles'

Satisfies [risk.declares-classes-failure-turns-path-table-on](risk.declares-classes-failure-turns-path-table-on.md).

Satisfies [risk.classify-base-grep-walks-whole-tree](risk.classify-base-grep-walks-whole-tree.md).
