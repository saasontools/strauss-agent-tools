---
type: test-obligation
title: A branch's own .gitattributes line does not reclassify the file it changes
description: >-
  Reading attributes at the base is the only guard against a change lowering its
  own review.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T15:29:43.201Z"
verified:
  - by: unknown
    at: "2026-09-15T15:33:14.168Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
strauss_anchors:
  - file: fixtures/companion-repo/scenarios/head-attribute-ignored/expected.json
    hash: "sha256:71406a56e33d99a7bba919bfd585d6ffbe8383986e8076504d1c46c0f0156d09"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:33.215Z"
    lines: 10
strauss_status: open
---

## Obligation

The companion fixture's head-attribute-ignored branch adds `src/services/** linguist-generated` and changes chunkIds in one commit; `classify --git main...head-attribute-ignored` must answer `source` for tenant.service.ts, and the gate must still report `uncovered`.

## Why it matters

A classifier that reads head attributes calls the file `generated` and the change routes `auto`.

## How to verify

cd packages/strauss-kb && pnpm vitest run src/commands/classify.spec.ts -t 'companion fixture'; cd packages/code-diff && pnpm vitest run src/classify/attributes.spec.ts; node --test plugins/strauss-kb-review/hooks/scripts/fixture.spec.mjs
