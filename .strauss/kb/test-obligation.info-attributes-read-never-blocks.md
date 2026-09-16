---
type: test-obligation
title: A FIFO at info/attributes neither blocks classify nor pins the read
description: Both our read and git's own check-attr opened that file and waited on a FIFO.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:46:18.762Z"
strauss_anchors:
  - file: packages/git-guard/src/check-attr.spec.ts
    hash: "sha256:fc760a7c7da77123b70942b6c27414108aec252af7e0e0334f209c691c7d756b"
    hash_kind: raw
    resolved_at: "2026-09-15T16:47:36.390Z"
    lines: 169
strauss_links:
  - target: risk.info-attributes-read-blocks-on-fifo
    rel: satisfies
strauss_status: open
---

## Obligation

With a FIFO at .git/info/attributes, checkAttr returns within five seconds, unpinned and local, without spawning check-attr.

## Why it matters

classify runs inside the Stop hook's wall-clock budget.

## How to verify

cd packages/git-guard && pnpm vitest run src/check-attr.spec.ts -t FIFO

Satisfies [risk.info-attributes-read-blocks-on-fifo](risk.info-attributes-read-blocks-on-fifo.md).
