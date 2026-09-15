---
type: test-obligation
title: A class is lowered only by attributes read at the base
description: >-
  An unresolvable base and an unpinned read both let a branch's own attributes
  decide.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:00:26.256Z"
verified:
  - by: unknown
    at: "2026-09-15T16:01:51.130Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:02:44.726Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:04:36.714Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:06:33.640Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: "agent:security"
    at: "2026-09-15T16:11:24.962Z"
    note: >-
      Ran both commands at 8f85584: check-attr.spec 7/7, attributes.spec pass.
      check-attr.ts falls back only on /unknown option/; readAttributes keeps
      only strauss-class=source unpinned.
  - by: "agent:correctness"
    at: "2026-09-15T16:12:10.666Z"
    note: >-
      At 8f85584, what the body claims holds. checkAttr falls back only on
      /unknown option/ and reads nothing for no-such-branch. readAttributes
      keeps only strauss-class=source when unpinned. notesFor names the base.
      git-guard passed 40, code-diff passed 104. What the title claims does not
      hold: see risk.pinned-attribute-read-honours-local-attribute-files.
  - by: unknown
    at: "2026-09-15T16:13:17.281Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:22:54.832Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:25:40.515Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:35:50.733Z"
    note: "anchor-resolve: 2/2 anchors match (whole-file)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.spec.ts
    hash: "sha256:7b0d1db6566fb5656156b12ad687505422ba2b30fe282062b309392894c2297c"
    hash_kind: raw
    resolved_at: "2026-09-15T16:47:42.639Z"
    lines: 322
  - file: packages/git-guard/src/check-attr.spec.ts
    hash: "sha256:fc760a7c7da77123b70942b6c27414108aec252af7e0e0334f209c691c7d756b"
    hash_kind: raw
    resolved_at: "2026-09-15T16:47:42.640Z"
    lines: 169
strauss_links:
  - target: risk.check-attr-unresolvable-base-reads-branch-attributes
    rel: satisfies
  - target: risk.classify-unpinned-attributes-lower-classes
    rel: satisfies
strauss_status: open
---

## Obligation

checkAttr reads nothing for a source git cannot resolve, and falls back to the working tree only when git rejects --source; readAttributes keeps only strauss-class=source and turns the table off when the read is unpinned; classifyFiles names the reason in a note.

## Why it matters

Otherwise `src/** linguist-generated` added on the branch classifies its own change `generated`.

## How to verify

cd packages/git-guard && pnpm vitest run src/check-attr.spec.ts; cd packages/code-diff && pnpm vitest run src/classify/attributes.spec.ts

Satisfies [risk.check-attr-unresolvable-base-reads-branch-attributes](risk.check-attr-unresolvable-base-reads-branch-attributes.md).

Satisfies [risk.classify-unpinned-attributes-lower-classes](risk.classify-unpinned-attributes-lower-classes.md).
