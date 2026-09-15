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
strauss_anchors:
  - file: packages/git-guard/src/check-attr.spec.ts
    hash: "sha256:fc760a7c7da77123b70942b6c27414108aec252af7e0e0334f209c691c7d756b"
    hash_kind: raw
    resolved_at: "2026-09-15T16:47:43.022Z"
    lines: 169
  - file: packages/code-diff/src/classify/attributes.spec.ts
    hash: "sha256:7b0d1db6566fb5656156b12ad687505422ba2b30fe282062b309392894c2297c"
    hash_kind: raw
    resolved_at: "2026-09-15T16:47:43.023Z"
    lines: 322
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
