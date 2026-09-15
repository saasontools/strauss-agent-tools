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
  - by: unknown
    at: "2026-09-15T15:33:14.404Z"
    note: "anchor-resolve: 1/1 anchors match (whole-file)"
  - by: unknown
    at: "2026-09-15T15:34:56.497Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:37:46.242Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:38:17.560Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:45:20.249Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:correctness"
    at: "2026-09-15T15:46:26.625Z"
    note: >-
      After the build, node --test fixture.spec.mjs: 14 pass, 0 fail,
      head-attribute-ignored included.
  - by: unknown
    at: "2026-09-15T15:48:16.398Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:49:28.322Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:01:51.560Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:45.173Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:37.202Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:33.973Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:correctness"
    at: "2026-09-15T16:12:10.368Z"
    note: >-
      At 8f85584: built strauss-kb with --skip-nx-cache, then ran node --test
      plugins/strauss-kb-review/hooks/scripts/fixture.spec.mjs: 14 of 14 passed.
      git diff c5e9a66..HEAD -- plugins/ is empty.
  - by: unknown
    at: "2026-09-15T16:13:17.622Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:33.294Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:55.199Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:40.863Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:51.091Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:47:36.185Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
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
