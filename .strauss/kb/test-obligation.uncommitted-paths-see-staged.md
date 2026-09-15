---
type: test-obligation
title: uncommittedPaths lists staged files as well as untracked and modified ones
description: A record the author staged but did not commit was invisible to it.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:00:39.836Z"
verified:
  - by: "agent:correctness"
    at: "2026-09-15T16:12:09.946Z"
    note: >-
      At 8f85584: uncommitted-paths.ts unions ls-files --others, diff
      --name-only and diff --cached --name-only. Ran repo.spec.ts -t
      uncommittedPaths: 1 passed.
strauss_anchors:
  - file: packages/code-diff/src/repo/repo.spec.ts
    hash: "sha256:2197bc0e27cf01301baf59bb08c863678e9a9c9bda36815501f522f1d21f4342"
    hash_kind: raw
    resolved_at: "2026-09-15T16:01:31.330Z"
    lines: 111
strauss_links:
  - target: risk.uncommitted-paths-miss-staged-changes
    rel: satisfies
strauss_status: open
---

## Obligation

A file added to the index under the dir appears in uncommittedPaths beside an untracked and a modified one.

## Why it matters

A coverage check built on it would miss the author's staged records.

## How to verify

cd packages/code-diff && pnpm vitest run src/repo/repo.spec.ts -t uncommittedPaths

Satisfies [risk.uncommitted-paths-miss-staged-changes](risk.uncommitted-paths-miss-staged-changes.md).
