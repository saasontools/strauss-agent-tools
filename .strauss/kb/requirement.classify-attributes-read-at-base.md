---
type: requirement
title: >-
  File classes come from .gitattributes at the base commit, so a change cannot
  reclassify its own files
description: >-
  A branch that marks the file it changes `linguist-generated` would otherwise
  lower its own review.
tags:
  - review
  - "review:security"
sources:
  - id: saa-810
    resource: "https://linear.app/saason/issue/SAA-810"
generated:
  by: mcp
  at: "2026-09-15T15:30:23.025Z"
verified:
  - by: unknown
    at: "2026-09-15T15:33:12.723Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:34:54.637Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:37:44.546Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:38:15.847Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:45:17.733Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: "agent:performance"
    at: "2026-09-15T15:47:10.761Z"
    note: >-
      checkAttr passes every path on stdin -z in one spawn; a second runs only
      on git's own failure. 124 range paths at c5e9a66: 41.6 ms median on this
      machine.
  - by: unknown
    at: "2026-09-15T15:48:13.034Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T15:49:24.572Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:02:41.269Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:04:32.814Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:06:30.882Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:13:13.583Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:22:50.762Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:25:36.918Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
  - by: unknown
    at: "2026-09-15T16:35:46.238Z"
    note: "anchor-resolve: 1/1 anchors match (tree-sitter resolver)"
strauss_anchors:
  - file: packages/code-diff/src/classify/attributes.ts
    symbol: readAttributes
    hash: "sha256:88b811772b45f7da10219f8ad4b8cc6514fad0230bce4548ab2eac4dd5c31765"
    hash_kind: ast
    resolved_at: "2026-09-15T16:22:37.428Z"
    lines: 29
    resolver: tree-sitter
strauss_links:
  - target: test-obligation.classify-ignores-branch-attributes
    rel: verified_by
strauss_status: proposed
---

## Claim

One `git check-attr --source=<base> --stdin` over every changed path; `linguist-generated`/`linguist-vendored` → generated, `linguist-documentation` → docs, `strauss-class=test|ci|config|lockfile` → that class. git before 2.40 has no `--source`: the working tree answers and the classifier's notes say so.

## Evidence

SAA-810, `.gitattributes` in the classifier.

## Implication

A new attribute takes effect once it is merged.

Verified by [test-obligation.classify-ignores-branch-attributes](test-obligation.classify-ignores-branch-attributes.md).

[^saa-810]: https://linear.app/saason/issue/SAA-810
