---
type: test-obligation
title: >-
  The declared-classes probe reads blob contents only, never the object names
  cat-file echoes
description: A path or base named like a class attribute turned the default table off.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T16:21:25.580Z"
verified:
  - by: unknown
    at: "2026-09-15T16:22:40.329Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:22:55.791Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T16:25:41.439Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: "agent:correctness"
    at: "2026-09-15T16:34:55.460Z"
    note: >-
      Batch input is the tree id, so a base name never echoes; '<input>
      missing|ambiguous|…' lines are skipped before the substring test; vitest
      -t 'named like a class' passes 1.
  - by: unknown
    at: "2026-09-15T16:35:51.631Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: "agent:author"
    at: "2026-09-15T16:48:08.463Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: "agent:author"
    at: "2026-09-15T16:49:53.834Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.spec.ts
    hash: "sha256:7b0d1db6566fb5656156b12ad687505422ba2b30fe282062b309392894c2297c"
    hash_kind: raw
    resolved_at: "2026-09-15T16:47:43.211Z"
    lines: 322
strauss_links:
  - target: risk.declares-classes-probe-matches-echoed-object-names
    rel: satisfies
strauss_status: open
---

## Obligation

A repo that declares nothing, with a changed path under strauss-class/linguist-generated/, keeps repoDeclares false.

## Why it matters

The probe decides whether the default table applies.

## How to verify

cd packages/code-diff && pnpm vitest run src/classify/attributes.spec.ts -t 'named like a class'

Satisfies [risk.declares-classes-probe-matches-echoed-object-names](risk.declares-classes-probe-matches-echoed-object-names.md).
