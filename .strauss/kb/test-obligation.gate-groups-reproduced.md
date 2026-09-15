---
type: test-obligation
title: >-
  The review gate reproduces every fixture scenario's gate groups against the
  new classify
description: >-
  The plugin's scripts are unchanged, but the classes they read come from the
  classify CLI this change rewrites.
tags:
  - review
generated:
  by: mcp
  at: "2026-09-15T15:29:53.286Z"
verified:
  - by: "agent:correctness"
    at: "2026-09-15T15:46:26.625Z"
    note: >-
      After the build, node --test fixture.spec.mjs: 14 pass, 0 fail,
      head-attribute-ignored included.
  - by: "agent:correctness"
    at: "2026-09-15T16:12:10.368Z"
    note: >-
      At 8f85584: built strauss-kb with --skip-nx-cache, then ran node --test
      plugins/strauss-kb-review/hooks/scripts/fixture.spec.mjs: 14 of 14 passed.
      git diff c5e9a66..HEAD -- plugins/ is empty.
strauss_anchors:
  - file: plugins/strauss-kb-review/hooks/scripts/fixture.spec.mjs
    symbol: reportOn
    hash: "sha256:d397eddd98c5adc70cdb3b34cb69eda433a09ffee73904d4869fdf82d58ca8b4"
    hash_kind: ast
    resolved_at: "2026-09-15T15:34:41.591Z"
    lines: 26
    resolver: tree-sitter
strauss_status: open
---

## Obligation

`--report` over every companion-fixture branch, with the workspace CLI, blocks on exactly the groups each expected.json names — including the new head-attribute-ignored.

## Why it matters

A class that moved under the hook shows up as a new or missing gate group, which is a plugin behaviour change.

## How to verify

pnpm nx run @saasontools/strauss-kb:build && node --test plugins/strauss-kb-review/hooks/scripts/fixture.spec.mjs
