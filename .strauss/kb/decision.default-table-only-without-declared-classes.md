---
type: decision
title: >-
  The default path table applies only where no .gitattributes names a class
  attribute
description: >-
  SAA-810 keeps a few-line table for repos with no attributes. As a per-path
  fallback it would still guess test, docs and lockfile for paths a repo that
  opted in simply missed — a lowered class with nothing in the repo behind it.
tags:
  - review
sources:
  - id: saa-810
    resource: "https://linear.app/saason/issue/SAA-810"
generated:
  by: mcp
  at: "2026-09-15T15:31:24.857Z"
verified:
  - by: unknown
    at: "2026-09-15T15:33:08.484Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:34:50.015Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:37:40.580Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:38:12.026Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:45:14.077Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:48:08.840Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:49:19.525Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:36.727Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:27.232Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:26.990Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:13:10.044Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:46.806Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:33.097Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:42.216Z"
    note: "anchor-resolve: 7/7 anchors match (regex + tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: declaresClasses
    hash: "sha256:bbb45d4fdc66deaf5533bb02bff348b0d0c9a28d114683c4f17e2f7d3a07b5ff"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:36.814Z"
    lines: 37
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/rules.ts
    symbol: pathRule
    hash: "sha256:981101a7519cf0706373db72457b28768f40f4b431139766de1ffe4b4ac4bbf2"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:36.913Z"
    lines: 4
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/rules.ts
    symbol: attributeVerdict
    hash: "sha256:de9892071971372bb0319629aafe6796fe5eb511fa9cfd7c8ec3b69b746f74f3"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:36.915Z"
    lines: 17
    resolver: tree-sitter
  - file: packages/code-diff/src/classify/model.ts
    symbol: Verdict
    hash: "sha256:1fdb6f28162b29b852347684fb4f8294dcbdf013ff0a987bf940676a2f707cff"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:36.918Z"
    lines: 1
    resolver: regex
  - file: packages/code-diff/src/draft-gitattributes.ts
    symbol: draftGitattributes
    hash: "sha256:b28185de475449997fe742007ac2113ab9268d60f1ed5affa9eef608d3fc99a6"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:36.920Z"
    lines: 10
    resolver: tree-sitter
  - file: packages/strauss-kb/src/classify/classify.ts
    symbol: kbDeclared
    hash: "sha256:970a0146bf4f7d49ecec1d78702964c56ebdadad65dc7a8586dadbf96146205a"
    hash_kind: ast
    resolved_at: "2026-09-15T15:32:36.923Z"
    lines: 24
    resolver: tree-sitter
  - file: packages/strauss-kb/src/classify/model.ts
    symbol: KbClassifyOptions
    hash: "sha256:6a9d7f22f1dc46f785d3f8e47406df5cda312fd9f6c64c6c0fc4eb2527230720"
    hash_kind: raw
    resolved_at: "2026-09-15T15:32:36.924Z"
    lines: 11
    resolver: regex
strauss_status: superseded
strauss_superseded_by: decision.default-table-only-on-a-read-undeclared-base
---

## Decision

The default path table applies only where no .gitattributes names a class attribute

## Rationale

SAA-810 keeps a few-line table for repos with no attributes. As a per-path fallback it would still guess test, docs and lockfile for paths a repo that opted in simply missed — a lowered class with nothing in the repo behind it.

## Rejected

The table as a per-path fallback after attributes; or no table at all, which classifies every file in an unconfigured repo `source`.

## Impact

One `git grep -F` over every .gitattributes at the base decides; a mention in a comment turns the table off too, the safe direction. The table keeps four rows — tests, CI directories, markdown, lock files. `strauss-class=source` is honoured beside test|ci|config|lockfile because it only raises scrutiny; draftGitattributes proposes the lines that replace the table. strauss-kb keeps only the review:* facts, as code-diff's Declared lookup.

[^saa-810]: https://linear.app/saason/issue/SAA-810
