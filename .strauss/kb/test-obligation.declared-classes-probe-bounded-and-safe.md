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
verified:
  - by: unknown
    at: "2026-09-15T16:01:51.366Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:02:44.979Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:04:36.967Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:06:33.828Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: "agent:security"
    at: "2026-09-15T16:11:25.229Z"
    note: >-
      Ran -t 'repoDeclares|attributeFiles' at 8f85584: 8 pass. declaresClasses:
      base shape-checked, one cat-file --batch over attributeFiles, null on
      failure, so repoDeclares stays true.
  - by: "agent:correctness"
    at: "2026-09-15T16:12:10.798Z"
    note: >-
      At 8f85584, the body holds. attributeFiles lists the root plus the
      ancestor .gitattributes files. The unrelated-directory case passes, and
      the fakeGit cat-file failure gives probeFailed and repoDeclares true.
      Echoed object names count as declarations: see
      risk.declares-classes-probe-matches-echoed-object-names.
  - by: "agent:performance"
    at: "2026-09-15T16:12:49.467Z"
    note: >-
      Ran pnpm vitest run src/classify/attributes.spec.ts -t
      'repoDeclares|attributeFiles' in packages/code-diff at 8f85584: 8 pass.
      Probe input is bounded by the directories above changed paths: 42 lines
      for c5e9a66..HEAD, 10 101 for a 10k-file change.
  - by: unknown
    at: "2026-09-15T16:13:17.458Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:22:55.044Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.spec.ts
    hash: "sha256:6668fe938a1dc53ebcfabaa3514389d51c6193372c3d5fa320a15962a32e6de4"
    hash_kind: raw
    resolved_at: "2026-09-15T16:22:39.726Z"
    lines: 306
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
