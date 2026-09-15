---
type: test-obligation
title: Any attribute set in the clone's info/attributes makes every file source
description: >-
  An unset or a macro there lowers classes, or drops a base pin, without naming
  a class attribute.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:46:14.990Z"
verified:
  - by: "agent:author"
    at: "2026-09-15T16:47:43.403Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: "agent:author"
    at: "2026-09-15T16:48:08.092Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: "agent:author"
    at: "2026-09-15T16:49:53.469Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.spec.ts
    hash: "sha256:7b0d1db6566fb5656156b12ad687505422ba2b30fe282062b309392894c2297c"
    hash_kind: raw
    resolved_at: "2026-09-15T16:47:36.910Z"
    lines: 322
  - file: packages/git-guard/src/check-attr.spec.ts
    hash: "sha256:fc760a7c7da77123b70942b6c27414108aec252af7e0e0334f209c691c7d756b"
    hash_kind: raw
    resolved_at: "2026-09-15T16:47:36.911Z"
    lines: 169
strauss_links:
  - target: risk.local-attribute-unset-drops-base-source-pin
    rel: satisfies
  - target: risk.attribute-macro-in-info-attributes-lowers-pinned-read
    rel: satisfies
strauss_status: open
---

## Obligation

With `* !strauss-class` in .git/info/attributes and a declaration saying generated, classifyFiles returns source with a note naming the file; an unrelated `*.png binary` line counts too.

## Why it matters

One untracked line in the author's clone would otherwise lower every changed file.

## How to verify

cd packages/git-guard && pnpm vitest run src/check-attr.spec.ts; cd packages/code-diff && pnpm vitest run src/classify/attributes.spec.ts -t info/attributes

Satisfies [risk.local-attribute-unset-drops-base-source-pin](risk.local-attribute-unset-drops-base-source-pin.md).

Satisfies [risk.attribute-macro-in-info-attributes-lowers-pinned-read](risk.attribute-macro-in-info-attributes-lowers-pinned-read.md).
