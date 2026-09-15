---
type: risk
title: The review hook's classes change through the classify CLI it spawns
description: >-
  SAA-810 promises no plugin behaviour change; the scripts are unchanged, but
  the answers they read are not.
tags:
  - review
  - "review:compat"
generated:
  by: mcp
  at: "2026-09-15T15:32:08.495Z"
verified:
  - by: unknown
    at: "2026-09-15T15:33:13.648Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:34:55.616Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:37:45.477Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:38:16.818Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:45:19.240Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:correctness"
    at: "2026-09-15T15:46:26.986Z"
    note: >-
      fixture.spec.mjs passes 14/14. The hook's classify() lets CLI rows
      override its own status-R rename, so pure renames now read source, as the
      risk says.
  - by: unknown
    at: "2026-09-15T15:48:15.205Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:49:27.057Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:01:49.633Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:43.402Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:35.135Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:32.560Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:13:15.971Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:31.637Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:53.523Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:39.228Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:49.005Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:47:33.867Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:48:05.046Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:author"
    at: "2026-09-15T16:49:50.444Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/classify.ts
    symbol: classifyDiff
    hash: "sha256:1bc230be8ea484a13f11d3efac1bdcab10904795605392b88af821958185b23c"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:39.153Z"
    lines: 6
    resolver: tree-sitter
strauss_links:
  - target: test-obligation.gate-groups-reproduced
    rel: verified_by
  - target: decision.fixture-declares-spec-tests
    rel: related_to
strauss_status: open
strauss_materiality: important
strauss_confidence: medium
---

## Risk

The hook takes the CLI's class for every path its own base-attribute read does not cover. Every path a removed rule used to catch — tests, config files, Dockerfile, .tf, LICENSE, boilerplate barrels, renames — is now `source` unless declared, and the hook's uncovered and anchor.file-only checks read it.

## Why it matters

A repo that declares some classes but not its tests gets file-only-anchor findings on test files, as the fixture's blocking-risk did before its tests were declared.

## Mitigation

The direction is always toward more review, never less. The fixture declares its tests; code-diff's draftGitattributes proposes the lines a repo needs; SAA-813 replaces the hook's class handling.

## Verification

The gate reproduces every fixture scenario's groups: test-obligation.gate-groups-reproduced.

Verified by [test-obligation.gate-groups-reproduced](test-obligation.gate-groups-reproduced.md).

Relates to [decision.fixture-declares-spec-tests](decision.fixture-declares-spec-tests.md).
