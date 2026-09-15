---
type: test-obligation
title: >-
  A base strauss-class=source outranks any review:* declaration, for the file
  and every hunk
description: >-
  A fact the branch adds must not lower a file the repository pinned to full
  review.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:21:16.439Z"
verified:
  - by: "agent:correctness"
    at: "2026-09-15T16:34:55.163Z"
    note: >-
      Re-read classifyFile in code-diff classify/classify.ts: a base
      strauss-class=source (pin) is taken before declared.file and forces every
      hunk; vitest -t 'source pin' passes 1.
strauss_anchors:
  - file: packages/code-diff/src/classify/classify.spec.ts
    hash: "sha256:7f26ec859a1ea7a117171035c78b8be9d6f31f41aa08bf08c4a72663b3fd820f"
    hash_kind: raw
    resolved_at: "2026-09-15T16:22:34.332Z"
    lines: 219
strauss_links:
  - target: risk.branch-fact-outranks-base-source-pin
    rel: satisfies
strauss_status: open
---

## Obligation

classifyDiff with a `source` attribute and a declaration that says generated for the file and rename for a hunk returns `source` for both, with the attribute as the reason.

## Why it matters

In the hook, generated and rename skip the uncovered check.

## How to verify

cd packages/code-diff && pnpm vitest run src/classify/classify.spec.ts -t 'source pin'

Satisfies [risk.branch-fact-outranks-base-source-pin](risk.branch-fact-outranks-base-source-pin.md).
