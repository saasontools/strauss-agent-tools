---
type: test-obligation
title: The banner read follows no symlink and never blocks on a FIFO
description: A committed symlink to a FIFO hung classify and kept the process alive.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:00:35.196Z"
verified:
  - by: unknown
    at: "2026-09-15T16:01:50.447Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:02:44.140Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:04:35.973Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:06:33.160Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: "agent:security"
    at: "2026-09-15T16:11:25.101Z"
    note: >-
      Ran -t 'symlink' at 8f85584: 1 pass, 5 s timeout. read.ts opens
      O_NOFOLLOW|O_NONBLOCK and reads only isFile(). O_NOFOLLOW covers the last
      component only; a directory symlink is still followed, leaking one bit, no
      hang.
  - by: "agent:correctness"
    at: "2026-09-15T16:12:09.808Z"
    note: >-
      At 8f85584: read classify/read.ts header(), which opens with
      O_RDONLY|O_NOFOLLOW|O_NONBLOCK and reads only when fstat isFile. Ran
      vitest -t symlink in code-diff: 1 passed, within the 5 s timeout.
  - by: "agent:performance"
    at: "2026-09-15T16:12:49.630Z"
    note: >-
      Ran pnpm vitest run src/classify/attributes.spec.ts -t symlink in
      packages/code-diff at 8f85584: 1 pass under its 5 s ceiling.
  - by: unknown
    at: "2026-09-15T16:13:16.793Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:22:54.339Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.spec.ts
    hash: "sha256:6668fe938a1dc53ebcfabaa3514389d51c6193372c3d5fa320a15962a32e6de4"
    hash_kind: raw
    resolved_at: "2026-09-15T16:22:39.352Z"
    lines: 306
strauss_links:
  - target: risk.classify-header-read-follows-symlink-to-fifo
    rel: satisfies
strauss_status: open
---

## Obligation

classifyFiles over a symlink to a FIFO and a symlink to a bannered file returns within five seconds and classifies both `source`.

## Why it matters

classify runs inside the Stop hook's wall-clock budget.

## How to verify

cd packages/code-diff && pnpm vitest run src/classify/attributes.spec.ts -t 'symlink'

Satisfies [risk.classify-header-read-follows-symlink-to-fifo](risk.classify-header-read-follows-symlink-to-fifo.md).
