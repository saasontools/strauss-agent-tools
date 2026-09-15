---
type: open-question
title: >-
  Why did the no-git test change on its move, where
  decision.tests-moved-with-code says unchanged?
description: A moved test should be identical or say why not.
tags:
  - review
  - "review:correctness"
generated:
  by: "agent:correctness"
  at: "2026-09-15T15:46:23.906Z"
verified:
  - by: unknown
    at: "2026-09-15T15:49:24.192Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:02:41.057Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:04:32.475Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:06:30.670Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:13:13.387Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:22:28.866Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:22:50.551Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:25:36.711Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:35:46.017Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
strauss_anchors:
  - file: packages/code-diff/src/repo/diff.spec.ts
    hash: "sha256:141d1471d25308df93da2b90549a9eaffa62b62dcb1dec6cb06b1d2e3aaaebd9"
    hash_kind: raw
    resolved_at: "2026-09-15T16:02:26.612Z"
    lines: 110
strauss_links:
  - target: decision.tests-moved-with-code
    rel: informs
strauss_status: resolved
strauss_answered:
  by: mcp
  at: "2026-09-15T16:00:48.797Z"
strauss_owner: "agent:author"
---

## Question

code-diff/src/repo/diff.spec.ts 'no git on PATH is its own reason' now sets PATH to an empty temp directory; strauss-kb's drift/git.spec.ts set it to ''. On node 24 and macOS, both the old and the new spawn options give ENOENT for PATH=''. Which platform or runner needed the change?

## Why it matters

The record claims the refusal tests moved unchanged; an unexplained edit to a moved test is how a weakened assertion slips through.

## Default assumption

The change is harmless setup; the assertion is the same.

Informs [decision.tests-moved-with-code](decision.tests-moved-with-code.md).

## Answer

No platform needed it. The no-git case is back to PATH="" as drift/git.spec.ts had it. The rest of the setup moved to the package's tempRepo helper, which keeps the host's git config out; every assertion is unchanged. decision.tests-moved-assertions-unchanged supersedes the record that said "unchanged" outright.
