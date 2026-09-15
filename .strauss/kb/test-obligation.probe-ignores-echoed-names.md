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
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.spec.ts
    hash: "sha256:6668fe938a1dc53ebcfabaa3514389d51c6193372c3d5fa320a15962a32e6de4"
    hash_kind: raw
    resolved_at: "2026-09-15T16:22:33.926Z"
    lines: 306
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
