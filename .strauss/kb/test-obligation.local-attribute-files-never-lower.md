---
type: test-obligation
title: A local attributes file never lowers a class read at the base
description: >-
  check-attr --source still applies the clone's .git/info/attributes and
  core.attributesFile.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:21:21.450Z"
verified:
  - by: unknown
    at: "2026-09-15T16:22:40.133Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:22:55.602Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:25:41.261Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:35:51.463Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
strauss_anchors:
  - file: packages/git-guard/src/check-attr.spec.ts
    hash: "sha256:1891ae5362e883d0b8c2f857c8789c87acbf54165809dde04467543427f5262b"
    hash_kind: raw
    resolved_at: "2026-09-15T16:22:33.737Z"
    lines: 135
  - file: packages/code-diff/src/classify/attributes.spec.ts
    hash: "sha256:6668fe938a1dc53ebcfabaa3514389d51c6193372c3d5fa320a15962a32e6de4"
    hash_kind: raw
    resolved_at: "2026-09-15T16:22:33.738Z"
    lines: 306
strauss_links:
  - target: risk.pinned-attribute-read-honours-local-attribute-files
    rel: satisfies
strauss_status: open
---

## Obligation

core.attributesFile is never read; a class attribute in .git/info/attributes unpins the read, so only strauss-class=source applies and classifyFiles notes the local file.

## Why it matters

One untracked line in the author's clone would otherwise mark every changed file generated.

## How to verify

cd packages/git-guard && pnpm vitest run src/check-attr.spec.ts; cd packages/code-diff && pnpm vitest run src/classify/attributes.spec.ts -t info/attributes

Satisfies [risk.pinned-attribute-read-honours-local-attribute-files](risk.pinned-attribute-read-honours-local-attribute-files.md).
