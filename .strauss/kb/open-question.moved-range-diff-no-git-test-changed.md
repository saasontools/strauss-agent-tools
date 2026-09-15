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
strauss_anchors:
  - file: packages/code-diff/src/repo/diff.spec.ts
    hash: "sha256:405ec00dd1f87266a812b9f185040813e45b83ebb43232d3cbf5e9837f82c221"
    hash_kind: raw
    resolved_at: "2026-09-15T15:48:12.813Z"
    lines: 113
strauss_links:
  - target: decision.tests-moved-with-code
    rel: informs
strauss_status: open
strauss_owner: "agent:author"
---

## Question

code-diff/src/repo/diff.spec.ts 'no git on PATH is its own reason' now sets PATH to an empty temp directory; strauss-kb's drift/git.spec.ts set it to ''. On node 24 and macOS, both the old and the new spawn options give ENOENT for PATH=''. Which platform or runner needed the change?

## Why it matters

The record claims the refusal tests moved unchanged; an unexplained edit to a moved test is how a weakened assertion slips through.

## Default assumption

The change is harmless setup; the assertion is the same.

Informs [decision.tests-moved-with-code](decision.tests-moved-with-code.md).
